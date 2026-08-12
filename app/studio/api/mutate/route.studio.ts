import type { CvFile, MediaAsset } from '../../../lib/contentTypes';
import type { GalleryFile } from '../../../lib/galleryTypes';
import {
  appendMedia,
  createContactItem,
  createGalleryEntry,
  createItem,
  createSection,
  deleteContactItem,
  deleteGalleryEntry,
  deleteItem,
  deleteSection,
  planGarbage,
  readDoc,
  removeFiles,
  removeMediaRef,
  renameSection,
  reorderContactItems,
  reorderGallery,
  reorderItems,
  reorderMedia,
  reorderSections,
  setGalleryFile,
  updateAsset,
  updateContactItem,
  updateContactLabel,
  updateGalleryEntry,
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

    let cv: CvFile = doc.cv;
    let gallery: GalleryFile = doc.gallery;
    let assets: Record<string, MediaAsset> = doc.assets;
    let extra: Record<string, unknown> = {};
    /** Filenames this operation stopped referencing. */
    let freed: string[] = [];

    switch (op) {
      case 'profile.update':
        cv = updateProfile(cv, body.data ?? {});
        break;

      case 'section.reorder':
        cv = reorderSections(cv, body.order);
        break;
      case 'section.create': {
        const created = createSection(cv, body.label);
        cv = created.cv;
        extra = { sectionKey: created.key };
        break;
      }
      case 'section.rename':
        cv = renameSection(cv, body.sectionKey, body.label);
        break;
      case 'section.delete': {
        const removed = deleteSection(cv, body.sectionKey);
        cv = removed.cv;
        freed = removed.freed;
        break;
      }

      case 'item.reorder':
        cv = reorderItems(cv, body.sectionKey, body.order);
        break;
      case 'item.create': {
        const created = createItem(cv, body.sectionKey, body.data ?? {});
        cv = created.cv;
        extra = { itemId: created.itemId };
        break;
      }
      case 'item.update':
        cv = updateItem(cv, body.sectionKey, body.itemId, body.data ?? {});
        break;
      case 'item.delete': {
        const removed = deleteItem(cv, body.sectionKey, body.itemId);
        cv = removed.cv;
        freed = removed.freed;
        break;
      }

      case 'contact.rename':
        cv = updateContactLabel(cv, body.label);
        break;
      case 'contact.reorder':
        cv = reorderContactItems(cv, body.order);
        break;
      case 'contact.create': {
        const created = createContactItem(cv, body.data ?? {});
        cv = created.cv;
        extra = { itemId: created.itemId };
        break;
      }
      case 'contact.update':
        cv = updateContactItem(cv, body.itemId, body.data ?? {});
        break;
      case 'contact.delete':
        cv = deleteContactItem(cv, body.itemId);
        break;

      case 'gallery.reorder':
        gallery = reorderGallery(gallery, body.order);
        break;
      case 'gallery.create': {
        const created = createGalleryEntry(gallery, assets, body.file, body.data ?? {});
        gallery = created.gallery;
        extra = { itemId: created.itemId };
        break;
      }
      case 'gallery.update':
        gallery = updateGalleryEntry(gallery, body.itemId, body.data ?? {});
        break;
      case 'gallery.setFile':
        // The previously shown asset stays in the pool. Nothing is freed.
        gallery = setGalleryFile(gallery, assets, body.itemId, body.file);
        break;
      case 'gallery.delete':
        // The entry goes, the asset stays in the pool. Nothing is freed.
        gallery = deleteGalleryEntry(gallery, body.itemId);
        break;

      case 'asset.update':
        assets = updateAsset(assets, body.file, body.data ?? {});
        break;

      case 'media.reorder':
        cv = reorderMedia(cv, body.sectionKey, body.itemId, body.order);
        break;
      case 'media.remove':
        // Detach only — the file stays in the pool so it can be reused. Nothing
        // is freed, so no garbage is collected.
        cv = removeMediaRef(cv, body.sectionKey, body.itemId, body.file);
        break;
      case 'media.attach':
        // Reuse an asset already in the pool — the point of a shared pool.
        cv = appendMedia(cv, body.sectionKey, body.itemId, body.files ?? []);
        break;

      default:
        throw new StudioError(`Unknown operation: ${op}`);
    }

    let remove: string[] = [];
    if (freed.length) {
      // Pure: works out what is now unreferenced without touching disk. Counts
      // both tabs, so a file the other one still uses is left alone.
      const plan = planGarbage(cv, gallery, assets, freed);
      assets = plan.assets;
      remove = plan.remove;
    }

    const hash = await writeDoc({ cv, assets, gallery }, body.hash);
    // Only once the document is safely on disk.
    const deleted = remove.length ? await removeFiles(remove) : [];

    return ok({
      hash,
      ...extra,
      deletedAssets: deleted,
      keptShared: freed.filter((f) => !remove.includes(f)),
    });
  } catch (error) {
    return fail(error);
  }
}
