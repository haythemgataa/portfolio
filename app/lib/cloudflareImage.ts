/**
 * Cloudflare Image Resizing URL builder.
 *
 * Variants are served from /cdn-cgi/image/<options>/<path>. That endpoint only exists on
 * Cloudflare's edge, so the original URL is returned unless this is a Cloudflare
 * production build — otherwise every image 404s.
 *
 * Callers must keep width/height bounded and must never pass values straight from
 * content files: unbounded transform params are a billing/DoS vector on the account.
 */

/**
 * Quality applies to whatever format `format=auto` negotiates (AVIF for most current
 * browsers, WebP otherwise). Measured across all 28 CV thumbnails: at the correct pixel
 * size, 50 -> 80 gains ~2.6 dB PSNR for ~37% more bytes. Worth it here because the
 * content is largely UI screenshots, where fine text suffers first.
 */
const DEFAULT_QUALITY = 80;

/**
 * Devices at 2x are the common case and `images.unoptimized` prevents next/image from
 * emitting a srcset, so a single asset has to satisfy every display. Requesting 2x and
 * letting 1x displays downscale is the safe direction — the reverse is visible blur.
 */
export const DPR = 2;

type Options = {
  /** CSS pixel width the image is displayed at. Omit to constrain by height only. */
  width?: number;
  /** CSS pixel height the image is displayed at. */
  height?: number;
  quality?: number;
  /**
   * Match the CSS. `cover` fills the box and crops the overflow, mirroring
   * `object-fit: cover`; Cloudflare's default (`scale-down`) instead fits *inside* the
   * box, which silently under-delivers pixels whenever the box is not square.
   */
  fit?: 'cover' | 'contain' | 'scale-down';
  /**
   * Device-pixel multiplier applied to the CSS dimensions. Defaults to DPR because a
   * single asset usually has to serve every display; pass an explicit value when
   * building the entries of a srcset.
   */
  dpr?: number;
};

/**
 * Read once at module scope so Turbopack can fold the dead branch away entirely when
 * NEXT_PUBLIC_CDN_IMAGES is not "true" at build time.
 *
 * Gating on NODE_ENV alone is not enough: a local `npm run build` and dev-branch
 * previews on *.pages.dev are both production builds, and neither serves Image
 * Resizing, so every variant URL would 404. next.config.ts sets this to "true" only
 * for Cloudflare production-branch builds.
 */
const CDN_ENABLED = process.env.NEXT_PUBLIC_CDN_IMAGES === "true";

export function cloudflareImageUrl(url: string, options: Options = {}): string {
  if (!CDN_ENABLED) {
    return url;
  }

  const { width, height, quality = DEFAULT_QUALITY, fit, dpr = DPR } = options;

  const params: string[] = [];
  if (width) params.push(`width=${Math.round(width * dpr)}`);
  if (height) params.push(`height=${Math.round(height * dpr)}`);
  if (fit) params.push(`fit=${fit}`);
  params.push(`quality=${quality}`);
  params.push('format=auto');
  // Strip EXIF/ICC we never use.
  params.push('metadata=none');

  return `/cdn-cgi/image/${params.join(',')}${url}`;
}
