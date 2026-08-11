import { findOrphanMedia, readDoc } from '../../lib/cv-fs';
import { assertLocalDev } from '../../lib/paths';
import { fail, ok } from '../../lib/respond';

export async function GET(req: Request) {
  try {
    assertLocalDev(req);
    const { cv, hash } = await readDoc();
    // Files sitting in a media folder that the JSON does not list. Surfaced so
    // hand-copied files are visible rather than silently ignored.
    const orphans = await findOrphanMedia(cv);
    return ok({ cv, hash, orphans });
  } catch (error) {
    return fail(error);
  }
}
