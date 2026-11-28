import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LEDGER_DIR,
  LEDGER_FILE,
  entryFileName,
  entryLine,
  ledgerKey,
  readLedger,
  safeSegment,
  writeLedgerEntry,
} from "../ledger";
import type { VerifierReport } from "../verifier-metrics";

function row(over: Partial<VerifierReport> = {}): VerifierReport {
  return {
    sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    timestamp: 1788046563,
    domain: "claim-truthfulness-static",
    status: "static-clean",
    ...over,
  };
}

interface NameVector {
  case: string;
  sessionId: string;
  timestamp: number;
  domain: string;
  name: string;
}

/**
 * The entry names both writers must produce, computed by neither of them. The
 * shell writer is held to the same file in .claude/hooks/tests/test-ledger-append.sh.
 */
const vectors: NameVector[] = JSON.parse(
  readFileSync(join(import.meta.dirname, "ledger-name-vectors.json"), "utf8"),
).vectors;

let root: string;
let file: string;
let dir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ledger-test-"));
  file = join(root, "verifier-ledger.jsonl");
  dir = join(root, "verifier-ledger.d");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the ledger layout", () => {
  it("points at the frozen file and the per-entry directory beside it", () => {
    expect(LEDGER_FILE.endsWith(join("scripts", "observability", "verifier-ledger.jsonl"))).toBe(true);
    expect(LEDGER_DIR.endsWith(join("scripts", "observability", "verifier-ledger.d"))).toBe(true);
  });
});

describe("naming an entry", () => {
  it("is deterministic and carries the timestamp, the readable domain and a 32-hex key hash", () => {
    const name = entryFileName(row());
    expect(name).toMatch(/^1788046563-claim-truthfulness-static-[0-9a-f]{32}\.jsonl$/);
    expect(entryFileName(row())).toBe(name);
  });

  it("differs when any part of the idempotency key differs", () => {
    const names = new Set([
      entryFileName(row()),
      entryFileName(row({ sessionId: "another-session" })),
      entryFileName(row({ timestamp: 1788046564 })),
      entryFileName(row({ domain: "static" })),
    ]);
    expect(names.size).toBe(4);
  });

  it("gives two domains that sanitise alike two different names", () => {
    // RA-8661 review: "a/b" and "a?b" both sanitise to "a_b". While the name was
    // built from the sanitised domain alone, the second write replaced the first.
    expect(safeSegment("a/b")).toBe(safeSegment("a?b"));
    expect(entryFileName(row({ domain: "a/b" }))).not.toBe(entryFileName(row({ domain: "a?b" })));
  });

  it("matches the shared name vectors the shell writer is also held to", () => {
    expect(vectors.length).toBeGreaterThanOrEqual(10);
    for (const v of vectors) {
      expect(entryFileName(v), v.case).toBe(v.name);
    }
    expect(new Set(vectors.map((v) => v.name)).size).toBe(vectors.length);
  });

  it("never lets a domain become a path", () => {
    expect(safeSegment("../../evil")).toBe(".._.._evil");
    expect(entryFileName(row({ domain: "a/b" }))).not.toContain("/");
    expect(entryFileName(row({ domain: "line1\nline2" }))).not.toContain("\n");
    // A malformed row cannot turn the timestamp into a path either.
    expect(entryFileName(row({ timestamp: "../../x" as unknown as number }))).not.toContain("/");
    // Byte-wise over UTF-8, matching `LC_ALL=C tr -c` in the shell writer.
    expect(safeSegment("é")).toBe("__");
    expect(safeSegment("")).toBe("_");
  });

  it("keeps the name of a very long domain inside the file-name limit", () => {
    const name = entryFileName(row({ domain: "d".repeat(300) }));
    expect(Buffer.byteLength(name, "utf8")).toBeLessThanOrEqual(128);
    // The cut part is still told apart by the hash.
    expect(name).not.toBe(entryFileName(row({ domain: "d".repeat(301) })));
  });
});

describe("the line shape", () => {
  it("omits absent counts rather than writing null", () => {
    expect(JSON.parse(entryLine(row()))).toEqual(row());
    expect(Object.keys(JSON.parse(entryLine(row())))).toEqual(["sessionId", "timestamp", "domain", "status"]);
  });

  it("keeps the three claim counts on the full shape, in the shell writer's order", () => {
    const full = row({ status: "partial", claimsTotal: 4, claimsFailed: 0, claimsWarned: 4 });
    expect(Object.keys(JSON.parse(entryLine(full)))).toEqual([
      "sessionId",
      "timestamp",
      "domain",
      "status",
      "claimsTotal",
      "claimsFailed",
      "claimsWarned",
    ]);
  });
});

describe("writing", () => {
  it("gives two concurrent appends two distinct files and leaves the frozen file untouched", () => {
    const history = entryLine(row({ sessionId: "history", timestamp: 1700000000 })) + "\n";
    writeFileSync(file, history);

    const a = writeLedgerEntry(row({ sessionId: "branch-a" }), dir);
    const b = writeLedgerEntry(row({ sessionId: "branch-b" }), dir);

    expect(a).not.toBe(b);
    expect(readdirSync(dir).sort()).toHaveLength(2);
    expect(readFileSync(file, "utf8")).toBe(history);
    for (const p of [a, b]) {
      expect(readFileSync(p, "utf8").split("\n").filter(Boolean)).toHaveLength(1);
    }
  });

  it("keeps both records when two domains in one session and second sanitise alike", () => {
    // The reproduced defect: same session, same second, domains "a/b" then
    // "a?b". Both must survive, each with its own status.
    writeLedgerEntry(row({ domain: "a/b", status: "failed" }), dir);
    writeLedgerEntry(row({ domain: "a?b", status: "static-clean" }), dir);

    expect(readdirSync(dir)).toHaveLength(2);
    expect(
      readLedger(file, dir)
        .map((r) => `${r.domain} ${r.status}`)
        .sort(),
    ).toEqual(["a/b failed", "a?b static-clean"]);
  });

  it("writes an entry whose domain is longer than a file name may be", () => {
    const long = "d".repeat(300);
    const p = writeLedgerEntry(row({ domain: long }), dir);
    expect(Buffer.byteLength(basename(p), "utf8")).toBeLessThanOrEqual(128);
    expect(readLedger(file, dir).map((r) => r.domain)).toEqual([long]);
  });

  it("overwrites rather than duplicates when the same event is written twice", () => {
    writeLedgerEntry(row(), dir);
    writeLedgerEntry(row(), dir);
    expect(readdirSync(dir)).toHaveLength(1);
  });

  it("leaves no temporary file behind", () => {
    writeLedgerEntry(row(), dir);
    expect(readdirSync(dir).filter((n) => n.startsWith("."))).toEqual([]);
  });
});

describe("reading", () => {
  it("returns the frozen history plus every entry file, de-duplicated on the idempotency key", () => {
    const old1 = row({ sessionId: "old-1", timestamp: 1700000000 });
    const old2 = row({ sessionId: "old-2", timestamp: 1700000100 });
    const fresh = row({ sessionId: "new-1", timestamp: 1788000000, status: "failed" });
    writeFileSync(file, [old1, old2].map(entryLine).join("\n") + "\n");
    // old2 also absorbed into the directory, as a second producer might.
    writeLedgerEntry(old2, dir);
    writeLedgerEntry(fresh, dir);

    const rows = readLedger(file, dir);
    expect(rows.map(ledgerKey)).toEqual([old1, old2, fresh].map(ledgerKey));
    expect(rows.find((r) => r.sessionId === "new-1")?.status).toBe("failed");
  });

  it("does not run two different keys together", () => {
    // Joined with ":" these were both "s:1:2:d", so the reader dropped the second.
    const a = row({ sessionId: "s:1", timestamp: 2, domain: "d", status: "failed" });
    const b = row({ sessionId: "s", timestamp: 1, domain: "2:d" });
    expect(ledgerKey(a)).not.toBe(ledgerKey(b));

    writeFileSync(file, [a, b].map(entryLine).join("\n") + "\n");
    expect(readLedger(file, dir).map((r) => r.sessionId)).toEqual(["s:1", "s"]);
  });

  it("still returns one row for an event held under an older file name", () => {
    // Entries written before the name carried the key hash keep their old names.
    // The reader goes by content, so a re-record under the new name is one row.
    mkdirSync(dir);
    writeFileSync(join(dir, "1788046563-claim-truthfulness-static-24ed905418b8.jsonl"), entryLine(row()) + "\n");
    writeLedgerEntry(row(), dir);

    expect(readdirSync(dir)).toHaveLength(2);
    expect(readLedger(file, dir)).toHaveLength(1);
  });

  it("ignores dotfiles, other extensions and malformed lines", () => {
    mkdirSync(dir);
    writeFileSync(join(dir, ".in-flight.jsonl.123.tmp"), entryLine(row({ sessionId: "tmp" })) + "\n");
    writeFileSync(join(dir, ".hidden.jsonl"), entryLine(row({ sessionId: "hidden" })) + "\n");
    writeFileSync(join(dir, "README.md"), "not an entry\n");
    writeFileSync(join(dir, "1-broken-000000000000.jsonl"), "{not json\n");
    writeLedgerEntry(row({ sessionId: "real" }), dir);

    expect(readLedger(file, dir).map((r) => r.sessionId)).toEqual(["real"]);
  });

  it("skips a line that is valid JSON but not a ledger record", () => {
    // RA-8661 discovery sweep: a line holding `null` parsed cleanly and then
    // crashed the reader when its key was built, so one bad entry stopped every
    // metric. Such a line is skipped, as an unparsable one always was.
    const bad = [
      "null",
      "42",
      '"text"',
      "[]",
      "{}",
      JSON.stringify({ ...row(), sessionId: 7 }),
      JSON.stringify({ ...row(), timestamp: "1788046563" }),
      JSON.stringify({ ...row(), timestamp: 1.5 }),
      JSON.stringify({ ...row(), domain: null }),
      JSON.stringify({ sessionId: "s", timestamp: 1, domain: "d" }),
      JSON.stringify({ ...row(), claimsTotal: "bad" }),
      JSON.stringify({ ...row(), claimsFailed: "1" }),
      JSON.stringify({ ...row(), claimsWarned: null }),
    ];
    mkdirSync(dir);
    bad.forEach((line, i) => writeFileSync(join(dir, `${i}-bad-000000000000.jsonl`), line + "\n"));
    writeFileSync(file, bad.join("\n") + "\n");
    writeLedgerEntry(row({ sessionId: "real" }), dir);

    expect(readLedger(file, dir).map((r) => r.sessionId)).toEqual(["real"]);
  });

  it("reads missing paths as empty", () => {
    expect(readLedger(join(root, "absent.jsonl"), join(root, "absent.d"))).toEqual([]);
  });

  it("reads the repository's own ledger without throwing", () => {
    expect(Array.isArray(readLedger())).toBe(true);
  });
});
