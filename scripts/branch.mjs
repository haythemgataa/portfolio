// Which git branch this build is, and which one is production.
//
// Lives here rather than in `next.config.ts` because two readers need the same answer and they
// run in different worlds: the config, which inlines `NEXT_PUBLIC_*` literals at build time, and
// `clean-export.mjs`, a plain node script that runs after the export and cannot see them. A second
// copy of `PRODUCTION_BRANCH` would break the promise its comment makes — that it is *the* one
// line to change if the production branch turns out not to be "main".

import { execSync } from 'node:child_process';

// Cloudflare Pages' configured production branch is a dashboard setting that has not been read
// (confirmation is scheduled in Phase 2). This is the one line to change if it turns out not to
// be "main".
export const PRODUCTION_BRANCH = 'main';

/**
 * Cloudflare Pages builds in detached HEAD, so `CF_PAGES_BRANCH` is preferred over asking git —
 * `rev-parse --abbrev-ref HEAD` answers "HEAD" there, which matches no branch name at all.
 * Returns '' when neither is available, which every caller treats as "not production".
 */
export function getGitBranch() {
  if (process.env.CF_PAGES_BRANCH) {
    return process.env.CF_PAGES_BRANCH;
  }
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

/** Whether this build is the real, public site — the one deploy that gets indexed and counted. */
export function isProductionBranch() {
  return getGitBranch() === PRODUCTION_BRANCH;
}
