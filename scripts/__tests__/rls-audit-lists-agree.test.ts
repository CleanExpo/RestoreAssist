/**
 * RA-7503 — the TypeScript and Python RLS audit lists must name the same tables.
 *
 * `scripts/audit-rls-coverage.ts` AUDIT_TABLES and `scripts/rls-categorise.py`
 * RLS_DISABLED are two literal copies of the 119-table Supabase advisor list.
 * This test loads the Python module with python3 and compares the RUNTIME value
 * of RLS_DISABLED, so every way Python can change the list (a second
 * assignment, `+=`, `.append`, `.extend`, slice assignment, `del`) is seen as
 * Python sees it. Reading the file as text missed each of those in turn.
 *
 * Loading is safe: the module only imports `re`/`pathlib` and binds constants
 * at top level; `main()` sits behind `if __name__ == "__main__"`, and the
 * module is run under a different name so that guard never fires. If it ever
 * did, main() prints to stdout and the loader's JSON parse fails the test.
 *
 * python3 missing, a non-zero exit, or a value that is not a list of strings
 * all FAIL the test. Nothing here skips.
 *
 * Order is deliberately ignored. Duplicates are not: a repeated name would let
 * one list hold 120 entries while the sets still agree.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUDIT_TABLES } from "../audit-rls-coverage";

const RLS_CATEGORISE_PY = resolve(__dirname, "..", "rls-categorise.py");

const LOADER = `
import json, runpy, sys
ns = runpy.run_path(sys.argv[1], run_name="rls_audit_lists_agree")
if "RLS_DISABLED" not in ns:
    sys.exit("RLS_DISABLED is not defined after running " + sys.argv[1])
value = ns["RLS_DISABLED"]
if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
    sys.exit("RLS_DISABLED is not a list of str: " + type(value).__name__)
sys.stdout.write(json.dumps(sorted(value)))
`;

/** Run `pyFile` in python3 and return its runtime RLS_DISABLED, sorted. */
function loadRlsDisabled(pyFile: string, python = "python3"): string[] {
  const stdout = execFileSync(python, ["-I", "-c", LOADER, pyFile], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  const names: unknown = JSON.parse(stdout);
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error(`RLS_DISABLED loaded as ${stdout} from ${pyFile}`);
  }
  return names as string[];
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
  let dir = "";
  let n = 0;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "rls-lists-agree-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const load = (source: string) => {
    const file = join(dir, `fixture-${n++}.py`);
    writeFileSync(file, source);
    return loadRlsDisabled(file);
  };
  const base = pySource("Account User");

  it("names a table that is only in the TypeScript list", () => {
    expect(listDiff(["Account", "User", "OnlyInTs"], load(base))).toEqual({
      tsOnly: ["OnlyInTs"],
      pyOnly: [],
    });
  });

  it("names a table that is only in the Python list", () => {
    const py = load(pySource("Account User\nOnlyInPy"));
    expect(listDiff(["Account", "User"], py)).toEqual({
      tsOnly: [],
      pyOnly: ["OnlyInPy"],
    });
  });

  it("reports a name repeated in the Python list", () => {
    expect(duplicates(load(pySource("Account User\nAccount")))).toEqual([
      "Account",
    ]);
  });

  it("reads a '''-quoted literal and ignores line wrapping and order", () => {
    const py = load(pySource("User\n  Account", "'''"));
    expect(py).toEqual(["Account", "User"]);
  });

  it("throws rather than comparing two empty lists when RLS_DISABLED is missing", () => {
    expect(() => load('OTHER = """Account""".split()\n')).toThrow(
      /RLS_DISABLED is not defined/,
    );
  });

  it("throws when RLS_DISABLED is not a list", () => {
    expect(() => load('RLS_DISABLED = {"Account"}\n')).toThrow(
      /not a list of str: set/,
    );
  });

  it("throws when RLS_DISABLED is empty", () => {
    expect(() => load("RLS_DISABLED = []\n")).toThrow(/RLS_DISABLED loaded as/);
  });

  it("throws when the interpreter is missing, never skips", () => {
    const file = join(dir, "present.py");
    writeFileSync(file, base);
    expect(() => loadRlsDisabled(file, "python3-does-not-exist")).toThrow();
  });

  it("uses the second assignment, as Python does", () => {
    expect(load(`${base}RLS_DISABLED = """OnlySecondAssign""".split()\n`)).toEqual(
      ["OnlySecondAssign"],
    );
  });

  it("uses a reassignment without triple quotes", () => {
    expect(load(`${base}RLS_DISABLED = ["Replaced"]\n`)).toEqual(["Replaced"]);
  });

  it("sees RLS_DISABLED += [...]", () => {
    expect(load(`${base}RLS_DISABLED += ["Extra"]\n`)).toEqual([
      "Account",
      "Extra",
      "User",
    ]);
  });

  it("sees RLS_DISABLED.append(...)", () => {
    expect(load(`${base}RLS_DISABLED.append("Extra")\n`)).toEqual([
      "Account",
      "Extra",
      "User",
    ]);
  });

  it("sees RLS_DISABLED.extend(...)", () => {
    expect(load(`${base}RLS_DISABLED.extend(["Extra", "More"])\n`)).toEqual([
      "Account",
      "Extra",
      "More",
      "User",
    ]);
  });

  it("sees RLS_DISABLED[:] = [...]", () => {
    expect(load(`${base}RLS_DISABLED[:] = ["OnlySlice"]\n`)).toEqual([
      "OnlySlice",
    ]);
  });

  it("sees del RLS_DISABLED[0]", () => {
    expect(load(`${base}del RLS_DISABLED[0]\n`)).toEqual(["User"]);
  });
});

describe("RA-7503 real files: AUDIT_TABLES and RLS_DISABLED agree", () => {
  const py = loadRlsDisabled(RLS_CATEGORISE_PY);

  it("neither list repeats a table", () => {
    expect(duplicates(py)).toEqual([]);
    expect(duplicates(AUDIT_TABLES)).toEqual([]);
  });

  it("both lists name the same tables", () => {
    expect(listDiff(AUDIT_TABLES, py)).toEqual({ tsOnly: [], pyOnly: [] });
    expect(py.length).toBe(AUDIT_TABLES.length);
  });
});
