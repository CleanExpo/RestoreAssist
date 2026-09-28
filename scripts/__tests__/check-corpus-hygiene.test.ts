/**
 * RA-7474 — the corpus-hygiene CLI is a real gate.
 *
 * `isMain` must hold for a Windows argv (`C:\...`) against the file URL Node
 * emits (`file:///C:/...`), including a space encoded as `%20`.
 * `` file://${argv[1]} `` never matches, so the process used to exit 0
 * without scanning.
 *
 * Each `scanText` fixture matches only one `RATE_PATTERNS` entry (`$440/hr`
 * also matches the bare `85/hr` pattern). Deleting one pattern turns its
 * own case red.
 *
 * The CLI is spawned against temp dirs. A clean file exits 0 and reports
 * how many files were scanned. A rate under `--strict` exits non-zero. An
 * empty dir, a dir with no .txt/.md, a missing dir, and a missing `--dir`
 * all exit 2.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs helper, no type declarations.
import { isMain, scanText } from "../ci/check-corpus-hygiene.mjs";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts/ci/check-corpus-hygiene.mjs");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "corpus-hygiene-"));
}

describe("isMain", () => {
  it("matches a Windows path to the file URL Node emits", () => {
    const argv1 = "C:\\repo\\scripts\\ci\\check-corpus-hygiene.mjs";
    const metaUrl = "file:///C:/repo/scripts/ci/check-corpus-hygiene.mjs";
    expect(metaUrl === `file://${argv1}`).toBe(false);
    expect(
      isMain(metaUrl, argv1),
      "isMain must accept a Windows argv; file://${argv} never matches file:///C:/",
    ).toBe(true);
  });

  it("matches a Windows path that contains a space", () => {
    const argv1 = "C:\\Users\\Phill McGurk\\repo\\scripts\\ci\\check-corpus-hygiene.mjs";
    const metaUrl = "file:///C:/Users/Phill%20McGurk/repo/scripts/ci/check-corpus-hygiene.mjs";
    expect(metaUrl === `file://${argv1}`).toBe(false);
    expect(
      isMain(metaUrl, argv1),
      "pathToFileURL encodes the space as %20; file://${argv} leaves it raw",
    ).toBe(true);
  });

  it("matches a POSIX path to its file URL", () => {
    const argv1 = "/repo/scripts/ci/check-corpus-hygiene.mjs";
    const metaUrl = "file:///repo/scripts/ci/check-corpus-hygiene.mjs";
    expect(isMain(metaUrl, argv1)).toBe(true);
  });

  it("rejects a path that is not this module", () => {
    expect(
      isMain(
        "file:///C:/repo/scripts/ci/check-corpus-hygiene.mjs",
        "C:\\repo\\scripts\\ci\\other.mjs",
      ),
    ).toBe(false);
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

  it("exits non-zero for a rate-bearing file under --strict", () => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, "rates.md"), "Technician charge-out is $440/hr on site.\n");
      const result = runCli(["--dir", dir, "--strict"]);
      expect(result.status).not.toBe(0);
      expect(result.status).toBeGreaterThan(0);
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
});
