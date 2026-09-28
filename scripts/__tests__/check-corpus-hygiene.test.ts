/**
 * RA-7474 — the corpus-hygiene CLI is a real gate.
 *
 * The detector lives in `scripts/ci/lib/corpus-hygiene.mjs`. The CLI entry
 * always calls `main()` and sets `process.exitCode`. There is no
 * `import.meta.url` guard: a symlink (and a lowercase drive letter) used to
 * skip the scan and exit 0.
 *
 * Each `scanText` fixture matches only one `RATE_PATTERNS` entry (`$440/hr`
 * also matches the bare `85/hr` pattern). Deleting one pattern turns its
 * own case red.
 *
 * The CLI is spawned against temp dirs. A clean file exits 0 and reports
 * how many files were scanned. A rate under `--strict` exits exactly 1.
 * An empty dir, a dir with no .txt/.md, a missing dir, and a missing `--dir`
 * all exit 2. The same empty-dir and `--strict` cases are spawned through
 * a symlink to the CLI.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs helper, no type declarations.
import { scanText } from "../ci/lib/corpus-hygiene.mjs";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts/ci/check-corpus-hygiene.mjs");

const TEST_FILE = join(ROOT, "scripts/__tests__/check-corpus-hygiene.test.ts");

function runCli(args: string[], script = SCRIPT) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "corpus-hygiene-"));
}

function isEperm(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "EPERM";
}

describe("detector import", () => {
  it("imports the detector from the library, not the CLI entry", () => {
    const src = readFileSync(TEST_FILE, "utf8");
    expect(src).toContain('from "../ci/lib/corpus-hygiene.mjs"');
    expect(src).not.toMatch(/from ["'][^"']*check-corpus-hygiene\.mjs["']/);
  });
});

describe("scanText corpus hygiene detector (RA-7474)", () => {
  // One digit so the bare `\d{2,4}/hr` pattern does not also match.
  it("flags $N/hour", () => {
    const hits = scanText("After-hours call-out is $5/hour.");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain("$5/hour");
  });

  it("flags $N per hour", () => {
    const hits = scanText("Travel is $5 per hour.");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain("$5 per hour");
  });

  it("flags a bare N/hr rate", () => {
    const hits = scanText("Apprentice 85/hr on tools.");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain("85/hr");
  });

  it("flags a labelled hourly rate", () => {
    const hits = scanText("Hourly Rate - $800 for a senior tech.");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain("$800");
  });

  it.each([
    "Category 2 water requires extraction and drying per IICRC S500.",
    "Job total was $1,005 ex-GST, which is not a charge-out rate.",
    "Discuss the hourly rate with the client before quoting.",
  ])("does not flag a clean string: %s", (text) => {
    expect(scanText(text)).toEqual([]);
  });

  it("does not leave a check:corpus alias that can exit 0 while scanning nothing", () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["check:corpus"]).toBeUndefined();
  });
});

describe("check-corpus-hygiene CLI", () => {
  it("exits 0 and reports how many files were scanned for a clean directory", () => {
    const dir = tempDir();
    try {
      writeFileSync(
        join(dir, "clean.md"),
        "Category 2 water requires extraction and drying per IICRC S500.\n",
      );
      const result = runCli(["--dir", dir]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("1 staged doc");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 1 for a rate-bearing file under --strict", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "rates.md"), "Technician charge-out is $440/hr on site.\n");
      const result = runCli(["--dir", dir, "--strict"]);
      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain("$440/hr");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 2 for an empty directory", () => {
    const dir = tempDir();
    try {
      const result = runCli(["--dir", dir]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("no .txt/.md files");
      expect(result.stderr).toContain(dir);
      expect(result.stdout).not.toContain("OK");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 2 when --dir is missing", () => {
    const result = runCli([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/usage/i);
  });

  it("exits 2 when the directory has no .txt or .md files", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "notes.json"), "{}\n");
      const result = runCli(["--dir", dir]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("no .txt/.md files");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 2 when the directory does not exist", () => {
    const missing = join(tmpdir(), `corpus-hygiene-missing-${process.pid}`);
    const result = runCli(["--dir", missing]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/cannot read dir/i);
  });

  it("exits 0 and prints the hit when a rate is found without --strict", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "rates.md"), "Technician charge-out is $440/hr on site.\n");
      const result = runCli(["--dir", dir]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("$440/hr");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 2 through a symlink against an empty directory", (ctx) => {
    const scratch = tempDir();
    const empty = tempDir();
    const link = join(scratch, "check-corpus-hygiene.mjs");
    try {
      try {
        symlinkSync(SCRIPT, link);
      } catch (err) {
        if (isEperm(err)) {
          ctx.skip("symlink creation threw EPERM");
          return;
        }
        throw err;
      }
      const result = runCli(["--dir", empty], link);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("no .txt/.md files");
    } finally {
      rmSync(scratch, { recursive: true, force: true });
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("exits 1 through a symlink for a rate-bearing file under --strict", (ctx) => {
    const scratch = tempDir();
    const dir = tempDir();
    const link = join(scratch, "check-corpus-hygiene.mjs");
    try {
      try {
        symlinkSync(SCRIPT, link);
      } catch (err) {
        if (isEperm(err)) {
          ctx.skip("symlink creation threw EPERM");
          return;
        }
        throw err;
      }
      writeFileSync(join(dir, "rates.md"), "Technician charge-out is $440/hr on site.\n");
      const result = runCli(["--dir", dir, "--strict"], link);
      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain("$440/hr");
    } finally {
      rmSync(scratch, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
