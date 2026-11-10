import { Children, isValidElement, memo } from "react";
import Markdown from 'react-markdown';
import ProseImage from "./ProseImage";
import type { ResolvedMedia } from "./lib/contentTypes";

type Components = Partial<{
  [TagName in keyof React.JSX.IntrinsicElements]: React.FunctionComponent<React.JSX.IntrinsicElements[TagName]>
}>;

type RichTextProps = {
  text: string,
  /**
   * Pool media, keyed by the filename a `![alt](filename.webp)` in the text names.
   *
   * Plain data rather than a component override, and that is forced rather than chosen: a server
   * component cannot hand a *function* across the boundary to a client one, and `RichText` is
   * rendered from both sides. So the caller resolves the filenames — which is where the registry
   * and the warning belong anyway — and `ProseImage` owns the markup.
   *
   * Omitted where prose carries no images, which is everywhere but a case study today. Without it
   * an `![...]()` falls through to react-markdown's plain `<img>`.
   */
  images?: Record<string, ResolvedMedia>,
};

const Link: React.FC<React.JSX.IntrinsicElements['a']> = memo(({ href, children }) => {
  return <a href={href} target='_blank'>{children}</a>;
});
Link.displayName = 'Link';

const baseComponents: Components = {
  a: Link,
};

const RichText: React.FC<RichTextProps> = ({
  text,
  images,
}) => {
  // Rebuilt per render only when there are images to resolve, so every other caller keeps the
  // module-level constant and the memoised `Link` with it.
  let components: Components = baseComponents;
  if (images) {
    const Image: Components['img'] = ({ src, alt, title }) => {
      const media = typeof src === 'string' ? images[src] : undefined;
      if (!media) {
        // The author's own src, left exactly as written so a bad reference fails visibly.
        // Rendering nothing would make a typo look like a feature that silently does not
        // work — the call `resolveHeading` already makes for an unresolved `[token]`.
        // eslint-disable-next-line @next/next/no-img-element -- see above
        return <img src={src} alt={alt ?? ''} title={title} />;
      }
      return <ProseImage media={media} alt={alt ?? ''} title={title} />;
    };

    components = {
      ...baseComponents,
      // A paragraph that is only an image is unwrapped, so the figure is not nested inside a `<p>`
      // it cannot legally live in — see `isLoneImage`. Every other paragraph is untouched, which
      // is what keeps an image used *inline* in a sentence working.
      p: ({ children }) =>
        isLoneImage(children, Image!) ? <>{children}</> : <p>{children}</p>,
      img: Image,
    };
  }

  return (
    <Markdown components={components as any}>{text}</Markdown>
  )
}

/**
 * Whether a paragraph holds nothing but one image.
 *
 * **A markdown image on its own line is still a paragraph**, so react-markdown emits
 * `<p><img></p>` — and a `<figure>` is flow content, which cannot legally be a descendant of `<p>`.
 * The parser then closes the paragraph early and hoists the figure out, so the DOM the browser
 * builds does not match the one React rendered: nine invalid `<p><figure>` pairs in the export and
 * a hydration failure that made React throw away the server HTML and re-render the whole page.
 *
 * Caught only because the dev overlay counts these; nothing about the page *looked* wrong, because
 * the browser's recovery happens to put the figure in a sensible place.
 *
 * Whitespace-only text nodes are ignored: markdown leaves them around an image inside a paragraph
 * and they would otherwise make a lone image look like mixed content.
 */
function isLoneImage(children: React.ReactNode, imageComponent: React.ElementType): boolean {
  const real = Children.toArray(children).filter(
    (child) => typeof child !== 'string' || child.trim() !== ''
  );
  if (real.length !== 1) return false;
  const [only] = real;
  // Compared against the override itself, not against `ProseImage` or the string `'img'`.
  // react-markdown builds the tree from the `components` map, so the child of a `<p>` is an
  // element whose `type` *is* the function below — never the component it happens to return.
  // Getting that wrong is silent: the test simply never matches and the nesting stays broken.
  return isValidElement(only) && only.type === imageComponent;
}

export default RichText;
