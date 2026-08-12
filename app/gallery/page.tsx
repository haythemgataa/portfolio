import type { Metadata } from "next";
import Gallery from "../Gallery";
import { loadGalleryItems } from "../lib/galleryLoader";
import { loadProfileData } from "../lib/contentLoader";

export async function generateMetadata(): Promise<Metadata> {
  const cv = await loadProfileData();
  return {
    title: `Gallery — ${cv.profile.displayName}`,
    description: `Selected images and videos by ${cv.profile.displayName}.`,
  };
}

export default async function GalleryPage() {
  const items = await loadGalleryItems();

  // `data-page` is what globals.css matches on to swap the page's ground colour for this
  // route. It has to be a plain attribute rather than a CSS-module class: the selector lives
  // on `body`, outside any module's scope, so it cannot reference a hashed class name.
  return (
    <div data-page="gallery">
      <Gallery items={items} />
    </div>
  );
}
