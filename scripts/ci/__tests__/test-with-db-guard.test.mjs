// test-with-db.sh refuses before touching Docker, and never removes a live
// container (slice 2a, acceptance 6 and 7, and the 2a-9 name rules). A fake
// `docker` first on PATH records every call, so no container is started.
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const SCRIPT = "scripts/ci/test-with-db.sh";

function fakeDocker({ inspect = "", runExit = 0, ownLeftover = "", label = "" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fake-docker-"));
  const log = join(dir, "calls.log");
  writeFileSync(log, "");
  writeFileSync(
    join(dir, "docker"),
    `#!/bin/bash\necho "$*" >> "${log}"\n` +
      `case "$1" in\n  info) exit 0 ;;\n  inspect) case "$*" in *Labels*) echo "${label || "<no value>"}"; exit 0 ;; esac\n    [ -n "${inspect}" ] && echo "${inspect}" && exit 0; exit 1 ;;\n` +
      `  run) exit ${runExit} ;;\n  ps) [ -n "${ownLeftover}" ] && echo "${ownLeftover}"; exit 0 ;;\n  *) exit 0 ;;\nesac\n`,
  );
  chmodSync(join(dir, "docker"), 0o755);
  return { dir, calls: () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
}

function runScript(cwd, docker, env = {}) {
  return spawnSync("bash", [SCRIPT], {
    cwd,
    env: { HOME: process.env.HOME, PATH: `${docker.dir}:${process.env.PATH}`, ...env },
    encoding: "utf8",
  });
}

test("a remote Postgres in the environment is refused before any docker call", () => {
  const docker = fakeDocker();
  const run = runScript(ROOT, docker, {
    SHADOW_DATABASE_URL: "postgresql://leakuser:leakpass-SENTINEL@db.example.invalid/x",
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /test database guard refused: SHADOW_DATABASE_URL host is not local/);
  assert.ok(!(run.stderr + run.stdout).includes("leakpass-SENTINEL"));
  assert.deepEqual(docker.calls(), []);
});

test("a worktree whose node_modules lives elsewhere is refused before any docker call", () => {
  const repo = mkdtempSync(join(tmpdir(), "shared-nm-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "scripts", "ci"), { recursive: true });
  copyFileSync(join(ROOT, SCRIPT), join(repo, SCRIPT));
  copyFileSync(join(ROOT, "scripts/ci/assert-local-test-db.mjs"), join(repo, "scripts/ci/assert-local-test-db.mjs"));
  symlinkSync(join(ROOT, "node_modules"), join(repo, "node_modules"));
  const docker = fakeDocker();
  const run = runScript(repo, docker);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /node_modules resolves outside this worktree/);
  assert.deepEqual(docker.calls(), []);

  const allowed = runScript(repo, fakeDocker({ runExit: 1 }), { RA_CI_PG_SHARED_CLIENT_OK: "1" });
  assert.match(allowed.stderr, /shared-client override active, node_modules=/);
});

test("an unsafe container name is refused before any docker call", () => {
  const docker = fakeDocker();
  const run = runScript(ROOT, docker, { RA_CI_PG_NAME: "-rf;x" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /RA_CI_PG_NAME must match/);
  assert.deepEqual(docker.calls(), []);
});

test("a running container with this name is refused, never removed", () => {
  const docker = fakeDocker({ inspect: "true" });
  const run = runScript(ROOT, docker, { RA_CI_PG_NAME: "ra-ci-pg-test" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /container ra-ci-pg-test is already running/);
  assert.match(run.stderr, /docker rm -f ra-ci-pg-test/);
  assert.ok(!docker.calls().some((c) => c.startsWith("rm") || c.startsWith("run")), docker.calls().join("\n"));
});

test("a stopped leftover is removed; a failed start never removes by name", () => {
  // A concurrent run of this worktree can win the create: our docker run then
  // fails on the name, and removing the name would kill the winner.
  const docker = fakeDocker({ inspect: "false", runExit: 1 });
  const run = runScript(ROOT, docker, { RA_CI_PG_NAME: "ra-ci-pg-test" });
  assert.notEqual(run.status, 0);
  const calls = docker.calls().map((c) => c.split(" ")[0] + (c.includes("rm -f ra-ci-pg-test") ? ":rm-name" : ""));
  assert.deepEqual(calls, ["info", "inspect", "inspect", "rm:rm-name", "run", "ps"]);
  assert.match(docker.calls().find((c) => c.startsWith("ps")), /--filter label=ra-ci-pg\.run=/);
  assert.match(run.stderr, /docker run did not start ra-ci-pg-test/);
});

test("a stopped container still being started by a live run is refused, never removed", () => {
  const docker = fakeDocker({ inspect: "false", label: `${process.pid}.1.1` });
  const run = runScript(ROOT, docker, { RA_CI_PG_NAME: "ra-ci-pg-test" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /being started by a live run/);
  assert.ok(!docker.calls().some((c) => c.startsWith("rm") || c.startsWith("run")), docker.calls().join("\n"));
});

test("a stopped container whose run has ended is removed as a leftover", () => {
  const dead = spawnSync("bash", ["-c", "echo $$"], { encoding: "utf8" }).stdout.trim();
  const docker = fakeDocker({ inspect: "false", label: `${dead}.1.1`, runExit: 1 });
  runScript(ROOT, docker, { RA_CI_PG_NAME: "ra-ci-pg-test" });
  assert.ok(docker.calls().includes("rm -f ra-ci-pg-test"), docker.calls().join("\n"));
});

test("a start that created then failed removes only the container carrying this run's label", () => {
  const docker = fakeDocker({ runExit: 1, ownLeftover: "cid-own-123" });
  const run = runScript(ROOT, docker, { RA_CI_PG_NAME: "ra-ci-pg-test" });
  assert.notEqual(run.status, 0);
  const runCall = docker.calls().find((c) => c.startsWith("run"));
  const label = runCall.match(/--label (ra-ci-pg\.run=\S+)/)[1];
  assert.ok(docker.calls().some((c) => c === `ps -aq --filter label=${label}`), docker.calls().join("\n"));
  assert.deepEqual(docker.calls().filter((c) => c.startsWith("rm")), ["rm -f cid-own-123"]);
});

test("with no override, Docker picks the port on loopback", () => {
  const docker = fakeDocker({ runExit: 1 });
  runScript(ROOT, docker, { RA_CI_PG_NAME: "ra-ci-pg-test" });
  const runCall = docker.calls().find((c) => c.startsWith("run"));
  assert.match(runCall, /-p 127\.0\.0\.1::5432 /);
});
