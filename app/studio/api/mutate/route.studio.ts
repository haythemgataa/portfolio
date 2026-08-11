import type { CvFile } from '../../../lib/contentTypes';
import {
  createContactItem,
  createItem,
  createSection,
  deleteContactItem,
  deleteItem,
  deleteMedia,
  deleteSection,
  readDoc,
  removeMediaFolders,
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
 * hash rejecting a stale overwrite. Ordering is an array index now, so nothing
 * here touches directory names.
 */
export async function POST(req: Request) {
  try {
    assertLocalDev(req);
    const body = await req.json();
    const op = String(body?.op || '');
    const { cv } = await readDoc();

    let next: CvFile;
    let extra: Record<string, unknown> = {};
    /** Media folders to remove *after* the write succeeds. */
    let orphanedIds: string[] = [];

    switch (op) {
      case 'profile.update':
        next = updateProfile(cv, body.data ?? {});
        break;

      case 'section.reorder':
        next = reorderSections(cv, body.order);
        break;
      case 'section.create': {
        const created = createSection(cv, body.label);
        next = created.cv;
        extra = { sectionKey: created.key };
        break;
      }
      case 'section.rename':
        next = renameSection(cv, body.sectionKey, body.label);
        break;
      case 'section.delete': {
        const removed = deleteSection(cv, body.sectionKey);
        next = removed.cv;
        orphanedIds = removed.removedIds;
        break;
      }

      case 'item.reorder':
        next = reorderItems(cv, body.sectionKey, body.order);
        break;
      case 'item.create': {
        const created = createItem(cv, body.sectionKey, body.data ?? {});
        next = created.cv;
        extra = { itemId: created.itemId };
        break;
      }
      case 'item.update':
        next = updateItem(cv, body.sectionKey, body.itemId, body.data ?? {});
        break;
      case 'item.delete':
        next = deleteItem(cv, body.sectionKey, body.itemId);
        orphanedIds = [body.itemId];
        break;

      case 'contact.rename':
        next = updateContactLabel(cv, body.label);
        break;
      case 'contact.reorder':
        next = reorderContactItems(cv, body.order);
        break;
      case 'contact.create': {
        const created = createContactItem(cv, body.data ?? {});
        next = created.cv;
        extra = { itemId: created.itemId };
        break;
      }
      case 'contact.update':
        next = updateContactItem(cv, body.itemId, body.data ?? {});
        break;
      case 'contact.delete':
        next = deleteContactItem(cv, body.itemId);
        break;

      case 'media.reorder':
        next = reorderMedia(cv, body.sectionKey, body.itemId, body.order);
        break;
      case 'media.delete':
        next = await deleteMedia(cv, body.sectionKey, body.itemId, body.file);
        break;

      default:
        throw new StudioError(`Unknown operation: ${op}`);
    }

    const hash = await writeDoc(next, body.hash);
    // Only after the document is safely on disk.
    if (orphanedIds.length) await removeMediaFolders(orphanedIds);

    return ok({ hash, ...extra });
  } catch (error) {
    return fail(error);
  }
}
