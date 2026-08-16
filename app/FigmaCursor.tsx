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
            d="M12.4395 3.69531C12.9144 3.73325 13.288 4.13069 13.288 4.61542V11.077H14.2111V5.53665C14.212 5.02767 14.6249 4.61542 15.1342 4.61542C15.2616 4.61542 15.383 4.64125 15.4935 4.68796C15.6298 4.74561 15.7493 4.83505 15.8429 4.94699C15.9767 5.10718 16.0573 5.31343 16.0573 5.5385V11.077H16.9803V8.30773C16.9803 7.79791 17.3936 7.38465 17.9034 7.38465C18.0309 7.38465 18.1523 7.41048 18.2627 7.45719C18.334 7.48736 18.4008 7.52624 18.4616 7.5725C18.6833 7.7411 18.8265 8.0077 18.8265 8.30773V15.6923C18.8265 18.2413 16.7601 20.3077 14.2111 20.3077H13.288C10.7597 20.3077 8.44791 17.8268 6.53944 15.7788C5.99477 15.1943 5.48294 14.645 5.00831 14.1987C4.91961 14.1153 4.84564 14.0212 4.78677 13.9202C4.67394 13.7265 4.61631 13.5071 4.61548 13.287C4.61529 13.235 4.61826 13.183 4.62441 13.1314C4.65189 12.9004 4.74295 12.6754 4.89947 12.4858C5.03453 12.3223 5.20303 12.2039 5.38641 12.133C5.47599 12.0984 5.56912 12.0751 5.66366 12.0634C5.95165 12.0277 6.25267 12.0996 6.50582 12.2867L8.67265 13.8875V6.46158C8.67265 6.39785 8.67911 6.33563 8.6914 6.27554C8.75657 5.95705 8.98573 5.69833 9.28681 5.59145C9.3834 5.55716 9.48738 5.5385 9.59573 5.5385C10.1051 5.5385 10.5183 5.95127 10.5188 6.46066V11.077H11.4419L11.4419 6.46158L11.4419 6.45975L11.4419 4.61542C11.4419 4.10561 11.8551 3.69235 12.365 3.69235C12.39 3.69235 12.4149 3.69335 12.4395 3.69531ZM14.4933 2.84401C13.9858 2.23468 13.2214 1.84619 12.365 1.84619C11.1576 1.84619 10.1307 2.61886 9.75177 3.69669C9.70009 3.69381 9.64806 3.69235 9.59573 3.69235C8.06629 3.69235 6.82649 4.93214 6.82649 6.46158V10.3858C5.65412 9.96354 4.30759 10.3032 3.47605 11.3102C2.43761 12.5677 2.55741 14.4284 3.74374 15.5437C4.22367 15.995 4.72914 16.528 5.28347 17.1125C5.38595 17.2206 5.4901 17.3304 5.59607 17.4418C6.26413 18.1441 6.99158 18.8946 7.7657 19.5788C9.28849 20.9248 11.1431 22.1539 13.288 22.1539H14.2111C17.7797 22.1539 20.6726 19.2609 20.6726 15.6923V8.30773C20.6726 6.77827 19.4327 5.5385 17.9034 5.5385C17.9034 4.00904 16.6635 2.76927 15.1342 2.76927C14.9139 2.76927 14.6993 2.79514 14.4933 2.84401ZM5.61129 13.0735C5.70232 12.9634 5.84707 12.9477 5.9573 13.0291ZM5.9573 13.0291L9.59573 15.7172V12H17.9034L17.9034 15.6923C17.9034 17.7315 16.2503 19.3847 14.2111 19.3847H13.288C12.0355 19.3847 10.727 18.5803 9.35374 17.3255C8.68534 16.7148 8.04397 16.0381 7.42163 15.3713C7.35244 15.2972 7.28329 15.223 7.21424 15.1489C6.67365 14.5686 6.13919 13.995 5.64063 13.5262C5.51665 13.4097 5.5043 13.2032 5.61129 13.0735"
            fill="white"
          />
        </g>
        <path
          d="M12.3648 3.69238C11.855 3.69238 11.4418 4.10564 11.4418 4.61546V11.077H10.5187V6.46161C10.5187 5.9518 10.1053 5.53854 9.5956 5.53854C9.08578 5.53854 8.67252 5.9518 8.67252 6.46161V13.8876L6.50569 12.2867C5.99929 11.9126 5.30135 11.9991 4.89935 12.4858C4.48194 12.9914 4.53003 13.7492 5.00819 14.1988C7.14587 16.2087 10.038 20.3078 13.2879 20.3078H14.211C16.76 20.3078 18.8264 18.2414 18.8264 15.6924V8.30777C18.8264 7.79795 18.413 7.38469 17.9033 7.38469C17.3935 7.38469 16.9802 7.79795 16.9802 8.30777V11.077H16.0571V5.53854C16.0571 5.02872 15.6438 4.61546 15.1341 4.61546C14.6248 4.61546 14.2119 5.02771 14.211 5.53669V11.077H13.2879V4.61546C13.2879 4.10564 12.8746 3.69238 12.3648 3.69238Z"
          fill="white"
        />
        <g filter="url(#figmaCursorHandShadow)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.5187 4.6152C10.5187 3.59559 11.3452 2.76904 12.3648 2.76904C13.1701 2.76904 13.855 3.28465 14.1073 4.00375C14.4009 3.80695 14.754 3.69212 15.1341 3.69212C16.1536 3.69212 16.9802 4.51864 16.9802 5.53827V6.70837C17.2517 6.55126 17.567 6.46135 17.9033 6.46135C18.9228 6.46135 19.7495 7.28787 19.7495 8.3075V15.6921C19.7495 18.7509 17.2698 21.2306 14.211 21.2306H13.2879C9.70302 21.2306 6.74743 17.1009 4.37588 14.871C3.54364 14.0886 3.45973 12.7793 4.18767 11.8978C4.90056 11.0345 6.1517 10.8772 7.05428 11.544L7.74945 12.0576V6.46135C7.74945 5.44172 8.57597 4.6152 9.59561 4.6152C9.93188 4.6152 10.2471 4.7051 10.5187 4.86221V4.6152ZM11.4418 4.6152C11.4418 4.10538 11.855 3.69212 12.3648 3.69212C12.8747 3.69212 13.2879 4.10538 13.2879 4.6152V11.0767H14.211V5.53643C14.2119 5.02744 14.6248 4.6152 15.1341 4.6152C15.6438 4.6152 16.0571 5.02846 16.0571 5.53827V11.0767H16.9802V8.3075C16.9802 7.79769 17.3935 7.38443 17.9033 7.38443C18.413 7.38443 18.8264 7.79769 18.8264 8.3075V15.6921C18.8264 18.2411 16.76 20.3075 14.211 20.3075H13.2879C10.038 20.3075 7.14587 16.2085 5.00819 14.1985C4.53004 13.749 4.48194 12.9911 4.89936 12.4855C5.30136 11.9988 5.9993 11.9123 6.5057 12.2864L8.67253 13.8873V6.46135C8.67253 5.95154 9.08579 5.53827 9.59561 5.53827C10.1053 5.53827 10.5187 5.95154 10.5187 6.46135V11.0767H11.4418V4.6152Z"
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
