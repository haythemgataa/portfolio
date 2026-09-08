import { cloudflareImageUrl } from "./lib/cloudflareImage";
import styles from "./CaseStudies.module.css";
import type { ResolvedCaseStudy } from "./lib/contentTypes";

/**
 * The folder standing at the left of a case study card: the study's own colour, one page from it
 * peeking out of the mouth, and the product's mark on the front flap.
 *
 * **The whole thing is two layers, and the split is a consequence rather than a preference.**
 *
 * The folder and the sheet are one inline `<svg>`, because their alignment must not drift: every
 * number below is in viewBox units, so the sheet stays in the mouth at any `--folder-size`. Two
 * `<svg>`s with an HTML sheet between them would put that relationship in two coordinate systems.
 *
 * The logo is an HTML `<span>` laid over it, and both halves of what it has to do force it out of
 * the SVG. It must be recoloured to white from a file the pool owns, which only a CSS mask can do
 * — an SVG `<image>` is an independent document, and an SVG `<mask>` cannot reference an external
 * one. And it must carry a real perspective, which is a 3D transform: reliable on an HTML element,
 * historically unreliable on an SVG element in WebKit — the engine that already cost this repo the
 * matted thumbnail's shadow (see `Attachments.module.css`). Nothing can slip between the two
 * layers, because both are sized to the same `--folder-size` box.
 *
 * The colour and the shading are **literals, not tokens**. The orange is a fact about DeepPCB the
 * way `FigmaCursor.tsx`'s `#fb4107` is a fact about Figma, and the black-10% and the two gradients
 * are shading on an object rather than page chrome — the same argument the media scrims make. So
 * the folder needs no dark rule; the card around it is all tokens and flips for free.
 */

/** The source artwork's coordinate system. Everything below is expressed in these units. */
const VIEWBOX = 48;

/**
 * Displayed size in CSS px. Reaches the stylesheet as `--folder-size`, and the sheet's Cloudflare
 * request is derived from it too — the `ICON_SIZE` / `THUMBNAIL_*` pattern, one source of truth.
 *
 * It has a ceiling it must stay under: the card is 64px tall around a 42px content box, so a
 * folder taller than 42 would become the thing setting the card's height and the arithmetic in
 * `.card` would quietly stop being true. Everything inside is in viewBox units or percentages, so
 * the size is the only number that changes here.
 */
export const FOLDER_SIZE = 40;

/** viewBox units to CSS px at the size the folder is actually drawn. */
const UNIT = FOLDER_SIZE / VIEWBOX;

const BACK_FLAP_D =
  "M3 6V12H45.5045V10.5C45.5045 8.84315 44.1452 7.5 42.4685 7.5H21.3052C20.2999 7.5 19.3598 " +
  "7.00833 18.7946 6.18693L17.505 4.31307C16.9398 3.49167 15.9997 3 14.9945 3H6.03603C4.35928 " +
  "3 3 4.34315 3 6Z";

const FRONT_FLAP_D =
  "M0.0127156 15.1384C-0.148916 13.3816 1.251 11.8668 3.03628 11.8668H44.9637C46.749 11.8668 " +
  "48.1489 13.3816 47.9873 15.1384L45.5033 42.1384C45.3611 43.6837 44.0499 44.8668 42.4797 " +
  "44.8668H5.52031C3.95006 44.8668 2.63891 43.6837 2.49674 42.1384L0.0127156 15.1384Z";

/**
 * The sheet, in viewBox units.
 *
 * **Nothing clips its left or right edge, and that is the point** — those are the paper's own
 * edges, and a sheet cut off by a straight vertical line reads as a slice of something rather than
 * as a page. Only the bottom is hidden, and the front flap does that by being painted after it.
 *
 * So the geometry has to keep itself inside the folder. It starts at x = 22.5 because the back
 * flap's tab occupies everything to the left of x ≈ 21.3 and the sheet is painted *over* the back
 * flap: any further left and the paper would cross the tab and read as sitting in front of the
 * folder. It ends at 43.5, inside the back flap's right edge at 45.5. Tilted and lifted, the
 * corners reach x 21.8 → 42.8 and y 1.3 at the very top, all of it still within the artwork's box.
 *
 * The height is 15 rather than the full mouth-to-floor, and that is about the picture rather than
 * the paper: the visible band is only ~8.4 units tall, and `slice` crops whatever it is given to
 * cover, so a taller box would zoom a 16:9 cover much harder for no visible gain.
 */
const SHEET = { x: 22.5, y: 3.5, width: 21, height: 15, radius: 1 };

/** Degrees. Negative is counter-clockwise in SVG's y-down space, so the sheet's outer corner rises. */
const SHEET_TILT = -4;

type CaseStudyFolderProps = {
  study: ResolvedCaseStudy,
};

const CaseStudyFolder: React.FC<CaseStudyFolderProps> = ({ study }) => {
  /**
   * The gradients and the clip need document-unique ids, or a second card on the page reuses the
   * first's and both folders render flat.
   *
   * The slug supplies it rather than `useId()`, for two reasons: `assertValidSlugs` in the loader
   * already guarantees it is unique among case studies, so the uniqueness is enforced where it can
   * be read; and a literal derived from content is identical on the server and the client, where a
   * generated id is one more thing that has to survive hydration. Non-word characters are stripped
   * because this lands inside a `url(#…)` reference.
   */
  const uid = study.slug.replace(/[^a-zA-Z0-9_-]/g, "");
  const shading = `folder-shade-${uid}`;
  const backShading = `folder-back-shade-${uid}`;
  const sheetClip = `folder-sheet-${uid}`;

  const sheetCentre = {
    x: SHEET.x + SHEET.width / 2,
    y: SHEET.y + SHEET.height / 2,
  };

  return (
    <span
      className={styles.folder}
      style={{
        "--folder-size": `${FOLDER_SIZE}px`,
        // Only set when there is a mark; the rule below is written so an absent value simply
        // draws nothing rather than masking a white square onto the flap.
        ...(study.logoUrl ? { "--logo-url": `url("${study.logoUrl}")` } : {}),
      } as React.CSSProperties}
    >
      {/* Decorative in full: the card's own text already names the study, so a description here
          would be the same words a second time. */}
      <svg
        className={styles.folderArt}
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        fill="none"
        aria-hidden="true"
        focusable="false"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={backShading} x1="24.25" y1="4.96" x2="24.25" y2="12" gradientUnits="userSpaceOnUse">
            <stop offset="0.36055" stopOpacity="0" />
            <stop offset="1" />
          </linearGradient>
          <linearGradient id={shading} x1="24" y1="12" x2="24" y2="44.8668" gradientUnits="userSpaceOnUse">
            <stop offset="0.4" stopOpacity="0" />
            <stop offset="1" stopOpacity="0.6" />
          </linearGradient>
          {/* The only clip in the folder, and it is load-bearing: `preserveAspectRatio="… slice"`
              scales the picture to *cover* its box and lets the overflow paint, so without this
              the cover would spill past the paper on whichever axis it was cropped. */}
          <clipPath id={sheetClip}>
            <rect
              x={SHEET.x}
              y={SHEET.y}
              width={SHEET.width}
              height={SHEET.height}
              rx={SHEET.radius}
            />
          </clipPath>
        </defs>

        {/* Back flap: the colour, then the two shading passes from the source artwork. */}
        <path d={BACK_FLAP_D} fill={study.color} />
        <path d={BACK_FLAP_D} fill="black" fillOpacity="0.1" />
        <path d={BACK_FLAP_D} fill={`url(#${backShading})`} fillOpacity="0.2" />

        {/* Two groups, each with exactly one job — the discipline `Tabs.module.css` uses for the
            travelling pill. The tilt cannot share a `transform` with the lift: CSS replaces the
            whole property, so a hover rule on the same element would silently drop the rotation. */}
        {study.cover ? (
          <g className={styles.sheet}>
            <g transform={`rotate(${SHEET_TILT} ${sheetCentre.x} ${sheetCentre.y})`}>
              {/* The paper under the picture, so a cover with transparency still reads as a sheet
                  rather than as a hole in the folder. */}
              <rect
                x={SHEET.x}
                y={SHEET.y}
                width={SHEET.width}
                height={SHEET.height}
                rx={SHEET.radius}
                fill="#fff"
              />
              <image
                clipPath={`url(#${sheetClip})`}
                href={cloudflareImageUrl(study.cover.url, {
                  width: SHEET.width * UNIT,
                  height: SHEET.height * UNIT,
                  fit: "cover",
                })}
                x={SHEET.x}
                y={SHEET.y}
                width={SHEET.width}
                height={SHEET.height}
                // The top of the picture is the part that shows, so anchor there and crop the
                // rest — `slice` is `object-fit: cover`, `xMidYMin` is its top edge.
                preserveAspectRatio="xMidYMin slice"
              />
            </g>
          </g>
        ) : null}

        {/* Front flap last, so it covers the sheet's lower edge whatever the sheet is doing. */}
        <path d={FRONT_FLAP_D} fill={study.color} />
        <path d={FRONT_FLAP_D} fill={`url(#${shading})`} fillOpacity="0.2" />
      </svg>

      {study.logoUrl ? <span className={styles.folderLogo} aria-hidden="true" /> : null}
    </span>
  );
};

export default CaseStudyFolder;
