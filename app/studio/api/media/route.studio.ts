import { appendMedia, readDoc, writeDoc, writeToPool } from '../../lib/cv-fs';
import { StudioError, assertLocalDev } from '../../lib/paths';
import { fail, ok } from '../../lib/respond';

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Upload into the shared pool and reference the result from an item.
 *
 * Identical bytes already in the pool resolve to the existing asset rather than
 * a second copy, so adding a file the gallery already uses costs nothing.
 */
export async function POST(req: Request) {
  try {
    assertLocalDev(req);

    const form = await req.formData();
    const sectionKey = String(form.get('sectionKey') || '');
    const itemId = String(form.get('itemId') || '');
    const hash = String(form.get('hash') || '') || undefined;
    const files = form.getAll('files').filter((f): f is File => f instanceof File);

    if (files.length === 0) throw new StudioError('No files were uploaded');

    const doc = await readDoc();
    const assets = { ...doc.assets };

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

    const nextHash = await writeDoc(appendMedia(doc.cv, sectionKey, itemId, written), assets, hash);

    const notes = [
      deduped.length
        ? `${deduped.join(', ')} already existed in the pool and was reused, not copied.`
        : null,
      unmeasured.length
        ? `Could not measure ${unmeasured.join(', ')} — dimensions set to 1600x900. Correct them in content/media.json.`
        : null,
    ].filter(Boolean);

    return ok({
      hash: nextHash,
      written,
      deduped,
      warning: notes.length ? notes.join(' ') : null,
    });
  } catch (error) {
    return fail(error);
  }
}
