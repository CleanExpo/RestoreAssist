/**
 * ledger.ts — the one place that reads and writes the verifier ledger.
 *
 * LAYOUT. The ledger is two things, read as one series:
 *
 *   scripts/observability/verifier-ledger.jsonl   frozen history, never appended
 *   scripts/observability/verifier-ledger.d/*.jsonl   one file per verification
 *
 * It used to be the single .jsonl file, appended to by every branch. Every mesh
 * branch therefore changed the same end of the same file, so whichever PR merged
 * first left every other open PR conflicting on it, and resolving that pushed a
 * new head and voided the PR's release receipt. One file per entry means two
 * branches add two different files, which git merges without asking.
 *
 * FILE NAME: `<timestamp>-<domain>-<first 12 hex of sha256(session)>.jsonl`.
 * Deterministic, so the same event recorded by both producers (the Stop hook's
 * .claude/hooks/lib/ledger-append.sh and collect-verifier-metrics.ts) lands on
 * the same name and overwrites rather than duplicates. The shell writer must
 * produce the same name and the same line, key for key;
 * .claude/hooks/tests/test-ledger-append.sh compares them directly.
 *
 * READING de-duplicates on the existing idempotency key (session, timestamp,
 * domain), first occurrence wins, frozen history first.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { VerifierReport } from "./verifier-metrics";

const OBSERVABILITY_DIR = import.meta.dirname;
/** Frozen history. Read, never written. */
export const LEDGER_FILE = join(OBSERVABILITY_DIR, "verifier-ledger.jsonl");
/** One file per verification from here on. */
export const LEDGER_DIR = join(OBSERVABILITY_DIR, "verifier-ledger.d");

/** The idempotency key every reader de-duplicates on. */
export function ledgerKey(r: Pick<VerifierReport, "sessionId" | "timestamp" | "domain">): string {
  return `${r.sessionId}:${r.timestamp}:${r.domain}`;
}

const SAFE_BYTE = /^[A-Za-z0-9._-]$/;

/**
 * Anything outside [A-Za-z0-9._-] becomes "_", byte by byte over UTF-8, which
 * is what `LC_ALL=C sed 's/[^A-Za-z0-9._-]/_/g'` does in the shell writer. A
 * domain can therefore never carry a path separator.
 */
export function safeSegment(s: string): string {
  const out = Array.from(Buffer.from(s, "utf8"), (b) => {
    const c = String.fromCharCode(b);
    return b < 0x80 && SAFE_BYTE.test(c) ? c : "_";
  }).join("");
  return out.length > 0 ? out : "_";
}

export function sessionHash(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex").slice(0, 12);
}

export function entryFileName(r: Pick<VerifierReport, "sessionId" | "timestamp" | "domain">): string {
  return `${r.timestamp}-${safeSegment(r.domain)}-${sessionHash(r.sessionId)}.jsonl`;
}

/**
 * The line, with keys in the order the shell writer emits them and absent
 * counts omitted rather than null.
 */
export function entryLine(r: VerifierReport): string {
  const row: VerifierReport = {
    sessionId: r.sessionId,
    timestamp: r.timestamp,
    domain: r.domain,
    status: r.status,
    claimsTotal: r.claimsTotal,
    claimsFailed: r.claimsFailed,
    claimsWarned: r.claimsWarned,
  };
  return JSON.stringify(row);
}

function parseLines(text: string): VerifierReport[] {
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as VerifierReport];
      } catch {
        return [];
      }
    });
}

/**
 * The whole series: the frozen file, then every entry file in name order,
 * de-duplicated on ledgerKey. Dotfiles (in-flight temporary writes) and
 * anything not ending `.jsonl` are ignored. Missing paths read as empty.
 */
export function readLedger(file: string = LEDGER_FILE, dir: string = LEDGER_DIR): VerifierReport[] {
  const rows: VerifierReport[] = [];
  if (existsSync(file)) rows.push(...parseLines(readFileSync(file, "utf8")));
  if (existsSync(dir)) {
    const names = readdirSync(dir)
      .filter((n) => n.endsWith(".jsonl") && !n.startsWith("."))
      .sort();
    for (const name of names) {
      try {
        rows.push(...parseLines(readFileSync(join(dir, name), "utf8")));
      } catch {
        // An unreadable entry is skipped, as a malformed line always was.
      }
    }
  }
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = ledgerKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Write one entry as its own file, atomically (temporary dotfile, then rename).
 * Returns the path written. Never touches the frozen file.
 */
export function writeLedgerEntry(r: VerifierReport, dir: string = LEDGER_DIR): string {
  const name = entryFileName(r);
  const target = join(dir, name);
  const tmp = join(dir, `.${name}.${process.pid}.tmp`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(tmp, entryLine(r) + "\n");
    renameSync(tmp, target);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  return target;
}
