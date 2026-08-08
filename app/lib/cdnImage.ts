// Read once at module scope so Turbopack can fold the dead branch away
// entirely when NEXT_PUBLIC_CDN_IMAGES is not "true" at build time.
const CDN_ENABLED = process.env.NEXT_PUBLIC_CDN_IMAGES === "true";

/**
 * Build the thumbnail URL for a CV attachment image.
 *
 * On Cloudflare production builds (NEXT_PUBLIC_CDN_IMAGES === "true"),
 * returns a Cloudflare Image Resizing URL. Everywhere else (local dev,
 * local builds, dev-branch previews on *.pages.dev, which does not
 * support Image Resizing) returns the original URL unchanged.
 *
 * width, height, quality, and format are hardcoded here and must never
 * be sourced from content files — unbounded transform params are a
 * billing/DoS vector on the Cloudflare account.
 */
export function cvThumbnailUrl(originalUrl: string, maxHeight: number): string {
  if (!CDN_ENABLED) return originalUrl;
  return `/cdn-cgi/image/width=${maxHeight * 2},height=${maxHeight * 2},quality=50,format=auto${originalUrl}`;
}
