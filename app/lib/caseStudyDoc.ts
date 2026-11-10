/**
 * Splitting a case study's markdown into the sections the page renders as the CV's own numbered,
 * sticky-titled blocks.
 *
 * Pure — no filesystem, no React — for the same reason `resolveContent.ts` is: the page reads the
 * file, this decides what the file *means*, and keeping the two apart is what would let the Studio
 * render the same document from a string that is not on disk.
 *
 * The shape it expects is the shape a case study is already written in: an `h1` for the title,
 * then one `h2` per section. Nothing else about the markdown is interpreted; each section's body
 * is handed to `RichText` verbatim.
 */

export type CaseStudySection = {
  /** The `h2`'s text, with any authored ordinal stripped. */
  label: string;
  /** Everything under that heading, as markdown. */
  body: string;
};

export type CaseStudyDoc = {
  /**
   * The `h1`, if the file has one.
   *
   * The page does **not** use it as the title — `cv.json`'s `title` is what the card the reader
   * pressed said, and the page has to agree with the card. It is parsed out so it can be *removed*
   * rather than rendered twice, and returned only so a caller could fall back on it.
   */
  heading: string | null;
  /** Anything between the `h1` and the first `h2`. Usually empty. */
  intro: string;
  sections: CaseStudySection[];
};

/**
 * A `---` between sections is a divider in a flat document and noise in a sectioned one: the
 * section headers are the dividers now, so a rule left in place draws a line inside a body
 * immediately below the title that already separates it.
 *
 * Only whole-line rules at the very start or end of a body are removed, so a `---` a writer put
 * *inside* a section on purpose survives.
 */
function trimRules(body: string): string {
  return body
    .replace(/^(?:\s*(?:---|\*\*\*|___)\s*\n)+/, '')
    .replace(/(?:\n\s*(?:---|\*\*\*|___)\s*)+$/, '')
    .trim();
}

/**
 * **An authored ordinal is stripped from the label.** The draft numbers its own sections ("## 1.
 * Board Viewer…") because it was written as one flat document; the page derives the numeral from
 * position via `SectionNumber`, so leaving the authored one would print "01 1. Board Viewer" and
 * the two could disagree the moment a section moved. Deriving it is the rule everywhere else in
 * this content model — see the note in `SectionNumber.tsx`.
 */
function cleanLabel(raw: string): string {
  return raw.trim().replace(/^\d+[.)]\s+/, '');
}

export function parseCaseStudy(markdown: string): CaseStudyDoc {
  const lines = markdown.split('\n');

  let heading: string | null = null;
  const introLines: string[] = [];
  const sections: { label: string; lines: string[] }[] = [];

  // Fenced code blocks are tracked so a `#` or `##` inside one is never read as a heading.
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
    }

    if (!inFence) {
      const h2 = /^##\s+(.*)$/.exec(line);
      if (h2) {
        sections.push({ label: cleanLabel(h2[1]), lines: [] });
        continue;
      }
      const h1 = /^#\s+(.*)$/.exec(line);
      if (h1 && heading === null && sections.length === 0) {
        heading = h1[1].trim();
        continue;
      }
    }

    if (sections.length === 0) introLines.push(line);
    else sections[sections.length - 1].lines.push(line);
  }

  return {
    heading,
    intro: trimRules(introLines.join('\n')),
    sections: sections.map((section) => ({
      label: section.label,
      body: trimRules(section.lines.join('\n')),
    })),
  };
}

/**
 * Every pool filename a case study's markdown names with `![alt](file)`.
 *
 * **This is a pool reference living inside free text, so it has to be counted**, exactly as a
 * heading's `[filename]` token is via `headingIconFiles()`. CONTENT-SCHEMA.md states the rule:
 * anything that embeds a filename in prose has to be added to `collectReferences`, or the sweep
 * reports an image that is on screen as an orphan and offers to delete it.
 *
 * It lives here, in the pure module, because two callers need it and only one of them can read
 * disk: the page resolves these to render them, and the Studio's counter has to know about them
 * without ever rendering the study.
 *
 * The regex is rebuilt per call — a shared `g` regex carries `lastIndex` and would skip matches
 * depending on who ran it last, the same trap `tokenPattern()` documents.
 *
 * Only bare filenames count. An absolute or protocol-relative URL is somebody else's file and
 * naming it here would have the counter protecting something that is not in the pool.
 */
export function caseStudyImageFiles(markdown: string): string[] {
  const pattern = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
  const files: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const src = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('/')) continue;
    files.push(src);
  }
  return files;
}
