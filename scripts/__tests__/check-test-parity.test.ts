import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, matchesGlob } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { listParityScanFiles } from "../ci/check-test-parity.mjs";

const ROOT = process.cwd();
const GUARD = join(ROOT, "scripts/ci/check-test-parity.mjs");

/**
 * Independent of the guard's walker: Node's glob over the vitest config's
 * include patterns, then drop paths Node's matcher says `test.exclude` hits.
 * Tinyglobby (what Vitest 4 uses) agrees with this on the repo's patterns.
 */
async function filesVitestWouldRun(
  include: string[],
  exclude: string[],
  cwd: string,
): Promise<string[]> {
  const files = new Set<string>();
  for (const pattern of include) {
    for await (const file of glob(pattern, { cwd })) files.add(file);
  }
  for (const file of files) {
    if (exclude.some((pattern) => matchesGlob(file, pattern))) files.delete(file);
  }
  return [...files].sort();
}

function runGuard(cwd: string): { status: number; stderr: string; stdout: string } {
  try {
    const stdout = execFileSync("node", [GUARD, "--strict"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stderr: "", stdout };
  } catch (err) {
    const failure = err as { status?: number; stderr?: string; stdout?: string };
    return {
      status: failure.status ?? 1,
      stderr: failure.stderr ?? "",
      stdout: failure.stdout ?? "",
    };
  }
}

describe("test-parity scan follows vitest include", () => {
  it("scans exactly the files vitest include selects", async () => {
    const config = (
      await import(pathToFileURL(join(ROOT, "config/vitest.config.js")).href)
    ).default as { test: { include: string[]; exclude: string[] } };
    const expected = await filesVitestWouldRun(
      config.test.include,
      config.test.exclude,
      ROOT,
    );
    const scanned = await listParityScanFiles(ROOT);
    const expectedSet = new Set(expected);
    const scannedSet = new Set(scanned);

    expect({
      onlyScanned: scanned.filter((file) => !expectedSet.has(file)),
      onlyVitest: expected.filter((file) => !scannedSet.has(file)),
    }).toEqual({ onlyScanned: [], onlyVitest: [] });

    for (const file of [
      "scripts/__tests__/backfill-setup-wizard.test.ts",
      "scripts/__tests__/grandfather-ai-copilot-addon.test.ts",
      "scripts/__tests__/grandfather-client-comms-addon.test.ts",
      "scripts/__tests__/grandfather-existing-orgs.test.ts",
      "scripts/__tests__/grandfather-payments-addon.test.ts",
      "tests/unit/estimate-engine.property.test.ts",
    ]) {
      expect(scanned, file).toContain(file);
    }
    expect(scanned).not.toContain(
      "lib/rag/__tests__/prisma-iicrc-chunk.test.ts",
    );
  });

  it("uses the loaded config's include and exclude, not a hard-coded root list", async () => {
    const dir = mkdtempSync(join(tmpdir(), "parity-scan-"));
    try {
      mkdirSync(join(dir, "config"), { recursive: true });
      mkdirSync(join(dir, "scripts/__tests__"), { recursive: true });
      mkdirSync(join(dir, "lib/__tests__"), { recursive: true });
      mkdirSync(join(dir, "app"), { recursive: true });
      writeFileSync(join(dir, "scripts/__tests__/kept.test.ts"), "export {}\n");
      writeFileSync(
        join(dir, "scripts/__tests__/absent.test.ts"),
        "export {}\n",
      );
      writeFileSync(join(dir, "lib/__tests__/dropped.test.ts"), "export {}\n");
      writeFileSync(join(dir, "app/outside.test.ts"), "export {}\n");
      writeFileSync(
        join(dir, "config/vitest.config.js"),
        [
          "export default {",
          "  test: {",
          "    include: ['scripts/**/__tests__/**/*.test.ts'],",
          "    exclude: ['scripts/__tests__/absent.test.ts'],",
          "  },",
          "};",
          "",
        ].join("\n"),
      );

      await expect(listParityScanFiles(dir)).resolves.toEqual([
        "scripts/__tests__/kept.test.ts",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails if a hand-coded scan root list is reintroduced", () => {
    const src = readFileSync(GUARD, "utf8");
    expect(src).toContain('config/vitest.config.js');
    expect(src).toContain("test.include");
    expect(src).toContain("test.exclude");
    expect(src).not.toMatch(/SCAN_DIRS\s*=/);
    expect(src).not.toContain(
      '["app", "src", "components", "lib", "server"]',
    );
  });

  it("exits non-zero when the vitest config cannot be loaded", () => {
    const missing = mkdtempSync(join(tmpdir(), "parity-missing-"));
    try {
      const result = runGuard(missing);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "Refusing to fall back to a hand-kept scan list.",
      );
      expect(result.stderr).toContain("vitest config not found");
    } finally {
      rmSync(missing, { recursive: true, force: true });
    }

    const broken = mkdtempSync(join(tmpdir(), "parity-broken-"));
    try {
      mkdirSync(join(broken, "config"), { recursive: true });
      writeFileSync(
        join(broken, "config/vitest.config.js"),
        "export default {{{",
      );
      const result = runGuard(broken);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("failed to load");
      expect(result.stderr).toContain(
        "Refusing to fall back to a hand-kept scan list.",
      );
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }

    const empty = mkdtempSync(join(tmpdir(), "parity-empty-include-"));
    try {
      mkdirSync(join(empty, "config"), { recursive: true });
      writeFileSync(
        join(empty, "config/vitest.config.js"),
        "export default { test: { include: [], exclude: [] } };\n",
      );
      const result = runGuard(empty);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("test.include");
      expect(result.stderr).toContain(
        "Refusing to fall back to a hand-kept scan list.",
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
