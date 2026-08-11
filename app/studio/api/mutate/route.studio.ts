import type { CvFile, MediaAsset } from '../../../lib/contentTypes';
import {
  appendMedia,
  createContactItem,
  createItem,
  createSection,
  deleteContactItem,
  deleteItem,
  deleteSection,
  planGarbage,
  readDoc,
  removeFiles,
  removeMediaRef,
  renameSection,
  reorderContactItems,
  reorderItems,
  reorderMedia,
  reorderSections,
  updateContactItem,
  updateContactLabel,
  updateItem,
  updateProfile,
  writeDoc,
} from '../../lib/cv-fs';
import { StudioError, assertLocalDev } from '../../lib/paths';
import { fail, ok } from '../../lib/respond';

/**
 * Every operation is read → transform → atomic write, with the caller's content
 * hash rejecting a stale overwrite.
 *
 * Ordering matters for anything that frees media: the JSON is written first and
 * files are deleted only afterwards, so a rejected write cannot destroy assets.
 */
export async function POST(req: Request) {
  try {
    assertLocalDev(req);
    const body = await req.json();
    const op = String(body?.op || '');
    const doc = await readDoc();

    let next: CvFile;
    let extra: Record<string, unknown> = {};
    /** Filenames this operation stopped referencing. */
    let freed: string[] = [];

    switch (op) {
      case 'profile.update':
        next = updateProfile(doc.cv, body.data ?? {});
        break;

      case 'section.reorder':
        next = reorderSections(doc.cv, body.order);
        break;
      case 'section.create': {
        const created = createSection(doc.cv, body.label);
        next = created.cv;
        extra = { sectionKey: created.key };
        break;
      }
      case 'section.rename':
        next = renameSection(doc.cv, body.sectionKey, body.label);
        break;
      case 'section.delete': {
        const removed = deleteSection(doc.cv, body.sectionKey);
        next = removed.cv;
        freed = removed.freed;
        break;
      }

      case 'item.reorder':
        next = reorderItems(doc.cv, body.sectionKey, body.order);
        break;
      case 'item.create': {
        const created = createItem(doc.cv, body.sectionKey, body.data ?? {});
        next = created.cv;
        extra = { itemId: created.itemId };
        break;
      }
      case 'item.update':
        next = updateItem(doc.cv, body.sectionKey, body.itemId, body.data ?? {});
        break;
      case 'item.delete': {
        const removed = deleteItem(doc.cv, body.sectionKey, body.itemId);
        next = removed.cv;
        freed = removed.freed;
        break;
      }

      case 'contact.rename':
        next = updateContactLabel(doc.cv, body.label);
        break;
      case 'contact.reorder':
        next = reorderContactItems(doc.cv, body.order);
        break;
      case 'contact.create': {
        const created = createContactItem(doc.cv, body.data ?? {});
        next = created.cv;
        extra = { itemId: created.itemId };
        break;
      }
      case 'contact.update':
        next = updateContactItem(doc.cv, body.itemId, body.data ?? {});
        break;
      case 'contact.delete':
        next = deleteContactItem(doc.cv, body.itemId);
        break;

      case 'media.reorder':
        next = reorderMedia(doc.cv, body.sectionKey, body.itemId, body.order);
        break;
      case 'media.remove': {
        const removed = removeMediaRef(doc.cv, body.sectionKey, body.itemId, body.file);
        next = removed.cv;
        freed = removed.freed;
        break;
      }
      case 'media.attach':
        // Reuse an asset already in the pool — the point of a shared pool.
        next = appendMedia(doc.cv, body.sectionKey, body.itemId, body.files ?? []);
        break;

      default:
        throw new StudioError(`Unknown operation: ${op}`);
    }

    let assets: Record<string, MediaAsset> = doc.assets;
    let remove: string[] = [];
    if (freed.length) {
      // Pure: works out what is now unreferenced without touching disk.
      const plan = planGarbage(next, doc.gallery, doc.assets, freed);
      assets = plan.assets;
      remove = plan.remove;
    }

    const hash = await writeDoc(next, assets, body.hash);
    // Only once the document is safely on disk.
    const deleted = remove.length ? await removeFiles(remove) : [];

    return ok({ hash, ...extra, deletedAssets: deleted, keptShared: freed.filter((f) => !remove.includes(f)) });
  } catch (error) {
    return fail(error);
  }
}
