import { promises as fs } from 'fs';
import { join } from 'path';
import { notFound } from 'next/navigation';
import CaseStudy from './CaseStudy';

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

  return (
    <div>
      <CaseStudy markdownText={markdownContent} />
    </div>
  );
}
