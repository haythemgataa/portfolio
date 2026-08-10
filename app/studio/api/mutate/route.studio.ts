import {
  createItem,
  createSection,
  deleteItem,
  deleteMedia,
  deleteSection,
  renameItem,
  renameSection,
  reorderItems,
  reorderSections,
  syncAttachments,
  updateItem,
} from '../../lib/content-fs';
import { StudioError, assertLocalDev } from '../../lib/paths';
import { fail, ok } from '../../lib/respond';

export async function POST(req: Request) {
  try {
    assertLocalDev(req);
    const body = await req.json();
    const op = String(body?.op || '');

    switch (op) {
      case 'section.reorder':
        return ok({ order: await reorderSections(body.order) });

      case 'section.create':
        return ok({ sectionDir: await createSection(body.key) });

      case 'section.rename':
        return ok({ sectionDir: await renameSection(body.sectionDir, body.key) });

      case 'section.delete':
        await deleteSection(body.sectionDir);
        return ok();

      case 'item.reorder':
        return ok({ order: await reorderItems(body.sectionDir, body.order) });

      case 'item.create':
        return ok({ itemDir: await createItem(body.sectionDir, body.data || {}) });

      case 'item.update':
        return ok({
          data: await updateItem(body.sectionDir, body.itemDir, body.data || {}, !!body.replace),
        });

      case 'item.rename':
        return ok({ itemDir: await renameItem(body.sectionDir, body.itemDir, body.label) });

      case 'item.delete':
        await deleteItem(body.sectionDir, body.itemDir);
        return ok();

      case 'media.reorder':
        return ok({ media: await syncAttachments(body.sectionDir, body.itemDir, body.order) });

      case 'media.delete':
        return ok({ media: await deleteMedia(body.sectionDir, body.itemDir, body.filename) });

      default:
        throw new StudioError(`Unknown operation: ${op}`);
    }
  } catch (error) {
    return fail(error);
  }
}
