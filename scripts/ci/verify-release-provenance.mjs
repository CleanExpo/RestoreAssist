#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const RELEASE_TAG = /^refs\/tags\/v\d+\.\d+\.\d+$/;

export function verifyReleaseProvenance({ ref, sha, mainSha }) {
  if (!RELEASE_TAG.test(ref) && ref !== "refs/heads/main") {
    throw new Error(
      `release runs must use an exact semver tag or refs/heads/main; observed ${ref || "<missing>"}`,
    );
  }
  if (!FULL_SHA.test(sha) || !FULL_SHA.test(mainSha)) {
    throw new Error("release SHA and origin/main SHA must both be full 40-character Git SHAs");
  }
  if (sha.toLowerCase() !== mainSha.toLowerCase()) {
    throw new Error(
      `release revision must equal the current origin/main tip; release=${sha} main=${mainSha}`,
    );
  }
}

export function main() {
  try {
    execFileSync(
      "git",
      [
        "fetch",
        "--no-tags",
        "origin",
        "+refs/heads/main:refs/remotes/origin/main",
      ],
      { stdio: "inherit" },
    );
    const mainSha = execFileSync("git", ["rev-parse", "origin/main"], {
      encoding: "utf8",
    }).trim();
    verifyReleaseProvenance({
      ref: process.env.GITHUB_REF ?? "",
      sha: process.env.GITHUB_SHA ?? "",
      mainSha,
    });
    console.log(`[release-provenance] PASS ${process.env.GITHUB_REF} @ ${mainSha}`);
    return 0;
  } catch (error) {
    console.error(`[release-provenance] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
