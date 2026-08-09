import type { Metadata } from "next";
import Gallery from "../Gallery";
import { loadGalleryItems } from "../lib/galleryLoader";
import { loadProfileData } from "../lib/contentLoader";

export async function generateMetadata(): Promise<Metadata> {
  const cv = await loadProfileData();
  return {
    title: `Gallery — ${cv.general.displayName}`,
    description: `Selected images and videos by ${cv.general.displayName}.`,
  };
}

export default async function GalleryPage() {
  const items = await loadGalleryItems();

  return <Gallery items={items} />;
}
