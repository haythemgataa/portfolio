import Profile from "./Profile";
import { loadProfileData } from "./lib/contentLoader";

export default async function Home() {
  const cv = await loadProfileData();

  return <Profile cv={cv} />;
}
