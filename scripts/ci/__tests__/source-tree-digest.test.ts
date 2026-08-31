import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  RELEASE_EVIDENCE_PREFIX,
  sourceTreeDigest,
} from "../release-receipt";

/**
 * The binding digest, proven in a throwaway repository.
 *
 * Receipts used to bind to `git rev-parse HEAD` and `HEAD^{tree}`, and
 * `release-receipt.yml` commits every receipt to `main`. So the workflow
 * verified a receipt at commit X, committed it as Y, and at Y the receipt
 * failed its own binding. Minting a second criterion invalidated the first.
 * The subsystem could never hold more than zero valid receipts at once.
 *
 * These tests assert the two halves that make the fix correct rather than
 * merely convenient: recording evidence must NOT move the digest, and touching
 * real source MUST move it. A fix with only the first half would be a hole.
 */

let repo: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}

function commit(message: string): void {
  git("add", "-A");
  git(
    "-c",
    "user.email=t@example.com",
    "-c",
    "user.name=t",
    "commit",
    "-q",
    "-m",
    message,
  );
}

function write(rel: string, body: string): void {
  const full = join(repo, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "source-tree-digest-"));
  git("init", "-q", "-b", "main");
  write("lib/thing.ts", "export const a = 1;\n");
  write("README.md", "# repo\n");
  commit("initial");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("sourceTreeDigest", () => {
  it("is deterministic for the same tree", () => {
    expect(sourceTreeDigest("HEAD", repo)).toBe(sourceTreeDigest("HEAD", repo));
  });

  it("does NOT move when a receipt is committed", () => {
    /**
     * The catch-22, directly. Committing a receipt is exactly what the
     * workflow does after verifying one, and it used to invalidate the receipt
     * it had just verified.
     */
    const before = sourceTreeDigest("HEAD", repo);
    write(
      `${RELEASE_EVIDENCE_PREFIX}1.0.0/C2-secrets-scan.receipt.json`,
      '{"keyId":"k","signature":"s","receipt":{}}\n',
    );
    commit("chore(release-gate): receipt for C2-secrets-scan");
    expect(sourceTreeDigest("HEAD", repo)).toBe(before);
  });

  it("does NOT move when a SECOND receipt is committed", () => {
    // The half that made it compounding: each receipt commit invalidated every
    // receipt already committed, so six criteria could never hold at once.
    const before = sourceTreeDigest("HEAD", repo);
    write(
      `${RELEASE_EVIDENCE_PREFIX}1.0.0/A3-no-sev1-sev2-open.receipt.json`,
      '{"keyId":"k","signature":"s2","receipt":{}}\n',
    );
    commit("chore(release-gate): receipt for A3-no-sev1-sev2-open");
    expect(sourceTreeDigest("HEAD", repo)).toBe(before);
  });

  it("does NOT move when an evidence markdown file changes", () => {
    // Evidence files live under the same prefix and are edited by the owner.
    const before = sourceTreeDigest("HEAD", repo);
    write(`${RELEASE_EVIDENCE_PREFIX}1.0.0/C2-secrets-scan.md`, "status: pass\n");
    commit("docs: evidence");
    expect(sourceTreeDigest("HEAD", repo)).toBe(before);
  });

  it("DOES move when real source changes", () => {
    // The property that must survive the fix. Without this the digest would be
    // a binding that binds nothing.
    const before = sourceTreeDigest("HEAD", repo);
    write("lib/thing.ts", "export const a = 2;\n");
    commit("feat: change source");
    expect(sourceTreeDigest("HEAD", repo)).not.toBe(before);
  });

  it("DOES move when a source file is added or removed", () => {
    const before = sourceTreeDigest("HEAD", repo);
    write("lib/other.ts", "export const b = 1;\n");
    commit("feat: add source");
    const added = sourceTreeDigest("HEAD", repo);
    expect(added).not.toBe(before);

    rmSync(join(repo, "lib/other.ts"));
    commit("feat: remove source");
    expect(sourceTreeDigest("HEAD", repo)).toBe(before);
  });

  it("binds content, not commit identity", () => {
    /**
     * Two different commits with identical source must agree. A receipt
     * measured against source that has not changed is still a measurement of
     * that source -- which is precisely why binding to the commit SHA was the
     * wrong instrument, not merely an inconvenient one.
     */
    const before = sourceTreeDigest("HEAD", repo);
    const beforeSha = git("rev-parse", "HEAD").trim();
    write("README.md", "# repo\n");           // rewrite identical content
    git("add", "-A");
    git(
      "-c", "user.email=t@example.com", "-c", "user.name=t",
      "commit", "-q", "--allow-empty", "-m", "chore: no content change",
    );
    expect(git("rev-parse", "HEAD").trim()).not.toBe(beforeSha);
    expect(sourceTreeDigest("HEAD", repo)).toBe(before);
  });

  it("refuses a tree with no non-evidence entries rather than matching anything", () => {
    /**
     * Population control. An empty listing hashes to a stable value that would
     * match itself on both sides -- a binding that always passes while
     * measuring nothing, invisible precisely because the two sides agree.
     */
    const bare = mkdtempSync(join(tmpdir(), "source-tree-empty-"));
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: bare });
      mkdirSync(join(bare, RELEASE_EVIDENCE_PREFIX), { recursive: true });
      writeFileSync(join(bare, `${RELEASE_EVIDENCE_PREFIX}only.json`), "{}\n");
      execFileSync("git", ["add", "-A"], { cwd: bare });
      execFileSync(
        "git",
        ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "-m", "evidence only"],
        { cwd: bare },
      );
      expect(() => sourceTreeDigest("HEAD", bare)).toThrow(/no non-evidence entries/);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
