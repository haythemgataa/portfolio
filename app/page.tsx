import type { Metadata } from "next";
import Profile from "./Profile";
import { loadProfileData } from "./lib/contentLoader";

// Title and description are inherited from the root layout, which already names the CV. The
// canonical has to be declared per route rather than there — see the note in `layout.tsx`.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default async function Home() {
  const cv = await loadProfileData();

  return <Profile cv={cv} />;
}
