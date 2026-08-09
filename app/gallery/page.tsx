import type { Metadata } from "next";
import pageStyles from "../page.module.css";
import styles from "./page.module.css";
import Tabs from "../Tabs";
import ProfileHeader from "../ProfileHeader";
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
  const [cv, items] = await Promise.all([
    loadProfileData(),
    loadGalleryItems(),
  ]);

  return (
    <div className={pageStyles.page}>
      <div className={styles.gallery}>
        <ProfileHeader general={cv.general} />
        <Tabs />
        <Gallery items={items} />
      </div>
    </div>
  );
}
