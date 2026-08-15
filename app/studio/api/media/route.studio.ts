import {
  appendMedia,
  assertFresh,
  assertUploadable,
  createGalleryEntry,
  readDoc,
  removeFiles,
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

    // Everything that can reject the request is checked before a single byte
    // reaches the pool. Previously the size limit was tested inside the write
    // loop and the stale-hash check ran only at `writeDoc`, so an oversized
    // second file — or a 409 — left the first one sitting in public/media/ with
    // no media.json entry: invisible to a retry (dedup reads the registry) but
    // not to the name allocator, which then produced a byte-identical
    // `clip-2.webm` beside it.
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        throw new StudioError(`${file.name} is larger than 50 MB`);
      }
      assertUploadable(file.name);
    }
    assertFresh(doc, hash);

    const assets = { ...doc.assets };
    let cv = doc.cv;
    let gallery = doc.gallery;

    const written: string[] = [];
    const deduped: string[] = [];
    const unmeasured: string[] = [];
    /** Files this request actually created, so a later failure can undo them. */
    const created: string[] = [];

    try {
      for (const file of files) {
        const result = await writeToPool(file.name, Buffer.from(await file.arrayBuffer()), assets);
        written.push(result.file);
        if (result.deduped) deduped.push(result.file);
        else {
          created.push(result.file);
          // Video dimensions cannot be read here, so flag the 16:9 placeholder.
          if (result.asset.width === 1600 && result.asset.height === 900) {
            unmeasured.push(result.file);
          }
        }
      }

      const createdIds: string[] = [];
      if (attachTo === 'cv') {
        cv = appendMedia(cv, sectionKey, itemId, written);
      } else if (attachTo === 'gallery') {
        for (const file of written) {
          const entry = createGalleryEntry(gallery, assets, file);
          gallery = entry.gallery;
          createdIds.push(entry.itemId);
        }
      }

      const nextHash = await writeDoc({ cv, assets, gallery }, hash);
      return respond(nextHash, written, deduped, createdIds, unmeasured);
    } catch (error) {
      // The document was never written, so these bytes describe nothing. Only
      // files this request created are removed — a deduped result names an asset
      // that was already in the pool and is still in use.
      if (created.length) await removeFiles(created);
      throw error;
    }
  } catch (error) {
    return fail(error);
  }
}

function respond(
  nextHash: string,
  written: string[],
  deduped: string[],
  createdIds: string[],
  unmeasured: string[]
) {
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
}
