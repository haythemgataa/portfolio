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
 * The Studio writes to disk, so refuse to run outside `next dev` and refuse
 * requests that did not come from the local machine (next dev binds 0.0.0.0).
 */
export function assertLocalDev(req: Request): void {
  if (process.env.NODE_ENV !== 'development') {
    throw new StudioError('The Studio is only available in `npm run dev`', 403);
  }
  const host = (req.headers.get('host') || '').replace(/:\d+$/, '').toLowerCase();
  const allowed = ['localhost', '127.0.0.1', '[::1]', '::1', ''];
  if (!allowed.includes(host)) {
    throw new StudioError(
      `The Studio only accepts requests from localhost (got "${host}"). Open http://localhost:3000/studio`,
      403
    );
  }
}
