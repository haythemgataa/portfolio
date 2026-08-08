import styles from "./page.module.css";
import Profile from "./Profile";
import { loadProfileData } from "./lib/contentLoader";
import { hasGalleryItems } from "./lib/galleryLoader";

export default async function Home() {
  const [cv, showGallery] = await Promise.all([
    loadProfileData(),
    hasGalleryItems(),
  ]);

  return (
    <div className={styles.page}>
      <Profile cv={cv} showGallery={showGallery} />
    </div>
  );
}
