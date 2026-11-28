import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LEDGER_DIR,
  LEDGER_FILE,
  claimCount,
  entryFileName,
  entryLine,
  ledgerKey,
  readLedger,
  reportFields,
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

interface ReportVector {
  case: string;
  timestamp: number;
  report: string;
  line: VerifierReport;
}

/**
 * What a report becomes in the ledger, written by hand from THE REPORT RULE and
 * computed by neither writer. `values` put into every one of `shapes` gives the
 * generated cases: each kind of JSON value as the whole report, as the status
 * and as each count. The shell writer is held to the same file in
 * .claude/hooks/tests/test-ledger-append.sh.
 */
const reportVectors: {
  sessionId: string;
  domain: string;
  vectors: ReportVector[];
  values: string[];
  shapes: string[];
} = JSON.parse(readFileSync(join(import.meta.dirname, "ledger-report-vectors.json"), "utf8"));

/** Every value in every shape, as raw report text, in the order the shell suite builds them. */
const generatedReports: string[] = reportVectors.values.flatMap((v) =>
  reportVectors.shapes.map((shape) => shape.split("@").join(v)),
);

/** The row a writer makes from one report's text, the way collect-verifier-metrics.ts does. */
function rowFromReport(report: string, timestamp: number): VerifierReport {
  return {
    sessionId: reportVectors.sessionId,
    timestamp,
    domain: reportVectors.domain,
    ...reportFields(JSON.parse(report)),
  };
}

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

  it("takes a count to be a whole number from 0 to the largest safe integer, or nothing", () => {
    for (const good of [0, 1, 4, Number.MAX_SAFE_INTEGER]) {
      expect(claimCount(good)).toBe(good);
    }
    for (const bad of [-1, 2.5, 2 ** 53, Infinity, NaN, "4", null, undefined, true, [1], { n: 1 }]) {
      expect(claimCount(bad), String(bad)).toBeUndefined();
    }
  });

  it("leaves out a count that breaks the rule, and never writes null", () => {
    // RA-8661 review, third round: JSON.stringify turns Infinity and NaN into
    // null, and the reader then met a count it would not accept.
    const without = entryLine(row({ status: "failed", claimsFailed: 1 }));
    for (const bad of [Infinity, -Infinity, NaN, -1, 2.5, 2 ** 53]) {
      const line = entryLine(row({ status: "failed", claimsTotal: bad, claimsFailed: 1 }));
      expect(line, String(bad)).toBe(without);
      expect(line).not.toContain("null");
    }
  });
});

describe("the report rule", () => {
  it("makes the line each shared report vector lists", () => {
    expect(reportVectors.vectors.length).toBeGreaterThanOrEqual(10);
    for (const v of reportVectors.vectors) {
      // Byte for byte: the same keys, in the same order, with the same numbers.
      expect(entryLine(rowFromReport(v.report, v.timestamp)), v.case).toBe(JSON.stringify(v.line));
    }
  });

  it("reads back every shared report vector as the record it lists", () => {
    for (const v of reportVectors.vectors) {
      writeLedgerEntry(rowFromReport(v.report, v.timestamp), dir);
    }
    const back = readLedger(file, dir).sort((a, b) => a.timestamp - b.timestamp);
    expect(back).toStrictEqual(reportVectors.vectors.map((v) => v.line));
  });

  it("gives a report that is not an object a record all the same", () => {
    // A report can be valid JSON and not an object. The verification still
    // happened, so it is recorded as unknown, never dropped and never a crash.
    for (const report of ["null", "true", "false", "42", '"failed"', "[]", '[{"status":"failed"}]']) {
      expect(reportFields(JSON.parse(report)), report).toStrictEqual({ status: "unknown" });
    }
    expect(reportFields({ status: "failed", claims_failed: 1 })).toStrictEqual({ status: "failed", claimsFailed: 1 });
  });

  it("loses no generated report between writing and reading", () => {
    // Every kind of JSON value as the whole report, as the status and as each
    // count. Whatever a report holds, the verification happened, so its record
    // must come back: one per report, none dropped by the reader.
    expect(generatedReports.length).toBeGreaterThanOrEqual(60);
    generatedReports.forEach((report, i) => {
      writeLedgerEntry(rowFromReport(report, 1788060001 + i), dir);
    });

    const back = readLedger(file, dir);
    expect(readdirSync(dir)).toHaveLength(generatedReports.length);
    expect(back).toHaveLength(generatedReports.length);
    for (const r of back) {
      expect(typeof r.status).toBe("string");
      for (const k of ["claimsTotal", "claimsFailed", "claimsWarned"] as const) {
        if (k in r) expect(claimCount(r[k]), `${k} of ${JSON.stringify(r)}`).toBe(r[k]);
      }
    }
  });

  it("keeps a failed verification whose report carries a count too large to be a number", () => {
    // The reproduced defect (RA-8661 review, third round). 1e400 is valid JSON
    // and parses to Infinity. The collector passed it on as a count, the writer
    // serialised it as null, and the reader then dropped the whole record.
    const body = JSON.parse('{"status":"failed","claims_total":1e400,"claims_failed":1}');
    expect(body.claims_total).toBe(Infinity);
    // The row exactly as the collector built it before the report rule.
    const asCollected = row({
      sessionId: "overflow",
      timestamp: 1788050000,
      domain: "static",
      status: "failed",
      claimsTotal: body.claims_total,
      claimsFailed: body.claims_failed,
    });

    const written = readFileSync(writeLedgerEntry(asCollected, dir), "utf8");
    expect(written).not.toContain("null");
    expect(readLedger(file, dir)).toStrictEqual([
      { sessionId: "overflow", timestamp: 1788050000, domain: "static", status: "failed", claimsFailed: 1 },
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
    ];
    mkdirSync(dir);
    bad.forEach((line, i) => writeFileSync(join(dir, `${i}-bad-000000000000.jsonl`), line + "\n"));
    writeFileSync(file, bad.join("\n") + "\n");
    writeLedgerEntry(row({ sessionId: "real" }), dir);

    expect(readLedger(file, dir).map((r) => r.sessionId)).toEqual(["real"]);
  });

  it("keeps a record whose count is not a count, without that count", () => {
    // RA-8661 review, third round: a count the reader would not accept made it
    // drop the whole record, and the verification's status went with it. A
    // count is optional, so a bad one is removed and the record stays. These
    // are lines as they could already sit on disk, whoever wrote them.
    const lines = [
      '{"sessionId":"s-null","timestamp":1,"domain":"d","status":"failed","claimsTotal":null,"claimsFailed":1}',
      '{"sessionId":"s-text","timestamp":2,"domain":"d","status":"partial","claimsTotal":"bad","claimsFailed":"1","claimsWarned":2}',
      '{"sessionId":"s-overflow","timestamp":3,"domain":"d","status":"failed","claimsTotal":1e400}',
      '{"sessionId":"s-fraction","timestamp":4,"domain":"d","status":"partial","claimsFailed":2.5,"claimsWarned":-1}',
    ];
    mkdirSync(dir);
    writeFileSync(file, lines.slice(0, 2).join("\n") + "\n");
    lines.slice(2).forEach((line, i) => writeFileSync(join(dir, `${i}-kept-000000000000.jsonl`), line + "\n"));

    expect(readLedger(file, dir)).toStrictEqual([
      { sessionId: "s-null", timestamp: 1, domain: "d", status: "failed", claimsFailed: 1 },
      { sessionId: "s-text", timestamp: 2, domain: "d", status: "partial", claimsWarned: 2 },
      { sessionId: "s-overflow", timestamp: 3, domain: "d", status: "failed" },
      { sessionId: "s-fraction", timestamp: 4, domain: "d", status: "partial" },
    ]);
  });

  it("reads missing paths as empty", () => {
    expect(readLedger(join(root, "absent.jsonl"), join(root, "absent.d"))).toEqual([]);
  });

  it("reads the repository's own ledger without throwing", () => {
    expect(Array.isArray(readLedger())).toBe(true);
  });
});
