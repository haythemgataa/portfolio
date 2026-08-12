import { promises as fs } from 'fs';
import { join } from 'path';
import type { MediaAsset, MediaRegistry, ResolvedMedia } from './contentTypes';
import { inferMediaType } from './contentTypes';

/**
 * content/media.json is the single description of every file in the
 * public/media/ pool. Both loaders resolve through here so a shared asset
 * cannot end up with two different dimension records — which is exactly how the
 * awards video came to be recorded as 16:9 on one side and 1254x704 on the
 * other before the pool existed.
 */

const REGISTRY_PATH = join(process.cwd(), 'content', 'media.json');

/** Every asset is served from one flat directory. */
export const MEDIA_BASE = '/media';

export async function loadMediaRegistry(): Promise<Record<string, MediaAsset>> {
  let parsed: MediaRegistry;
  try {
    parsed = JSON.parse(await fs.readFile(REGISTRY_PATH, 'utf8')) as MediaRegistry;
  } catch (error) {
    throw new Error(`Failed to read content/media.json: ${error}`);
  }
  if (!parsed.assets || typeof parsed.assets !== 'object') {
    throw new Error('content/media.json: expected an "assets" object');
  }
  return parsed.assets;
}

export function assetUrl(file: string): string {
  return `${MEDIA_BASE}/${file}`;
}

/**
 * Turn a filename reference into something a component can render. Returns null
 * — with a build warning naming the referrer — rather than throwing, so one bad
 * reference cannot fail the whole export.
 */
export function resolveAsset(
  file: string,
  assets: Record<string, MediaAsset>,
  referrer: string
): ResolvedMedia | null {
  const asset = assets[file];
  if (!asset) {
    console.warn(`${referrer}: "${file}" is not in content/media.json, skipping`);
    return null;
  }

  const type = asset.type ?? inferMediaType(file);
  if (!type) {
    console.warn(`${referrer}: cannot determine media type for "${file}", skipping`);
    return null;
  }
  if (!asset.width || !asset.height) {
    // Without dimensions the aspect-ratio box collapses and the layout shifts.
    console.warn(`media.json: "${file}" is missing width/height, skipping`);
    return null;
  }

  return {
    type,
    url: assetUrl(file),
    width: asset.width,
    height: asset.height,
    posterUrl: asset.poster ? assetUrl(asset.poster) : null,
    // Omitted means matted — see MediaAsset.framed. Only an explicit false opts out, so
    // every asset authored before the flag keeps the treatment it had.
    framed: asset.framed !== false,
    // The mirror of the above: omitted means *not* floating, so only an explicit true opts
    // in. See MediaAsset.floating.
    floating: asset.floating === true,
  };
}
