import type { MediaEntry } from '../../../lib/contentTypes';
import { appendMedia, readDoc, writeDoc, writeMedia } from '../../lib/cv-fs';
import { StudioError, assertLocalDev } from '../../lib/paths';
import { fail, ok } from '../../lib/respond';

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    assertLocalDev(req);

    const form = await req.formData();
    const sectionKey = String(form.get('sectionKey') || '');
    const itemId = String(form.get('itemId') || '');
    const hash = String(form.get('hash') || '') || undefined;
    const files = form.getAll('files').filter((f): f is File => f instanceof File);

    if (files.length === 0) throw new StudioError('No files were uploaded');

    const written: MediaEntry[] = [];
    const unmeasured: string[] = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        throw new StudioError(`${file.name} is larger than 50 MB`);
      }
      const entry = await writeMedia(itemId, file.name, Buffer.from(await file.arrayBuffer()));
      written.push(entry);
      // Video dimensions cannot be read here, so flag the 16:9 placeholder.
      if (entry.width === 1600 && entry.height === 900) unmeasured.push(entry.file);
    }

    const { cv } = await readDoc();
    const nextHash = await writeDoc(appendMedia(cv, sectionKey, itemId, written), hash);

    return ok({
      hash: nextHash,
      written: written.map((w) => w.file),
      warning: unmeasured.length
        ? `Could not measure ${unmeasured.join(', ')} — dimensions were set to 1600x900. Correct them in the media panel.`
        : null,
    });
  } catch (error) {
    return fail(error);
  }
}
