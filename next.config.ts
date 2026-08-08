import type { NextConfig } from "next";
import { execSync } from "child_process";

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
  },
};

export default nextConfig;
