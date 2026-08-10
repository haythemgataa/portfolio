import { readTree } from '../../lib/content-fs';
import { assertLocalDev } from '../../lib/paths';
import { fail, ok } from '../../lib/respond';

export async function GET(req: Request) {
  try {
    assertLocalDev(req);
    return ok({ sections: await readTree() });
  } catch (error) {
    return fail(error);
  }
}
