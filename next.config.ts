import type { NextConfig } from "next";
import { execSync } from "child_process";

// Cloudflare Pages' configured production branch is a dashboard setting that
// has not been read (confirmation is scheduled in Phase 2). This is the one
// line to change if it turns out not to be "main".
const PRODUCTION_BRANCH = "main";

function getGitBranch(): string {
  // Cloudflare Pages uses detached HEAD, so prefer CF_PAGES_BRANCH
  if (process.env.CF_PAGES_BRANCH) {
    return process.env.CF_PAGES_BRANCH;
  }
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

// The content Studio (/studio) is a dev-only tool that writes to public/content
// via route handlers. Two things keep it out of the production build:
//
//  1. Its files are named `page.studio.tsx` / `route.studio.ts`, which only
//     count as routes while the extra pageExtensions below are active.
//  2. `output: 'export'` rejects any non-static route handler even when merely
//     running `next dev`, so it is applied to production builds only.
//
// Tradeoff of (2): `next dev` no longer enforces static-export constraints, so
// an unsupported feature added elsewhere in the app surfaces at `npm run build`
// rather than immediately in dev. `npm run build` still runs the full export.
const STUDIO_ENABLED = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: STUDIO_ENABLED ? undefined : 'export',
  experimental: {
    // Turns on `app/global-not-found.tsx`, which is what lets the 404 page step outside the root
    // layout. It has to: `app/not-found.tsx` renders as the layout's `children`, and the header,
    // tab bar, About and footer around it leave 286px of clear space on a 1280x800 window and
    // 134px at 375px wide — measured — which a full-viewport 404 does not fit into.
    //
    // Experimental, and deliberately taken anyway: it is the only convention that bypasses the
    // layout (Next's own production checklist recommends the file), and a break would surface as
    // a failed build rather than as a bad page. Verified against `output: 'export'` on this repo
    // — it emits `out/404.html` with none of the layout's chrome. Note that per the comment above,
    // `output: 'export'` is applied to production builds only, so `npm run build` is where that
    // check actually happens.
    globalNotFound: true,
  },
  pageExtensions: STUDIO_ENABLED
    ? ["studio.tsx", "studio.ts", "tsx", "ts", "jsx", "js"]
    : ["tsx", "ts", "jsx", "js"],
  images: {
    unoptimized: true,
  },
  trailingSlash: false,
  // Pin the workspace root so Turbopack doesn't pick up stray lockfiles above the repo
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_GIT_BRANCH: getGitBranch(),
    NEXT_PUBLIC_CDN_IMAGES: String(
      Boolean(process.env.CF_PAGES) && getGitBranch() === PRODUCTION_BRANCH
    ),
    // The theme switch is a working tool, not a site feature: it exists so both themes can be
    // checked without touching OS settings. Off on the production branch, on everywhere else —
    // preview deploys and local dev alike. Resolved at build time and inlined, so the button's
    // markup is absent from the production export rather than merely hidden by it.
    NEXT_PUBLIC_THEME_SWITCH: String(getGitBranch() !== PRODUCTION_BRANCH),
  },
};

export default nextConfig;
