/**
 * S520:2024 citation guard — REAL source scanner.
 *
 * Replaces the earlier stub (which hard-coded a list of citations and admitted
 * it did "not necessarily real runtime execution"). This version actually walks
 * lib/ and app/, extracts every `S520:2024 §…` literal, and asserts each one
 * resolves to a REAL top-level chapter in the verified S520_SECTIONS map
 * (S520:2024 has §1–§13; there is no §14 — see
 * docs/findings/s520-citation-reconciliation.md).
 *
 * SCOPE (deliberate): this enforces the fully-verifiable invariant — "no citation
 * points at a chapter that does not exist." It does NOT assert subsection accuracy
 * (e.g. that §12.3 is the correct subsection, or that assessment is cited as §7 not
 * §6): those require the owner's LICENSED per-chapter S520:2024 text to confirm and
 * are tracked as an owner-gated follow-up in the reconciliation finding. Moving from
 * a hard-coded stub to a real scan is strictly more coverage, and it fails loudly on
 * any impossible chapter.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { S520_SECTIONS } from "../s520-sections";

// This test lives at lib/standards/__tests__/ — repo root is three levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCAN_DIRS = ["lib", "app"];
const SKIP_DIRS = new Set(["__tests__", "node_modules", ".next", ".git", "dist"]);
const CITATION = /S520:2024\s*§\s*(\d+)(?:\.\d+)*/g;

function walk(dir: string): string[] {
  let files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

describe("S520:2024 citation guard (real source scan)", () => {
  it("every S520:2024 §… citation in shipped source resolves to a real chapter (§1–§13)", () => {
    const files = SCAN_DIRS.flatMap((d) => walk(join(REPO_ROOT, d)));
    const problems: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(CITATION)) {
        const chapter = match[1];
        if (!Object.prototype.hasOwnProperty.call(S520_SECTIONS, chapter)) {
          const rel = file.replace(`${REPO_ROOT}/`, "");
          problems.push(`${rel}: "${match[0]}" → §${chapter} is not a real S520:2024 chapter`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
