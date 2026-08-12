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
  },
};

export default nextConfig;
