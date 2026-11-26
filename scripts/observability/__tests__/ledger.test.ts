import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  it("is deterministic and carries timestamp, domain and a short session hash", () => {
    const name = entryFileName(row());
    expect(name).toMatch(/^1788046563-claim-truthfulness-static-[0-9a-f]{12}\.jsonl$/);
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

  it("never lets a domain become a path", () => {
    expect(safeSegment("../../evil")).toBe(".._.._evil");
    expect(entryFileName(row({ domain: "a/b" }))).not.toContain("/");
    // Byte-wise over UTF-8, matching `LC_ALL=C sed` in the shell writer.
    expect(safeSegment("é")).toBe("__");
    expect(safeSegment("")).toBe("_");
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

  it("ignores dotfiles, other extensions and malformed lines", () => {
    mkdirSync(dir);
    writeFileSync(join(dir, ".in-flight.jsonl.123.tmp"), entryLine(row({ sessionId: "tmp" })) + "\n");
    writeFileSync(join(dir, ".hidden.jsonl"), entryLine(row({ sessionId: "hidden" })) + "\n");
    writeFileSync(join(dir, "README.md"), "not an entry\n");
    writeFileSync(join(dir, "1-broken-000000000000.jsonl"), "{not json\n");
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
