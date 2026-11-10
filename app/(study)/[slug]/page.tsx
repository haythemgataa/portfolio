import { promises as fs } from 'fs';
import { join } from 'path';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CaseStudy from './CaseStudy';
import { caseStudyImageFiles, parseCaseStudy } from '../../lib/caseStudyDoc';
import { FALLBACK_FOLDER_COLOR } from '../../lib/resolveContent';
import { loadProfileData } from '../../lib/contentLoader';
import { assetUrl, loadMediaRegistry } from '../../lib/mediaRegistry';
import { ogImages } from '../../lib/ogImage';
import { resolveMedia } from '../../lib/resolveContent';
import type { ResolvedMedia } from '../../lib/contentTypes';
import { pageTitle } from '../../lib/site';

export async function generateStaticParams() {
  const caseStudiesDir = join(process.cwd(), 'content', 'case-studies');
  let files: string[] = [];
  
  try {
    files = await fs.readdir(caseStudiesDir);
  } catch {
    // Directory doesn't exist or can't be read
    // Return a placeholder to satisfy static export requirements
    // The page will handle the missing file gracefully
    return [{ slug: '__placeholder__' }];
  }
  
  const markdownFiles = files.filter(file => file.endsWith('.md'));
  
  // If no markdown files exist, return a placeholder to satisfy static export requirements
  if (markdownFiles.length === 0) {
    return [{ slug: '__placeholder__' }];
  }
  
  return markdownFiles.map(file => ({
    slug: file.replace(/\.md$/, ''),
  }));
}

/**
 * The study this route is about, or null for a slug with no entry in `cv.json`.
 *
 * A markdown file can exist without being listed there — the route is derived from the directory,
 * the cards are derived from the document — so this is a lookup that is allowed to miss.
 */
async function studyFor(slug: string) {
  const cv = await loadProfileData();
  return cv.caseStudies.items.find((study) => study.slug === slug) ?? null;
}

/**
 * Declared per route, never inherited, and both halves of that matter.
 *
 * Metadata is replaced wholesale rather than deep-merged: a route that declares nothing inherits
 * the root's `og:url` and title, so every case study would announce itself as the CV at the site
 * root. And a route that declares `openGraph` to fix that drops the file convention's image with
 * it, which is why `ogImages()` names the artwork again. The same pair `/gallery` documents.
 *
 * `alternates.canonical` is likewise per route — in the layout it would hand every page a
 * canonical pointing at `/`, asking each to be de-indexed in favour of the CV.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const slug = (await params).slug;
  if (slug === '__placeholder__') return {};

  const study = await studyFor(slug);
  const cv = await loadProfileData();
  const images = await ogImages();

  const title = study?.title ?? slug;
  const description = study?.subtitle ?? `A case study by ${cv.profile.displayName}.`;
  const heading = `${title} — ${cv.profile.displayName}`;

  return {
    title: pageTitle(heading),
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      type: 'article',
      url: `/${slug}`,
      siteName: cv.profile.displayName,
      title: heading,
      description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: heading,
      description,
      images,
    },
  };
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const slug = (await params).slug;
  
  // Handle placeholder route - return 404
  if (slug === '__placeholder__') {
    notFound();
  }

  let markdownContent: string;
  try {
    markdownContent = await fs.readFile(
      join(process.cwd(), 'content', 'case-studies', `${slug}.md`),
      'utf8'
    );
  } catch {
    // File doesn't exist or can't be read - return 404
    notFound();
  }

  // The study's own record in `cv.json`, which is what supplies the title, the subtitle, the
  // colour and the mark. **The page reads it rather than the markdown's own `h1`** so that the
  // page agrees with the card the reader pressed to get here — one title, in one place.
  //
  // It is allowed to miss: the route is derived from the directory and the cards from the
  // document, so a markdown file can exist with no entry pointing at it. Such a page still
  // renders, from its own heading, rather than 404ing on a file that is plainly there.
  const study = await studyFor(slug);
  const doc = parseCaseStudy(markdownContent);

  // Every `![alt](file)` in the prose, resolved against the pool once for the whole document.
  // Resolved here rather than in `RichText` because this is the side of the boundary that can
  // read `media.json` — and because a bad reference should warn at build time, naming the study,
  // exactly as a broken heading token does.
  const assets = await loadMediaRegistry();
  const images: Record<string, ResolvedMedia> = {};
  for (const file of new Set(caseStudyImageFiles(markdownContent))) {
    const media = resolveMedia(file, assets, assetUrl, `case-studies/${slug}.md`);
    if (media) images[file] = media;
  }

  return (
    <CaseStudy
      study={study ?? {
        slug,
        title: doc.heading ?? slug,
        color: FALLBACK_FOLDER_COLOR,
        logoUrl: null,
        cover: null,
      }}
      doc={doc}
      images={images}
    />
  );
}
