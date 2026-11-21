/**
 * A CLI entry must end the process with main()'s status as soon as main()
 * returns (RA-7785, #2595 review).
 *
 * The thin entries used to set `process.exitCode` and wait for Node to drain.
 * An idle pg pool (about 10 seconds), or a query or request left pending after
 * a sibling failed, then held the CLI open after it had finished. The entries
 * now flush stdio and call process.exit(code).
 *
 * The test is generic. Every entry under scripts/ that imports `main` from a
 * ./lib/ module is copied next to a stand-in lib whose main() leaves an
 * interval running and returns 3. The copy must exit 3 well inside the
 * timeout, and its last line of output must arrive.
 *
 * It also pins the Prisma cleanup fix: a backfill run with no DATABASE_URL
 * must return its own status, without initialising the client a second time.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isLibEntry } from "../lib/invoked-gates.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// The tsx loader in this process, not the tsx CLI: the CLI forks a child that a
// timeout kill would orphan, and the orphan holds the pipes open.
const TSX_LOADER = pathToFileURL(path.join(ROOT, "node_modules", "tsx", "dist", "loader.mjs")).href;
const tsArgs = (file) => ["--import", TSX_LOADER, file];
const LIB_SPEC = /from\s*["'](\.\/lib\/[^"']+)["']/;

function entries() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "lib" || e.name === "__tests__") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(mjs|ts)$/.test(e.name) && isLibEntry(readFileSync(full, "utf8"))) out.push(full);
    }
  };
  walk(path.join(ROOT, "scripts"));
  return out.sort();
}

function run(cmd, args, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, out });
    });
  });
}

async function pool(items, size, fn) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const ENTRIES = entries();

test("discovers the thin CLI entries", () => {
  // A broken walk that finds nothing must not read as a pass.
  assert.ok(ENTRIES.length >= 40, `only ${ENTRIES.length} entries found`);
});

test("every thin entry exits with main()'s status while a handle is still open", async () => {
  const failures = await pool(ENTRIES, 6, async (entry) => {
    const rel = path.relative(ROOT, entry);
    const text = readFileSync(entry, "utf8");
    const spec = text.match(LIB_SPEC)[1];
    const dir = mkdtempSync(path.join(tmpdir(), "ra7785-exit-"));
    try {
      const copy = path.join(dir, path.basename(entry));
      // The repository is "type": "module"; the copy needs the same to load as ESM.
      writeFileSync(path.join(dir, "package.json"), '{ "type": "module" }\n');
      writeFileSync(copy, text);
      const ts = entry.endsWith(".ts");
      const libFile = path.join(dir, spec.replace(/^\.\//, "") + (path.extname(spec) ? "" : ".ts"));
      mkdirSync(path.dirname(libFile), { recursive: true });
      // A stand-in for a lib that leaves a pool or request open after it is done.
      writeFileSync(
        libFile,
        // Sync entries call main() without await, so their stand-in is sync too.
        `export ${/=\s*await\s+main\(/.test(text) ? "async " : ""}function main() {\n` +
          "  setInterval(() => {}, 1000);\n" +
          '  process.stdout.write("x".repeat(65536) + "\\nLAST-LINE\\n");\n' +
          "  return 3;\n}\n",
      );
      const args = ts ? tsArgs(copy) : [copy];
      const r = await run(process.execPath, args, {
        cwd: dir,
        env: { PATH: process.env.PATH, HOME: process.env.HOME ?? dir },
        timeoutMs: 20_000,
      });
      if (r.signal) return `${rel}: still running after 20s (killed by ${r.signal})`;
      if (r.status !== 3) return `${rel}: exit ${r.status}, expected 3\n${r.out.slice(-400)}`;
      if (!r.out.includes("LAST-LINE")) return `${rel}: output was cut off before the last line`;
      return null;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  assert.deepEqual(failures.filter(Boolean), []);
});

const PRISMA_ENV = { PATH: process.env.PATH, HOME: process.env.HOME ?? tmpdir() };

test("a backfill that never touched Prisma does not initialise it on the way out", async () => {
  const r = await run(process.execPath, tsArgs(path.join(ROOT, "scripts/backfill-evidence-authoritative-rows.ts")), {
    cwd: ROOT,
    env: PRISMA_ENV,
    timeoutMs: 60_000,
  });
  assert.equal(r.signal, null, r.out);
  assert.equal(r.status, 1, r.out);
  assert.doesNotMatch(r.out, /DATABASE_URL is required to initialize PrismaClient/, r.out);
});

test("a backfill whose Prisma initialisation failed returns 1, not a second throw", async () => {
  const r = await run(process.execPath, tsArgs(path.join(ROOT, "scripts/backfill-moisture-reading-sketch-room.ts")), {
    cwd: ROOT,
    env: PRISMA_ENV,
    timeoutMs: 60_000,
  });
  assert.equal(r.signal, null, r.out);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /\[ra-7610-backfill\] failed:/);
  // One logged failure, not the logged one plus an uncaught re-initialisation.
  assert.equal((r.out.match(/DATABASE_URL is required to initialize PrismaClient/g) ?? []).length, 1, r.out);
});
