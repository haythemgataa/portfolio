import type { Metadata } from "next";
import Gallery from "../../Gallery";
import { loadGalleryItems } from "../../lib/galleryLoader";
import { loadProfileData } from "../../lib/contentLoader";
import { ogImages } from "../../lib/ogImage";
import { pageTitle } from "../../lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const cv = await loadProfileData();
  const images = await ogImages();
  return {
    title: pageTitle(`Gallery — ${cv.profile.displayName}`),
    description: `Selected images and videos by ${cv.profile.displayName}.`,
    // Resolved against `metadataBase` in the root layout. Declared here rather than inherited,
    // or this route would claim / as its canonical and ask to be de-indexed in favour of it.
    alternates: { canonical: '/gallery' },
    // Declared rather than inherited, and `images` has to be repeated here — see `OG_IMAGE`.
    // Metadata is replaced wholesale: inheriting this block would give the gallery the CV's
    // title and an `og:url` of '/', and overriding it drops the file convention's image. So the
    // root gets its card for free and this route names the same file. No width or height: the
    // root's are read off the artwork, and a second, hand-written pair here is exactly the kind
    // of copy that goes stale the day the card is redrawn.
    openGraph: {
      type: 'website',
      url: '/gallery',
      siteName: cv.profile.displayName,
      title: `Gallery — ${cv.profile.displayName}`,
      description: `Selected images and videos by ${cv.profile.displayName}.`,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: `Gallery — ${cv.profile.displayName}`,
      description: `Selected images and videos by ${cv.profile.displayName}.`,
      images,
    },
  };
}

export default async function GalleryPage() {
  const items = await loadGalleryItems();

  // No wrapper: this used to carry `data-page="gallery"`, which `globals.css` matched on `body`
  // to swap the page's ground for this route. That swap is gone — both routes now sit on
  // `--background-primary` — so the attribute had nothing reading it and the div nothing to do.
  return <Gallery items={items} />;
}
