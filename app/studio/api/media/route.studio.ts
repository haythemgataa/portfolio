import {
  appendMedia,
  createGalleryEntry,
  readDoc,
  writeDoc,
  writeToPool,
} from '../../lib/cv-fs';
import { StudioError, assertLocalDev } from '../../lib/paths';
import { fail, ok } from '../../lib/respond';

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Upload into the shared pool, then attach the result where the caller wants it.
 *
 * `attachTo`:
 *   cv      — reference from a CV item (needs sectionKey + itemId)
 *   gallery — create a gallery entry per uploaded file
 *   none    — pool and register only
 *
 * Identical bytes already in the pool resolve to the existing asset rather than
 * a second copy, so adding a file the other tab already uses costs nothing.
 */
export async function POST(req: Request) {
  try {
    assertLocalDev(req);

    const form = await req.formData();
    const attachTo = String(form.get('attachTo') || 'cv');
    const sectionKey = String(form.get('sectionKey') || '');
    const itemId = String(form.get('itemId') || '');
    const hash = String(form.get('hash') || '') || undefined;
    const files = form.getAll('files').filter((f): f is File => f instanceof File);

    if (files.length === 0) throw new StudioError('No files were uploaded');
    if (!['cv', 'gallery', 'none'].includes(attachTo)) {
      throw new StudioError(`Unknown attachTo: ${attachTo}`);
    }

    const doc = await readDoc();
    const assets = { ...doc.assets };
    let cv = doc.cv;
    let gallery = doc.gallery;

    const written: string[] = [];
    const deduped: string[] = [];
    const unmeasured: string[] = [];

    for (const file of files) {
      if (file.size > MAX_BYTES) {
        throw new StudioError(`${file.name} is larger than 50 MB`);
      }
      const result = await writeToPool(file.name, Buffer.from(await file.arrayBuffer()), assets);
      written.push(result.file);
      if (result.deduped) deduped.push(result.file);
      // Video dimensions cannot be read here, so flag the 16:9 placeholder.
      else if (result.asset.width === 1600 && result.asset.height === 900) {
        unmeasured.push(result.file);
      }
    }

    const createdIds: string[] = [];
    if (attachTo === 'cv') {
      cv = appendMedia(cv, sectionKey, itemId, written);
    } else if (attachTo === 'gallery') {
      for (const file of written) {
        const created = createGalleryEntry(gallery, assets, file);
        gallery = created.gallery;
        createdIds.push(created.itemId);
      }
    }

    const nextHash = await writeDoc({ cv, assets, gallery }, hash);

    const notes = [
      deduped.length
        ? `${deduped.join(', ')} already existed in the pool and was reused, not copied.`
        : null,
      unmeasured.length
        ? `Could not measure ${unmeasured.join(', ')} — set to 1600x900. Correct the dimensions in the asset panel.`
        : null,
    ].filter(Boolean);

    return ok({
      hash: nextHash,
      written,
      deduped,
      createdIds,
      warning: notes.length ? notes.join(' ') : null,
    });
  } catch (error) {
    return fail(error);
  }
}
