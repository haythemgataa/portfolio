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

const nextConfig: NextConfig = {
  output: 'export',
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
