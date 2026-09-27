/**
 * RA-7503 — the TypeScript and Python RLS audit lists must name the same tables.
 *
 * `scripts/audit-rls-coverage.ts` AUDIT_TABLES and `scripts/rls-categorise.py`
 * RLS_DISABLED are two literal copies of the 119-table Supabase advisor list.
 * This test reads the Python file as TEXT (Python is never executed), extracts
 * the RLS_DISABLED names, and fails naming every table found on one side only.
 *
 * Order is deliberately ignored: the two files wrap their lines differently, so
 * a reflow must not fail. Duplicates are not ignored: a repeated name would let
 * one list hold 120 entries while the sets still agree.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIT_TABLES } from "../audit-rls-coverage";

const RLS_CATEGORISE_PY = resolve(__dirname, "..", "rls-categorise.py");

/** Extract the whitespace-separated names in `RLS_DISABLED = """..."""`. */
function parseRlsDisabled(pythonSource: string): string[] {
  const match = pythonSource.match(
    /^RLS_DISABLED\s*=\s*[rR]?("""|''')([\s\S]*?)\1/m,
  );
  if (!match) {
    throw new Error(
      `RLS_DISABLED triple-quoted literal not found in ${RLS_CATEGORISE_PY}`,
    );
  }
  const names = match[2].split(/\s+/).filter(Boolean);
  if (names.length === 0) {
    throw new Error("RLS_DISABLED literal parsed to zero table names");
  }
  return names;
}

function duplicates(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) repeated.add(name);
    seen.add(name);
  }
  return [...repeated].sort();
}

function listDiff(ts: readonly string[], py: readonly string[]) {
  const tsSet = new Set(ts);
  const pySet = new Set(py);
  return {
    tsOnly: [...tsSet].filter((t) => !pySet.has(t)).sort(),
    pyOnly: [...pySet].filter((t) => !tsSet.has(t)).sort(),
  };
}

const pySource = (body: string, quote = '"""') =>
  `SENTINEL = "x"\n\nRLS_DISABLED = ${quote}\n${body}\n${quote}.split()\n\nPUBLIC_REF = {"A"}\n`;

describe("RA-7503 comparator (fixtures)", () => {
  it("names a table that is only in the TypeScript list", () => {
    const py = parseRlsDisabled(pySource("Account User"));
    expect(listDiff(["Account", "User", "OnlyInTs"], py)).toEqual({
      tsOnly: ["OnlyInTs"],
      pyOnly: [],
    });
  });

  it("names a table that is only in the Python list", () => {
    const py = parseRlsDisabled(pySource("Account User\nOnlyInPy"));
    expect(listDiff(["Account", "User"], py)).toEqual({
      tsOnly: [],
      pyOnly: ["OnlyInPy"],
    });
  });

  it("reports a name repeated in the Python list", () => {
    const py = parseRlsDisabled(pySource("Account User\nAccount"));
    expect(duplicates(py)).toEqual(["Account"]);
  });

  it("parses a '''-quoted literal and ignores line wrapping and order", () => {
    const py = parseRlsDisabled(pySource("User\n  Account", "'''"));
    expect(py).toEqual(["User", "Account"]);
    expect(listDiff(["Account", "User"], py)).toEqual({
      tsOnly: [],
      pyOnly: [],
    });
  });

  it("throws rather than comparing two empty lists when the literal is missing", () => {
    expect(() => parseRlsDisabled('OTHER = """Account"""')).toThrow(
      /RLS_DISABLED/,
    );
  });
});

describe("RA-7503 real files: AUDIT_TABLES and RLS_DISABLED agree", () => {
  const py = parseRlsDisabled(readFileSync(RLS_CATEGORISE_PY, "utf8"));

  it("neither list repeats a table", () => {
    expect(duplicates(py)).toEqual([]);
    expect(duplicates(AUDIT_TABLES)).toEqual([]);
  });

  it("both lists name the same tables", () => {
    expect(listDiff(AUDIT_TABLES, py)).toEqual({ tsOnly: [], pyOnly: [] });
    expect(py.length).toBe(AUDIT_TABLES.length);
  });
});
