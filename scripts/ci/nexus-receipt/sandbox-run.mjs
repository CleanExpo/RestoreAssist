// Process and file helpers for sandbox.mjs (RA-8676): finding Codex, writing
// the sandbox config, launching a command in a given mode, and the review
// itself. Importing this file has no side effects. Pure rules: sandbox-lib.mjs.
import { spawn } from 'node:child_process';
import {
  chmodSync, closeSync, lstatSync, mkdirSync, openSync, realpathSync, statSync, writeFileSync,
} from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import {
  CANARY_NAME, CANARY_VALUE, CODEX_VERSION, PROFILE, PROJECT_CONFIG_EXIT, PROJECT_CONFIG_REFUSAL,
  REVIEW_TIMEOUT_SECONDS, TIMEOUT_EXIT,
  configText, packageDirFromBin, reviewArgs, reviewEnv, reviewPrompt,
} from './sandbox-lib.mjs';

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

/** True when <checkout>/.codex exists as anything, a dangling link included. */
export function hasProjectConfig(checkout) {
  try { lstatSync(join(resolve(checkout), '.codex')); return true; } catch (e) { return e?.code !== 'ENOENT'; }
}

/** The Codex binary: NEXUS_CODEX_BIN when set (local trials), else `codex` on PATH. */
export function findCodex(env = process.env) {
  if (env.NEXUS_CODEX_BIN) return isFile(env.NEXUS_CODEX_BIN) ? env.NEXUS_CODEX_BIN : null;
  for (const dir of String(env.PATH ?? '').split(delimiter)) {
    if (dir && isFile(join(dir, 'codex'))) return join(dir, 'codex');
  }
  return null;
}

/** The installed `@openai` package folder, made readable inside the sandbox. */
export function codexPackageDir(env = process.env) {
  const bin = findCodex(env);
  if (!bin) return null;
  try { return packageDirFromBin(realpathSync(bin)); } catch { return null; }
}

/** Writes <codexHome>/config.toml (dir 0700, file 0600). Returns the text. */
export function writeConfig(codexHome, env = process.env) {
  if (!isAbsolute(codexHome)) throw new Error('codex home must be an absolute path');
  const text = configText({ codexHome, codexPackageDir: codexPackageDir(env) });
  mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  chmodSync(codexHome, 0o700);
  writeFileSync(join(codexHome, 'config.toml'), text, { mode: 0o600 });
  chmodSync(join(codexHome, 'config.toml'), 0o600);
  return text;
}

/** Runs a command; resolves { code, out, timedOut }. Never rejects. */
export function run(cmd, args, { cwd, env, timeoutMs = 60_000, stdoutFd } = {}) {
  return new Promise((done) => {
    let out = '';
    let timedOut = false;
    let child;
    const stdio = ['ignore', stdoutFd ?? 'pipe', stdoutFd ?? 'pipe'];
    try {
      child = spawn(cmd, args, { cwd, env, stdio });
    } catch (e) {
      done({ code: 127, out: String(e?.message ?? e), timedOut });
      return;
    }
    child.stdout?.on('data', (c) => (out += c));
    child.stderr?.on('data', (c) => (out += c));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
    }, timeoutMs);
    child.on('error', (e) => { out += String(e?.message ?? e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code: timedOut ? TIMEOUT_EXIT : code ?? 1, out, timedOut });
    });
  });
}

/** The launcher for one shell script in one mode. */
export function launch(mode, script, { checkout, codexHome, env = process.env }) {
  const childEnv = { ...env, CODEX_HOME: codexHome, [CANARY_NAME]: CANARY_VALUE };
  if (mode === 'off') return { cmd: '/bin/sh', args: ['-c', script], env: childEnv };
  const codex = findCodex(env);
  if (!codex) return null;
  const sandbox =
    mode === 'legacy'
      // Today's layout: the built-in read-only profile with the default
      // environment policy, which hands every variable on.
      ? ['-c', 'shell_environment_policy.inherit="all"', '-P', ':read-only']
      : mode === 'profile'
        ? ['-P', PROFILE]
        : null;
  if (!sandbox) return null;
  return {
    cmd: codex,
    args: ['sandbox', ...sandbox, '-C', checkout, '--', '/bin/sh', '-c', script],
    env: childEnv,
  };
}

export async function runScript(mode, script, opts) {
  const l = launch(mode, script, opts);
  if (!l) return { code: 127, out: 'no launcher (Codex not found or unknown mode)' };
  return run(l.cmd, l.args, { cwd: opts.checkout, env: l.env, timeoutMs: 60_000 });
}

/** npm install -g of the pinned Codex. Exit code of npm. */
export async function install() {
  const r = await run('npm', ['install', '-g', `@openai/codex@${CODEX_VERSION}`], {
    env: process.env,
    timeoutMs: 600_000,
    stdoutFd: 'inherit',
  });
  return r.code;
}

/**
 * The ONLY place the review command is built and run. stdout and stderr go to
 * the log file, never the job log. Exits with Codex's exit code (124 on timeout).
 * `overrides`, `extraEnv` and `allowProjectConfig` exist for the proof's
 * internal exec suite only; the CLI `review` command never passes them.
 * Refuses (PROJECT_CONFIG_EXIT) while <checkout>/.codex exists, link or not:
 * hooks and MCP commands named there run outside the sandbox. Deletes nothing.
 */
export async function runReview({
  checkout, baseRef, schema, out, log, overrides = [], extraEnv = {}, allowProjectConfig = false,
}) {
  if (allowProjectConfig !== true && hasProjectConfig(checkout)) {
    console.log(PROJECT_CONFIG_REFUSAL);
    return PROJECT_CONFIG_EXIT;
  }
  const codex = findCodex();
  if (!codex) return 127;
  const env = reviewEnv(process.env);
  if (!env.CODEX_HOME || !isAbsolute(env.CODEX_HOME)) return 2;
  for (const k of Object.keys(extraEnv)) if (k !== CANARY_NAME) return 2;
  const args = reviewArgs({
    schema: resolve(schema), out: resolve(out), prompt: reviewPrompt(baseRef), overrides,
  });
  const fd = openSync(resolve(log), 'w', 0o600);
  try {
    const r = await run(codex, args, {
      cwd: resolve(checkout),
      env: { ...env, ...extraEnv },
      timeoutMs: REVIEW_TIMEOUT_SECONDS * 1000,
      stdoutFd: fd,
    });
    return r.code;
  } finally {
    closeSync(fd);
  }
}
