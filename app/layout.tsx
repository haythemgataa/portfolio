import type { Metadata } from "next";
import "./globals.css";
import { loadProfileData } from "./lib/contentLoader";

export async function generateMetadata(): Promise<Metadata> {
  const cv = await loadProfileData();
  return {
    title: cv.general.displayName,
    description: cv.general.byline || '',
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@1&display=swap" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
