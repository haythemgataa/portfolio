/**
 * The Figma-style multiplayer cursor used by the footer's typing animation: an arrow with a
 * name pill trailing it.
 *
 * Inlined rather than shipped as a file in `public/`, for two reasons. It is chrome, so it has
 * no `media.json` record and would be swept as an orphan if it went in the pool — and more to
 * the point, the click needs to scale the *arrow* while the pill stays put, which means
 * reaching the `#Cursor` group from CSS. An `<img>` is an independent document, so nothing
 * outside it can address a group inside.
 *
 * It carries literal colour rather than tokens: this is Figma's cursor, and its orange is the
 * point of the reference. Nothing here should follow the page's theme.
 *
 * The hotspot — the pixel that has to land on whatever is being pointed at — differs per
 * pointer: the arrow's tip is at roughly (6, 6.5) in viewBox units, the hand's fingertip at
 * roughly (12.4, 2.2). `POINTER_HOTSPOT` in LastUpdated.tsx holds both, and they have to agree
 * with the artwork or the cursor points somewhere other than where it is aimed. Swapping
 * pointers therefore shifts the element, which is why the swap is timed with a move.
 */
/**
 * Both pointers are always drawn and the stylesheet decides which is visible, rather than one
 * being rendered at a time. Swapping the markup can only ever cut from one to the other; with
 * both present the outgoing one can be scaled and blurred away while the incoming one arrives,
 * which is a transition rather than a substitution.
 *
 * Each is wrapped in a layer that owns *that* switch, with the pointer group nested inside
 * owning the click, wave and clap. Two boxes because they animate the same property: a single
 * element cannot be blurring out and clapping at once.
 */
import { HAND_FILL_D, HAND_LINES_D, HAND_OUTLINE_D } from './handPaths';

type FigmaCursorProps = {
  /** The name pill. Offset when the hand shows, to cancel the hotspot shift — see the styles. */
  nameClassName?: string,
  /** The arrow's layer, and the hand's. Visibility and the cross-fade live here. */
  arrowLayerClassName?: string,
  handLayerClassName?: string,
  /** Applied inside both layers, so click/wave/clap scale a pointer and not the name pill. */
  pointerClassName?: string,
  /** Applied to the impact dashes above the hand — the marks the clap throws off. */
  sparkClassName?: string,
};

const FigmaCursor: React.FC<FigmaCursorProps> = ({
  nameClassName,
  arrowLayerClassName,
  handLayerClassName,
  pointerClassName,
  sparkClassName,
}) => (
  <svg
    width="96"
    height="53"
    viewBox="0 0 96 53"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g className={nameClassName} filter="url(#figmaCursorNameShadow)">
      <path
        d="M18.2649 28.3071C18.2649 21.1274 24.0852 15.3071 31.2649 15.3071H71.2622C78.4419 15.3071 84.2622 21.1274 84.2622 28.3071V28.3071C84.2622 35.4868 78.4419 41.3071 71.2622 41.3071H31.2649C24.0852 41.3071 18.2649 35.4868 18.2649 28.3071V28.3071Z"
        fill="#FB4107"
        shapeRendering="crispEdges"
      />
      <path
        d="M31.2649 15.8071H71.262C78.1655 15.8071 83.762 21.4036 83.762 28.3071C83.762 35.2107 78.1655 40.8071 71.262 40.8071H31.2649C24.3613 40.8071 18.7649 35.2107 18.7649 28.3071C18.7649 21.4036 24.3613 15.8071 31.2649 15.8071Z"
        stroke="white"
        shapeRendering="crispEdges"
      />
      <g fill="white">
        <path d="M28.4094 32.2924V24.3602H29.4826V27.7664H33.6354V24.3602H34.7086V32.2924H33.6354V28.6413H29.4826V32.2924H28.4094Z" />
        <path d="M37.3833 28.1163H36.3567C36.555 26.7515 37.4533 25.9466 38.9697 25.9466C40.6262 25.9466 41.4311 26.9148 41.4311 28.3613V30.7993C41.4311 31.5109 41.4894 31.9541 41.6527 32.2924H40.5678C40.4512 32.0475 40.4162 31.6859 40.4045 31.3126C39.8796 32.0941 39.0397 32.4324 38.2931 32.4324C37.01 32.4324 36.1468 31.8375 36.1468 30.6593C36.1468 29.8078 36.6134 29.1895 37.5232 28.8862C38.3631 28.6063 39.2147 28.5363 40.4045 28.5246V28.3846C40.4045 27.3814 39.9379 26.8332 38.8764 26.8332C37.9899 26.8332 37.5116 27.3231 37.3833 28.1163ZM37.1966 30.636C37.1966 31.2076 37.6749 31.5459 38.3981 31.5459C39.5413 31.5459 40.4045 30.6477 40.4045 29.5861V29.2945C37.7682 29.3178 37.1966 29.8778 37.1966 30.636Z" />
        <path d="M43.28 34.9987C43.0467 34.9987 42.8017 34.9404 42.6734 34.9054V34.1122H42.9884C43.7466 34.1122 43.9566 33.9605 44.5631 32.5724L44.7731 32.0941L42.2418 26.0983H43.35L45.0297 30.1927L45.3097 31.0209L45.5897 30.1927L47.2228 26.0983H48.2726L45.3797 33.109C44.7614 34.6021 44.3532 34.9987 43.28 34.9987Z" />
        <path d="M49.2915 30.5077V26.9148H48.4283V26.0983H49.2915V24.6751H50.3181V26.0983H51.6829V26.9148H50.3181V30.5077C50.3181 31.2542 50.5397 31.6042 51.4496 31.6042H51.6595V32.3391C51.5429 32.3974 51.2863 32.4324 50.9946 32.4324C49.8398 32.4324 49.2915 31.8142 49.2915 30.5077Z" />
        <path d="M52.6602 32.2924V23.8936H53.6867V26.9381C54.1067 26.2849 54.7832 25.9466 55.5998 25.9466C56.918 25.9466 57.6995 26.7165 57.6995 28.1513V32.2924H56.673V28.3613C56.673 27.4281 56.253 26.8215 55.3198 26.8215C54.2933 26.8215 53.6867 27.743 53.6867 28.6296V32.2924H52.6602Z" />
        <path d="M64.69 30.2744C64.3517 31.7208 63.3135 32.4324 61.9021 32.4324C60.1056 32.4324 59.0208 31.2192 59.0208 29.2012C59.0208 27.1015 60.1056 25.9466 61.8437 25.9466C63.5935 25.9466 64.6434 27.1481 64.6434 29.1195V29.3762H60.0706C60.129 30.7643 60.7822 31.5459 61.9021 31.5459C62.7769 31.5459 63.3952 31.1259 63.6168 30.2744H64.69ZM61.8437 26.8332C60.8522 26.8332 60.2573 27.4514 60.1056 28.6063H63.5702C63.4302 27.4631 62.8119 26.8332 61.8437 26.8332Z" />
        <path d="M66.0113 32.2924V26.0983H67.0378V26.8915C67.4344 26.2616 68.0527 25.9466 68.8109 25.9466C69.6625 25.9466 70.2807 26.3199 70.5723 27.0431C70.9806 26.3199 71.6572 25.9466 72.4854 25.9466C73.7453 25.9466 74.5035 26.7165 74.5035 28.1513V32.2924H73.477V28.3613C73.477 27.4281 73.1037 26.8215 72.2638 26.8215C71.3306 26.8215 70.7706 27.743 70.7706 28.6296V32.2924H69.7441V28.3613C69.7441 27.4281 69.3708 26.8215 68.5309 26.8215C67.5977 26.8215 67.0378 27.743 67.0378 28.6296V32.2924H66.0113Z" />
      </g>
    </g>
    <g className={arrowLayerClassName}>
      <g className={pointerClassName} filter="url(#figmaCursorArrowShadow)">
        <path
          d="M10.9965 20.7803L5.75593 7.95432C5.48533 7.29205 6.13025 6.62296 6.81026 6.86047L19.9799 11.4602C20.6801 11.7048 20.7357 12.6648 20.0684 12.9878L15.126 15.3795C14.9465 15.4664 14.8042 15.614 14.7249 15.7957L12.5404 20.7979C12.2455 21.4733 11.2751 21.4623 10.9965 20.7803Z"
          fill="#FB4107"
        />
        <path
          d="M5.36828 8.11052C4.96238 7.11711 5.93004 6.11318 6.95006 6.46944L20.1192 11.0685C21.1694 11.4353 21.253 12.876 20.2522 13.3605L15.3093 15.7518C15.2196 15.7952 15.1484 15.8692 15.1087 15.96L12.9248 20.9627C12.4823 21.9757 11.0261 21.959 10.6081 20.936L5.36828 8.11052Z"
          stroke="white"
          strokeWidth="0.833222"
        />
      </g>
    </g>
    <g className={handLayerClassName}>
      <g className={pointerClassName}>
        <g filter="url(#figmaCursorHandOutlineShadow)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d={HAND_OUTLINE_D}
            fill="white"
          />
        </g>
        <path
          d={HAND_FILL_D}
          fill="white"
        />
        <g filter="url(#figmaCursorHandShadow)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d={HAND_LINES_D}
            fill="#FB4107"
          />
        </g>
        {/* The marks the clap throws off. Inside the pointer group on purpose, so they scale
            and travel with the hand and stay the same distance above it at any size; they are
            authored just above the hand's top edge, which is above the viewBox once the clap
            enlarges things — hence `overflow: visible` on the svg in the stylesheet. Hidden
            until the clap, so they cost nothing the rest of the time. */}
        <g
          className={sparkClassName}
          stroke="#FB4107"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        >
          <path d="M6 0.4 L4.2 -3.6" />
          <path d="M12 -0.8 L12 -5.4" />
          <path d="M18 0.4 L19.8 -3.6" />
        </g>
      </g>
    </g>
    <defs>
      <filter
        id="figmaCursorNameShadow"
        x="13.2656"
        y="10.3078"
        width="82.6618"
        height="42.6644"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dx="3.33289" dy="3.33289" />
        <feGaussianBlur stdDeviation="4.16611" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.984314 0 0 0 0 0.254902 0 0 0 0 0.027451 0 0 0 0.16 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="nameShadow1" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="0.833222" />
        <feGaussianBlur stdDeviation="0.833222" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0" />
        <feBlend mode="normal" in2="nameShadow1" result="nameShadow2" />
        <feBlend mode="normal" in="SourceGraphic" in2="nameShadow2" result="shape" />
      </filter>
      <filter
        id="figmaCursorArrowShadow"
        x="3.18732"
        y="5.14725"
        width="19.8546"
        height="19.4799"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="0.833222" />
        <feGaussianBlur stdDeviation="0.833222" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="arrowShadow" />
        <feBlend mode="normal" in="SourceGraphic" in2="arrowShadow" result="shape" />
      </filter>
      <filter
        id="figmaCursorHandOutlineShadow"
        x="0.923133"
        y="0.923114"
        width="21.5956"
        height="23.9999"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="0.923077" />
        <feGaussianBlur stdDeviation="0.923077" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="handOutlineShadow" />
        <feBlend mode="normal" in="SourceGraphic" in2="handOutlineShadow" result="shape" />
      </filter>
      <filter
        id="figmaCursorHandShadow"
        x="1.84611"
        y="1.84597"
        width="19.7496"
        height="22.1537"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="0.923077" />
        <feGaussianBlur stdDeviation="0.923077" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0" />
        <feBlend mode="normal" in2="BackgroundImageFix" result="handShadow" />
        <feBlend mode="normal" in="SourceGraphic" in2="handShadow" result="shape" />
      </filter>
    </defs>
  </svg>
);

export default FigmaCursor;
