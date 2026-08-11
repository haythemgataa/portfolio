import { findOrphans, readDoc } from '../../lib/cv-fs';
import { assertLocalDev } from '../../lib/paths';
import { fail, ok } from '../../lib/respond';

export async function GET(req: Request) {
  try {
    assertLocalDev(req);
    const doc = await readDoc();
    // Pool files missing from the registry, and registry entries nothing uses.
    // Both are inert rather than broken, so they are surfaced, never deleted.
    const orphans = await findOrphans(doc);
    return ok({
      cv: doc.cv,
      assets: doc.assets,
      hash: doc.hash,
      orphans,
      // Read-only here: the Studio does not edit the gallery, but the UI needs
      // it to show which assets are shared with the gallery tab.
      gallery: doc.gallery,
    });
  } catch (error) {
    return fail(error);
  }
}
