/**
 * RA-7773 — pins the executable lines of scripts/validate-next-build-no-db.sh
 * from outside the wrapper.
 *
 * The wrapper refuses to run (exit 2) unless its executable lines equal the
 * `#| ` allowlist it carries in its own comments. One edit can change both,
 * so this test holds its own copy of the expected lines and fails when the
 * wrapper's executable lines differ from it in any way.
 *
 * "Executable line" means the same thing here as in the wrapper: split on
 * "\n" only, trim leading and trailing spaces and tabs (NOT carriage
 * returns), then drop lines that are empty or start with `#`. Everything else
 * counts, compared as a whole line and in order.
 *
 * The mutant arms copy the wrapper into a temp dir laid out like the repo,
 * put stub `npm`/`npx` first on PATH that record any call, run it with `sh`
 * under a clean env, and assert exit 2 with no stub call.
 */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const WRAPPER_REL = "scripts/validate-next-build-no-db.sh";
const WRAPPER_SOURCE = readFileSync(join(REPO_ROOT, WRAPPER_REL), "utf8");

const EXPECTED_EXECUTABLE_LINES = [
  "set -eu",
  "if [ ! -f scripts/validate-next-build-no-db.sh ]; then",
  'echo "Refusing: validation wrapper missing." >&2',
  "exit 2",
  "fi",
  `wrapper_lines=$(awk '{ sub(/^[ \\t]+/, ""); sub(/[ \\t]+$/, ""); if ($0 != "" && substr($0, 1, 1) != "#") print }' scripts/validate-next-build-no-db.sh)`,
  "allowed_lines=$(sed -n 's/^#| //p' scripts/validate-next-build-no-db.sh)",
  'if [ "$wrapper_lines" != "$allowed_lines" ]; then',
  'echo "Refusing: wrapper executable lines differ from its #| allowlist." >&2',
  "exit 2",
  "fi",
  'echo "validate:next-build-no-db: database-free validation mode"',
  'echo "validate:next-build-no-db: NOT production build readiness"',
  'if [ -n "${DATABASE_URL:-}" ] || [ -n "${DIRECT_URL:-}" ]; then',
  'echo "Refusing: database URLs are present but this validation mode must be database-free." >&2',
  "exit 2",
  "fi",
  'if [ -n "${VERCEL_ENV:-}" ] || [ -n "${DO_APP_PLATFORM:-}" ]; then',
  'echo "Refusing: deployment context detected; this command is local no-db validation only." >&2',
  "exit 2",
  "fi",
  "if [ ! -f package.json ]; then",
  'echo "Refusing: package.json not found at repository root." >&2',
  "exit 2",
  "fi",
  `if ! grep -q '"validate:next-build-no-db": "sh scripts/validate-next-build-no-db.sh"' package.json; then`,
  'echo "Refusing: package.json does not expose the expected validation command." >&2',
  "exit 2",
  "fi",
  'echo "validate:next-build-no-db: guardrails passed"',
  'echo "validate:next-build-no-db: no database, Prisma migrate, build, deploy, secret, or external path entered"',
];

function executableLines(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.replace(/^[ \t]+/, "").replace(/[ \t]+$/, ""))
    .filter((line) => line !== "" && !line.startsWith("#"));
}

const STUB = `#!/bin/sh
echo "$(basename "$0") $*" >> "$STUB_LOG"
exit 0
`;

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Run `wrapperSource` as the repo wrapper in a temp repo layout. */
function runWrapper(wrapperSource: string) {
  const root = mkdtempSync(join(tmpdir(), "ra7773-"));
  tempDirs.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "stub-bin"));
  writeFileSync(join(root, WRAPPER_REL), wrapperSource);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      { scripts: { "validate:next-build-no-db": "sh scripts/validate-next-build-no-db.sh" } },
      null,
      2,
    ),
  );
  for (const name of ["npm", "npx"]) {
    writeFileSync(join(root, "stub-bin", name), STUB);
    chmodSync(join(root, "stub-bin", name), 0o755);
  }
  const stubLog = join(root, "stub.log");
  // Clean env on purpose: CI's unit-test job sets DATABASE_URL, which the
  // wrapper would refuse on before reaching any line under test.
  const result = spawnSync("sh", [WRAPPER_REL], {
    cwd: root,
    env: { PATH: `${join(root, "stub-bin")}:/usr/bin:/bin`, HOME: root, STUB_LOG: stubLog },
    encoding: "utf8",
    timeout: 30_000,
  });
  const stubCalls = existsSync(stubLog) ? readFileSync(stubLog, "utf8") : "";
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, stubCalls };
}

/** Insert `inserted` as a whole line before the first line that starts with `marker`. */
function insertLineBefore(source: string, marker: string, inserted: string): string {
  const lines = source.split("\n");
  const index = lines.findIndex((line) => line.startsWith(marker));
  if (index < 0) throw new Error(`no line starts with: ${marker}`);
  lines.splice(index, 0, inserted);
  return lines.join("\n");
}

describe("validate-next-build-no-db.sh executable-line allowlist (RA-7773)", () => {
  it("has exactly the pinned executable lines, in order", () => {
    expect(executableLines(WRAPPER_SOURCE)).toEqual(EXPECTED_EXECUTABLE_LINES);
  });

  it("carries a #| allowlist equal to the pinned lines", () => {
    const allowlist = WRAPPER_SOURCE.split("\n")
      .filter((line) => line.startsWith("#| "))
      .map((line) => line.slice(3));
    expect(allowlist).toEqual(EXPECTED_EXECUTABLE_LINES);
  });

  it("exits 0 unmutated in the real repo root under a clean env", () => {
    const result = spawnSync("sh", [WRAPPER_REL], {
      cwd: REPO_ROOT,
      env: { PATH: "/usr/bin:/bin", HOME: REPO_ROOT },
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("guardrails passed");
  });

  it("exits 0 unmutated in the temp layout (control for the mutant arms)", () => {
    const result = runWrapper(WRAPPER_SOURCE);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stubCalls).toBe("");
  });

  const mutants: Array<[string, string]> = [
    ["`true && npm run build` appended", `${WRAPPER_SOURCE}true && npm run build\n`],
    [
      "`true && npm run build` inserted mid-file",
      insertLineBefore(WRAPPER_SOURCE, 'if [ -n "${DATABASE_URL:-}" ]', "true && npm run build"),
    ],
    ["`echo ok; npm run build` appended", `${WRAPPER_SOURCE}echo ok; npm run build\n`],
    ["`npx   next    build` appended", `${WRAPPER_SOURCE}npx   next    build\n`],
    ["`npm run \\` / `build` continuation appended", `${WRAPPER_SOURCE}npm run \\\nbuild\n`],
  ];

  it.each(mutants)("exits 2 before any build call with %s", (_name, mutated) => {
    expect(mutated).not.toBe(WRAPPER_SOURCE);
    const result = runWrapper(mutated);
    expect(result.stubCalls).toBe("");
    expect(result.status).toBe(2);
  });
});
