import { join, resolve, sep } from 'path';

/** Build-time content input. Deliberately outside public/ — never served. */
export const CONTENT_ROOT = join(process.cwd(), 'content');
/** One flat pool of served media, shared by the CV and the gallery. */
export const POOL_ROOT = join(process.cwd(), 'public', 'media');

export const CV_PATH = join(CONTENT_ROOT, 'cv.json');
export const MEDIA_PATH = join(CONTENT_ROOT, 'media.json');
export const GALLERY_PATH = join(CONTENT_ROOT, 'gallery.json');

/** A message safe to surface to the Studio UI. */
export class StudioError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'StudioError';
    this.status = status;
  }
}

// Must start alphanumeric so internal scratch names ("cv.json.tmp") can never
// be produced by user input.
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertSafeSegment(segment: unknown, label = 'name'): string {
  if (
    typeof segment !== 'string' ||
    segment.length > 200 ||
    !SEGMENT_RE.test(segment) ||
    segment.includes('..')
  ) {
    throw new StudioError(`Invalid ${label}: ${JSON.stringify(segment)}`);
  }
  return segment;
}

/** Resolve a path under `root`, proving it cannot escape. */
function underRoot(root: string, segments: string[]): string {
  for (const segment of segments) assertSafeSegment(segment, 'path segment');
  const full = resolve(root, ...segments);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new StudioError('Path escapes the content directory', 403);
  }
  return full;
}

/** public/media/<file> — the pool is flat, so exactly one segment. */
export function poolPath(file: string): string {
  return underRoot(POOL_ROOT, [file]);
}

/**
 * The Studio writes to disk, so refuse to run outside `next dev`, and refuse
 * anything but a same-origin request from the local machine.
 *
 * Three separate checks, because each closes a hole the others do not:
 *
 *  - `NODE_ENV` keeps the whole tool out of a production process.
 *  - The `Host` allow-list is what `npm run dev -H 127.0.0.1` makes meaningful.
 *    On its own it is not an authorization check at all: `Host` is chosen by the
 *    caller, so while dev listened on 0.0.0.0 anyone on the LAN could send
 *    `Host: localhost` and read or destroy content. The bind is the real fix and
 *    this is the backstop; `''` is no longer accepted, since only a
 *    hand-written request omits it.
 *  - `Origin`/`Sec-Fetch-Site` is what stops *any page the author visits* from
 *    driving these routes cross-site. Next's own dev-only cross-site guard only
 *    covers its internal endpoints (`/_next`, `/__nextjs`), never these, and
 *    neither a JSON body sent as `text/plain` nor a `multipart/form-data` upload
 *    is preflighted — both are CORS "simple" requests, and `req.json()` does not
 *    look at Content-Type. Without this a visited page could POST
 *    `{"op":"section.delete"}` blind: section keys are the visible labels, and
 *    the stale-hash guard is no help because it is the attacker who omits it.
 */
export function assertLocalDev(req: Request): void {
  if (process.env.NODE_ENV !== 'development') {
    throw new StudioError('The Studio is only available in `npm run dev`', 403);
  }

  const host = (req.headers.get('host') || '').replace(/:\d+$/, '').toLowerCase();
  const allowed = ['localhost', '127.0.0.1', '[::1]', '::1'];
  if (!allowed.includes(host)) {
    throw new StudioError(
      `The Studio only accepts requests from localhost (got "${host}"). Open http://localhost:3000/studio`,
      403
    );
  }

  // Only the unsafe methods need this. A cross-site *read* is already contained
  // by the browser — no `Access-Control-Allow-Origin` comes back, so the response
  // is never legible to the caller. What gets through regardless is the write,
  // whose effect lands even though its response cannot be read; and every
  // cross-site POST carries `Origin`, so gating on the method has no blind spot
  // and does not depend on a same-origin GET happening to carry one (it does not).
  if (req.method === 'GET' || req.method === 'HEAD') return;

  // Fetch Metadata is the precise signal and the browsers this runs in send it.
  // `Origin` is the fallback for anything older, and is always present on a POST.
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    throw new StudioError('The Studio only accepts same-origin requests', 403);
  }

  const origin = req.headers.get('origin');
  if (!origin) {
    // No `Origin` on a POST means no browser sent it. Allowed only when Fetch
    // Metadata already vouched for it, so a bare curl is refused.
    if (!site) throw new StudioError('The Studio only accepts same-origin requests', 403);
    return;
  }
  let originHost: string;
  try {
    originHost = new URL(origin).hostname.toLowerCase();
  } catch {
    throw new StudioError('The Studio only accepts same-origin requests', 403);
  }
  if (!allowed.includes(originHost) && !allowed.includes(`[${originHost}]`)) {
    throw new StudioError(
      `The Studio only accepts same-origin requests (got origin "${origin}")`,
      403
    );
  }
}
