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
 * The sheet, in viewBox units: a page standing straight inside the folder, showing only as a band
 * between the back flap's edge and the front flap.
 *
 * **Its top is at y 9, below the back flap's own top edge at 7.5**, so the paper never rises out
 * of the folder. A strip of back flap shows above it, and the front flap covers everything from
 * 11.87 down, so what is visible is a ~2.9-unit band, about 2.4px at 40px. That is deliberately a
 * hint of a page rather than a preview of one. The width is the back flap's less about 2 units a
 * side (back flap x 3 → 45.5, and its right corner is curving back in at this height), measured
 * off the reference artwork.
 *
 * It replaced a tilted sheet that stood up out of the folder and lifted on hover, which grew
 * wider twice trying to make the picture legible at 40px. At that size it never really was, and
 * the tilt, the overhang past the artwork's box and the hover all existed to serve it. None of
 * them are needed for a page that only peeks, so all three are gone: no `overflow: visible`, no
 * two-group transform split, no clearance arithmetic against the lift.
 *
 * **There is no height here: the sheet takes the cover's own proportions** (see `sheetHeight`), so
 * the band shows the top of the picture in dev and production alike. The alternative was a fixed
 * box with `fit: cover`, and that crops differently in the two: Cloudflare centres its crop while
 * the SVG anchors to the top edge, so production would show the middle of the picture where dev
 * showed its top.
 */
const SHEET = { x: 5.25, y: 9, width: 37.5, radius: 0.75 };

/**
 * The shortest the sheet may be, so its bottom edge always ends behind the front flap (at 11.87)
 * with a margin. Only a very wide panorama would ever come out shorter than this.
 */
const MIN_SHEET_HEIGHT = 4;

/** The sheet's height for a cover of the given size: the cover's own ratio, never less than the floor. */
function sheetHeight(cover: { width: number, height: number }): number {
  return Math.max((SHEET.width * cover.height) / cover.width, MIN_SHEET_HEIGHT);
}

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

  const height = study.cover ? sheetHeight(study.cover) : 0;

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
          {/* Rounds the picture's corners to the paper's. The box is the cover's own shape, so
              nothing is cropped; `slice` only comes into play for a panorama short enough to hit
              `MIN_SHEET_HEIGHT`, and then this also trims the sides it scales past. */}
          <clipPath id={sheetClip}>
            <rect
              x={SHEET.x}
              y={SHEET.y}
              width={SHEET.width}
              height={height}
              rx={SHEET.radius}
            />
          </clipPath>
        </defs>

        {/* Back flap: the colour, then the two shading passes from the source artwork. */}
        <path d={BACK_FLAP_D} fill={study.color} />
        <path d={BACK_FLAP_D} fill="black" fillOpacity="0.1" />
        <path d={BACK_FLAP_D} fill={`url(#${backShading})`} fillOpacity="0.2" />

        {/* The sheet sits between the flaps: painted after the back flap, before the front one,
            which covers all of it but the band at the top. */}
        {study.cover ? (
          <>
            {/* The paper under the picture, so a cover with transparency still reads as a sheet
                rather than as a hole in the folder. */}
            <rect
              x={SHEET.x}
              y={SHEET.y}
              width={SHEET.width}
              height={height}
              rx={SHEET.radius}
              fill="#fff"
            />
            <image
              clipPath={`url(#${sheetClip})`}
              // Width only: the request comes back as the whole cover scaled to the sheet, never
              // cropped, which is what keeps production showing the same top edge as dev.
              href={cloudflareImageUrl(study.cover.url, { width: SHEET.width * UNIT })}
              x={SHEET.x}
              y={SHEET.y}
              width={SHEET.width}
              height={height}
              preserveAspectRatio="xMidYMin slice"
            />
          </>
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
