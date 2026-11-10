import { promises as fs } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { OG_IMAGE, OG_IMAGE_ALT_FILE, OG_IMAGE_FILE } from "./site";

/**
 * The social card, described the way a route's own `openGraph` block needs it.
 *
 * **Every route that declares `openGraph` has to name the artwork by hand.** Metadata is replaced
 * wholesale, and measured in this repo: declaring the block drops the file convention's image even
 * when no `images` key is given. So `/`, `/gallery` and `/[slug]` all come through here.
 *
 * That used to cost something. `app/opengraph-image.png` is a Next file convention, and the
 * convention emits the type, the artwork's real pixel dimensions, its alt text and a cache-busting
 * hash — none of which a bare path carries. The home page got all of that for free while the other
 * two got a bare URL, because the convention attaches to the *segment* it sits in and `/` used to
 * share that segment. Splitting the routes into `(site)` and `(study)` root layouts ended that:
 * `/` moved into a group, the convention stopped reaching it, and it silently lost its card image
 * altogether. Moving the file into the group fixed `/` and broke the other two, because Next
 * suffixes a convention path inside a route group (`/opengraph-image-12o0cb.png`) and a hand-named
 * `/opengraph-image.png` then 404s.
 *
 * So the file stays at the `app/` root — where the emitted route keeps its stable, nameable path —
 * and this function *derives* everything the convention was giving, from the bytes themselves.
 * Nothing here is hand-written, so nothing can go stale when the card is redrawn.
 *
 * It lives here rather than in `site.ts` because it needs `fs`, and `site.ts` is imported by client
 * components (`ProfileHeader` reads `IS_DEV_BRANCH`) — a filesystem import there would follow it
 * into the browser bundle.
 */
export type OgImage = {
  url: string;
  width: number;
  height: number;
  alt?: string;
};

/**
 * A PNG's dimensions, read straight out of its IHDR chunk.
 *
 * Deliberately not `sharp`: this repo's build never runs it, because content dimensions are always
 * authored. That rule is about content, and this is one chrome file — but a 20-byte header read is
 * cheaper than the exception, and IHDR is the first chunk of every PNG by specification. The magic
 * number is checked so a JPEG dropped in under this name fails loudly rather than reporting
 * whatever those bytes happen to say.
 */
function pngSize(buf: Buffer): { width: number; height: number } | null {
  const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(MAGIC)) return null;
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * The card as an `images` array, or empty when the artwork is absent.
 *
 * The emptiness matters: without the check, a build with no artwork would still advertise
 * `/opengraph-image.png` and every scraper that followed it would get a 404. The same shape as
 * `hasGalleryItems()` gating the sitemap — ask whether the thing exists before pointing at it.
 */
export async function ogImages(): Promise<OgImage[]> {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(join(process.cwd(), 'app', OG_IMAGE_FILE));
  } catch {
    return [];
  }

  const size = pngSize(bytes);
  if (!size) {
    console.warn(`app/${OG_IMAGE_FILE}: not a readable PNG, omitting the social card image`);
    return [];
  }

  // The same cache-busting the pool's `assetUrl` applies, and for the same reason: `_headers`
  // gives `/*.png` a year of `immutable`, so a redrawn card at an unchanged URL would never be
  // re-fetched. Derived from the bytes rather than authored, so it cannot disagree with the file.
  const version = createHash('sha256').update(bytes).digest('hex').slice(0, 8);

  let alt: string | undefined;
  try {
    // Trimmed defensively. The file convention writes these bytes into the attribute verbatim, so
    // the file itself must not end in a newline; nothing enforces that, and a stray one here would
    // land inside the quotes.
    alt = (await fs.readFile(join(process.cwd(), 'app', OG_IMAGE_ALT_FILE), 'utf8')).trim() || undefined;
  } catch {
    // Optional.
  }

  return [{ url: `${OG_IMAGE}?v=${version}`, width: size.width, height: size.height, alt }];
}
