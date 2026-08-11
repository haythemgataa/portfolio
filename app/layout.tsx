import type { Metadata } from "next";
import "./globals.css";
import styles from "./layout.module.css";
import ProfileHeader from "./ProfileHeader";
import Tabs from "./Tabs";
import { loadProfileData } from "./lib/contentLoader";
import { hasGalleryItems } from "./lib/galleryLoader";

export async function generateMetadata(): Promise<Metadata> {
  const cv = await loadProfileData();
  return {
    title: cv.profile.displayName,
    description: cv.profile.byline || '',
  };
}

/**
 * The header and tab bar live here rather than in each page so they survive navigation
 * between `/` and `/gallery`. Those are sibling route segments, so anything rendered
 * inside their pages is unmounted and remounted on every switch — which would reset the
 * sticky bar's state and make it impossible to animate the active pill between tabs.
 * Keeping them in the layout also stops the avatar from re-mounting on each switch.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cv, showGallery] = await Promise.all([
    loadProfileData(),
    hasGalleryItems(),
  ]);

  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@1&display=swap" />
      </head>
      <body>
        <div className={styles.page}>
          <div className={styles.column}>
            <ProfileHeader profile={cv.profile} />
            <Tabs showGallery={showGallery} />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
