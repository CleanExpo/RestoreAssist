// The probe suite for sandbox.mjs (RA-8676). Plants obviously fake items, runs
// every probe in one mode, removes what it planted in a `finally`, and returns
// classified results for judge() in sandbox-lib.mjs. Importing it does nothing.
//
// A probe never prints file contents: a read probe reports only whether at least
// one byte was readable. Planted items have random names and never replace an
// existing file in the checkout.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  EXEC_MARKER_PROBES, HOSTILE_CONFIG, NET_HOST, REQUIRED_PROBES, classify, hostileProjectFiles,
  parseProbeOutput, probeScripts, validBaseRef,
} from './sandbox-lib.mjs';
import { providerOverrides, startFakeModel } from './fake-model.mjs';
import { hasProjectConfig, runReview, runScript } from './sandbox-run.mjs';

const HOSTILE_SUBSET = ['outside-read', 'login-read', 'net-host', 'env-canary'];
const tag = () => randomBytes(6).toString('hex');
const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

/** The names one run must report on; a name with no result is `not-run`. */
export function expectedNames({ hostile }) {
  return [...REQUIRED_PROBES, ...(hostile ? HOSTILE_SUBSET.map((n) => `hostile-${n}`) : [])];
}

function firstTrackedFile(checkout) {
  const r = git(checkout, ['ls-files', '-z']);
  for (const f of (r.stdout ?? '').split('\0').filter(Boolean).slice(0, 200)) {
    try {
      const st = lstatSync(join(checkout, f));
      if (st.isFile() && st.size > 0) return join(checkout, f);
    } catch { /* not on disk */ }
  }
  return null;
}

function baseRefPresent(checkout, baseRef) {
  if (!baseRef || !validBaseRef(baseRef)) return false;
  return git(checkout, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${baseRef}`]).status === 0;
}

async function resolveIp() {
  try { return (await lookup(NET_HOST, { family: 4 })).address; } catch { return null; }
}

/** Plants the fake items and gathers inputs. Returns { ctx, cleanup }. */
export async function plant({ checkout, baseRef, loginFile, lookupIp = resolveIp }) {
  const undo = [];
  const root = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'nexus-probe-'));
  undo.push(() => rmSync(root, { recursive: true, force: true }));
  const planted = join(root, 'planted-outside.txt');
  writeFileSync(planted, 'FAKE planted file for the sandbox probe; not a secret\n', { mode: 0o600 });
  const symlink = join(checkout, `.nexus-probe-link-${tag()}`);
  const writeTarget = join(checkout, `.nexus-probe-write-${tag()}`);
  if (!existsSync(symlink)) {
    symlinkSync(planted, symlink);
    undo.push(() => unlinkSync(symlink));
  }
  undo.push(() => { if (existsSync(writeTarget)) unlinkSync(writeTarget); });
  const ctx = {
    planted,
    loginFile: existsSync(loginFile) ? loginFile : null,
    runnerPid: process.pid,
    symlink: existsSync(symlink) ? symlink : null,
    netIp: await lookupIp(),
    writeTarget: existsSync(writeTarget) ? null : writeTarget,
    trackedFile: firstTrackedFile(checkout),
    baseRef: baseRefPresent(checkout, baseRef) ? baseRef : null,
  };
  const cleanup = () => { for (const f of undo.reverse()) { try { f(); } catch { /* best effort */ } } };
  return { ctx, cleanup };
}

/**
 * Plants a hostile .codex only when the checkout has no .codex (lstat, so a
 * link counts). With markDir it also carries hooks.json and an MCP server whose
 * commands write markers there.
 */
export function plantHostileConfig(checkout, markDir) {
  const dir = join(checkout, '.codex');
  if (hasProjectConfig(checkout)) return null;
  mkdirSync(dir);
  const files = markDir ? hostileProjectFiles(markDir) : { config: HOSTILE_CONFIG };
  writeFileSync(join(dir, 'config.toml'), files.config);
  if (files.hooks) writeFileSync(join(dir, 'hooks.json'), files.hooks);
  return () => rmSync(dir, { recursive: true, force: true });
}

const allNotRun = () => Object.fromEntries(EXEC_MARKER_PROBES.map((n) => [n, 'not-run']));

/** hostile-hook-ran / hostile-mcp-ran from the marker folder; not-run without a real run. */
export function markerResults(markDir, ran) {
  if (!ran) return allNotRun();
  let names;
  try { names = readdirSync(markDir); } catch { return allNotRun(); }
  return {
    'hostile-hook-ran': names.some((n) => n.startsWith('hook-')) ? 'yes' : 'no',
    'hostile-mcp-ran': names.includes('mcp-ran') ? 'yes' : 'no',
  };
}

async function runAll(mode, scripts, names, opts, runner, prefix = '') {
  const raw = {};
  for (const name of names) {
    if (!scripts[name]) continue;
    const r = await runner(mode, scripts[name], opts, `${prefix}${name}`);
    raw[`${prefix}${name}`] = parseProbeOutput(r.out);
  }
  return raw;
}

/** Runs the suite through `codex sandbox` (or no sandbox for mode off). */
export async function runSuite(
  { mode, checkout, codexHome, baseRef, hostile = false },
  { runner = runScript, lookupIp = resolveIp } = {}
) {
  checkout = resolve(checkout);
  const loginFile = join(codexHome, 'auth.json');
  const { ctx, cleanup } = await plant({ checkout, baseRef, loginFile, lookupIp });
  const raw = Object.fromEntries(expectedNames({ hostile }).map((n) => [n, 'not-run']));
  const opts = { checkout, codexHome };
  try {
    const scripts = probeScripts(ctx);
    Object.assign(raw, await runAll(mode, scripts, Object.keys(scripts), opts, runner));
    if (hostile) {
      const undo = plantHostileConfig(checkout);
      if (undo) {
        try {
          Object.assign(raw, await runAll(mode, scripts, HOSTILE_SUBSET, opts, runner, 'hostile-'));
        } finally {
          undo();
        }
      }
    }
  } finally {
    cleanup();
  }
  return classify(raw);
}

/**
 * Runs the suite through the real `codex exec` launch path, driven by the
 * scripted fake model, with a hostile project config planted for the whole run.
 */
export async function runExecSuite({ checkout, codexHome, baseRef, schema, workDir }) {
  checkout = resolve(checkout);
  const loginFile = join(codexHome, 'auth.json');
  const { ctx, cleanup } = await plant({ checkout, baseRef, loginFile });
  const names = expectedNames({ hostile: false });
  const raw = Object.fromEntries([...names, ...EXEC_MARKER_PROBES].map((n) => [n, 'not-run']));
  const markDir = join(dirname(ctx.planted), 'hook-marks');
  mkdirSync(markDir);
  const undoHostile = plantHostileConfig(checkout, markDir);
  let model;
  try {
    const scripts = probeScripts(ctx);
    const probes = names.filter((n) => scripts[n]).map((n) => ({ name: n, cmd: scripts[n] }));
    model = await startFakeModel(probes);
    const code = await runReview({
      checkout, baseRef: baseRef || 'main', schema,
      out: join(workDir, 'exec-probe-verdict.json'), log: join(workDir, 'exec-probe.log'),
      overrides: providerOverrides(model.port), extraEnv: { NEXUS_PROBE_CANARY: 'FAKE-NOT-A-SECRET' },
      allowProjectConfig: true,
    });
    for (const p of probes) raw[p.name] = parseProbeOutput(model.outputFor(p.name));
    // A marker check means something only when Codex really ran a session
    // with the hostile .codex in place.
    Object.assign(raw, markerResults(markDir, Boolean(undoHostile) && code === 0 && model.turns() > 0));
    return { results: classify(raw), codexExit: code, hostileConfig: Boolean(undoHostile) };
  } finally {
    await model?.close();
    if (undoHostile) undoHostile();
    cleanup();
  }
}
