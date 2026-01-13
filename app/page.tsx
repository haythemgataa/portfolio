import styles from "./page.module.css";
import Profile from "./Profile";
import { loadProfileData } from "./lib/contentLoader";

export default async function Home() {
  const cv = await loadProfileData();

  return (
    <div className={styles.page}>
      <Profile cv={cv} />
    </div>
  );
}
