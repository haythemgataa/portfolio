import { syncAttachments, writeMedia } from '../../lib/content-fs';
import { StudioError, assertLocalDev } from '../../lib/paths';
import { fail, ok } from '../../lib/respond';

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    assertLocalDev(req);

    const form = await req.formData();
    const sectionDir = String(form.get('sectionDir') || '');
    const itemDir = String(form.get('itemDir') || '');
    const files = form.getAll('files').filter((f): f is File => f instanceof File);

    if (files.length === 0) throw new StudioError('No files were uploaded');

    const written: string[] = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        throw new StudioError(`${file.name} is larger than 50 MB`);
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      written.push(await writeMedia(sectionDir, itemDir, file.name, bytes));
    }

    // Fold the new files into item.json's attachments so they actually render.
    const media = await syncAttachments(sectionDir, itemDir);
    return ok({ written, media });
  } catch (error) {
    return fail(error);
  }
}
