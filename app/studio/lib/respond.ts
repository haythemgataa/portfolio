import { StudioError } from './paths';

export function ok(payload: unknown = { ok: true }) {
  return Response.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function fail(error: unknown) {
  const isStudioError = error instanceof StudioError;
  const status = isStudioError ? error.status : 500;
  const message = error instanceof Error ? error.message : String(error);
  if (!isStudioError) console.error('[studio]', error);
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
