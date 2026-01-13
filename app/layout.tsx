import type { Metadata } from "next";
import { Inter } from 'next/font/google'
import "./globals.css";
import { loadProfileData } from "./lib/contentLoader";

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

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
      <body className={`${inter.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
