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
 * THE NAMING RULE. One event is one (session, timestamp, domain). Its file is
 *
 *   <timestamp>-<readable domain>-<key hash>.jsonl
 *
 *   readable domain  the domain with every byte outside [A-Za-z0-9._-] turned
 *                    into "_", cut to its first 64 bytes, "_" when empty. It is
 *                    there for a person listing the directory and nothing else.
 *   key hash         the first 32 hex characters of
 *                    sha256( sha256hex(session) ":" timestamp ":" sha256hex(domain) )
 *                    taken over the UTF-8 bytes of the untouched session and
 *                    domain.
 *
 * The hash is what tells entries apart. The readable part alone cannot: "a/b"
 * and "a?b" both read "a_b", and while the name was built from that text the
 * second write replaced the first and a verification record was lost. Hashing
 * the two free-text parts before joining them means no choice of session or
 * domain can make two different events share a string, and so a name.
 *
 * The same event recorded by both producers (the Stop hook's
 * .claude/hooks/lib/ledger-append.sh and collect-verifier-metrics.ts) lands on
 * the same name and overwrites rather than duplicates. The shell writer follows
 * this rule byte for byte. Both are held to
 * scripts/observability/__tests__/ledger-name-vectors.json, a list of names
 * computed by neither of them, and
 * .claude/hooks/tests/test-ledger-append.sh also compares the two directly.
 *
 * Entries written before the key hash was added keep their older names
 * (`<timestamp>-<domain>-<12 hex of the session>.jsonl`). Nothing reads a name:
 * readLedger() goes by the content of each file, so old and new sit side by side.
 *
 * READING de-duplicates on the idempotency key (session, timestamp, domain),
 * first occurrence wins, frozen history first.
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

type EntryKey = Pick<VerifierReport, "sessionId" | "timestamp" | "domain">;

/**
 * The idempotency key every reader de-duplicates on. A JSON array, so the
 * three parts stay three parts: joined with ":" a session "s:1" at 2 in domain
 * "d" and a session "s" at 1 in domain "2:d" were the same string, and the
 * reader dropped one of them.
 */
export function ledgerKey(r: EntryKey): string {
  return JSON.stringify([r.sessionId, r.timestamp, r.domain]);
}

const SAFE_BYTE = /^[A-Za-z0-9._-]$/;
/** How much of the sanitised domain the name carries for a person to read. */
const READABLE_DOMAIN_BYTES = 64;
/** 128 bits of the key hash: enough that two events never meet by accident. */
const KEY_HASH_HEX = 32;

/**
 * Anything outside [A-Za-z0-9._-] becomes "_", byte by byte over UTF-8, which
 * is what `LC_ALL=C tr -c 'A-Za-z0-9._-' '_'` does in the shell writer. The
 * result can therefore never carry a path separator or a line break. It is not
 * reversible and must never be used to tell two entries apart.
 */
export function safeSegment(s: string): string {
  const out = Array.from(Buffer.from(s, "utf8"), (b) => {
    const c = String.fromCharCode(b);
    return b < 0x80 && SAFE_BYTE.test(c) ? c : "_";
  }).join("");
  return out.length > 0 ? out : "_";
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** The part of the name that identifies the event. See THE NAMING RULE above. */
export function keyHash(r: EntryKey): string {
  return sha256Hex(`${sha256Hex(r.sessionId)}:${r.timestamp}:${sha256Hex(r.domain)}`).slice(0, KEY_HASH_HEX);
}

export function entryFileName(r: EntryKey): string {
  // A timestamp is a plain integer and passes through untouched. Sanitising it
  // anyway means a malformed row can never turn the name into a path.
  const timestamp = safeSegment(String(r.timestamp));
  const readable = safeSegment(r.domain).slice(0, READABLE_DOMAIN_BYTES);
  return `${timestamp}-${readable}-${keyHash(r)}.jsonl`;
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

/**
 * Whether a parsed line is a ledger record. A line can be valid JSON and still
 * not be one (`null`, a number, an object missing a key field). Only the fields
 * the idempotency key and the metrics rest on are checked. The claim counts are
 * optional, but when present they must be numbers: a string count would fail
 * the metrics' `> 0` test and, read first for its key, drop the valid row.
 */
const COUNT_FIELDS = ["claimsTotal", "claimsFailed", "claimsWarned"] as const;

function isLedgerRow(value: unknown): value is VerifierReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sessionId === "string" &&
    Number.isSafeInteger(v.timestamp) &&
    typeof v.domain === "string" &&
    typeof v.status === "string" &&
    COUNT_FIELDS.every((k) => v[k] === undefined || Number.isFinite(v[k]))
  );
}

/**
 * The records in a file's text. A line that is not a ledger record, whether it
 * will not parse or parses to some other shape, is skipped, so one bad entry
 * cannot stop the reader.
 */
function parseLines(text: string): VerifierReport[] {
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .flatMap((line) => {
      try {
        const parsed: unknown = JSON.parse(line);
        return isLedgerRow(parsed) ? [parsed] : [];
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
