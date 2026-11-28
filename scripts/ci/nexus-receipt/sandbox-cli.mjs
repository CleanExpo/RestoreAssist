// Commands behind sandbox.mjs (RA-8676). Importing this file has no side
// effects; sandbox.mjs always runs main(). Every command prints labels and
// outcomes only, never file contents, a login or an environment value.
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { release, tmpdir, type } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import {
  CODEX_VERSION, PROFILE, PROJECT_CONFIG_EXIT, PROJECT_CONFIG_REFUSAL, configText, judge,
  parseExpectation, probeScripts, parseProbeOutput, validBaseRef,
} from './sandbox-lib.mjs';
import {
  codexPackageDir, findCodex, hasProjectConfig, install, run, runReview, runScript, writeConfig,
} from './sandbox-run.mjs';
import { runExecSuite, runSuite } from './sandbox-probe.mjs';

const say = (s) => process.stdout.write(`${s}\n`);
const flags = (argv) => {
  const f = {};
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) f[k.slice(2)] = true;
    else { f[k.slice(2)] = next; i += 1; }
  }
  return f;
};
const readText = (p) => { try { return readFileSync(p, 'utf8').trim(); } catch { return null; } };
const absHome = (f) => {
  const h = f['codex-home'] || process.env.CODEX_HOME;
  return h && isAbsolute(h) ? h : null;
};

function report(label, results, expectation, record) {
  const verdict = judge(results, expectation);
  say(`${label}: expectation ${expectation}`);
  for (const [n, v] of Object.entries(results)) say(`  ${n.padEnd(22)} ${v}`);
  for (const r of verdict.reasons) say(`  MISMATCH ${r}`);
  say(`${label}: ${verdict.ok ? 'OK, observed result equals the expectation' : 'FAILED'}`);
  if (record) appendFileSync(record, `${JSON.stringify({ label, expectation, results, ok: verdict.ok })}\n`);
  return verdict.ok ? 0 : 1;
}

async function startCheck(checkout, codexHome) {
  const s = probeScripts({ trackedFile: null });
  const r = await runScript('profile', s['env-canary'], { checkout, codexHome });
  return { started: parseProbeOutput(r.out) !== 'not-run', text: r.out.slice(0, 300) };
}

async function observe(f) {
  const checkout = resolve(f.checkout || '.');
  const codexHome = absHome(f);
  const sysctl = (n) => readText(`/proc/sys/kernel/${n}`) ?? 'absent';
  say(`os: ${type()} ${release()} (${process.platform}/${process.arch})`);
  say(`kernel.apparmor_restrict_unprivileged_userns: ${sysctl('apparmor_restrict_unprivileged_userns')}`);
  say(`kernel.unprivileged_userns_clone: ${sysctl('unprivileged_userns_clone')}`);
  say(`system bwrap: ${(await run('/bin/sh', ['-c', 'command -v bwrap'])).out.trim() || 'not found'}`);
  const codex = findCodex();
  say(`codex: ${codex ? (await run(codex, ['--version'])).out.trim() : 'not found'}`);
  say(`codex package dir (read root): ${codexPackageDir() ?? 'not found'}`);
  if (!codexHome || !codex) return 0;
  const a = await startCheck(checkout, codexHome);
  say(`profile sandbox starts: ${a.started ? 'yes' : `no: ${a.text}`}`);
  // Diagnostic only: the same profile without the Codex-home deny entry, so a
  // failure to start can be traced to that entry or ruled out.
  const tmp = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'nexus-observe-'));
  try {
    const text = configText({ codexHome: tmp, codexPackageDir: codexPackageDir() });
    writeFileSync(join(tmp, 'config.toml'), text.split('\n').filter((l) => !l.endsWith('= "deny"')).join('\n'));
    const b = await startCheck(checkout, tmp);
    say(`profile without the deny entry starts: ${b.started ? 'yes' : `no: ${b.text}`}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return 0;
}

async function prepareHost(f) {
  if (process.platform !== 'linux') { say('prepare-host: not Linux; nothing to do'); return 0; }
  const checkout = resolve(f.checkout || '.');
  const codexHome = absHome(f);
  if (!codexHome) { say('prepare-host: no absolute CODEX_HOME'); return 1; }
  const first = await startCheck(checkout, codexHome);
  if (first.started) { say('prepare-host: the profile sandbox starts with runner defaults; nothing changed'); return 0; }
  say(`prepare-host: the profile sandbox did not start: ${first.text}`);
  const knob = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns';
  const value = readText(knob);
  say(`prepare-host: ${knob} = ${value ?? 'absent'}`);
  if (value !== '1') { say('prepare-host: not the AppArmor restriction; nothing changed'); return 1; }
  const r = await run('sudo', ['-n', 'sysctl', '-w', 'kernel.apparmor_restrict_unprivileged_userns=0']);
  say(`prepare-host: ran sudo -n sysctl -w kernel.apparmor_restrict_unprivileged_userns=0 (exit ${r.code})`);
  const again = await startCheck(checkout, codexHome);
  say(`prepare-host: after the change the sandbox ${again.started ? 'starts' : `still does not start: ${again.text}`}`);
  return again.started ? 0 : 1;
}

async function probe(f) {
  const mode = f.mode;
  const codexHome = absHome(f);
  if (!['off', 'legacy', 'profile'].includes(mode) || !parseExpectation(f.expect) || !codexHome) {
    say('usage: probe --mode off|legacy|profile --expect clean|breach:<names> --checkout DIR --codex-home DIR');
    return 2;
  }
  const results = await runSuite({
    mode, checkout: f.checkout || '.', codexHome, baseRef: f.base, hostile: f['hostile-config'] === true,
  });
  return report(f.label || `probe (${mode})`, results, f.expect, f.record);
}

async function execProbe(f) {
  const codexHome = absHome(f);
  if (!codexHome || !f.schema) { say('usage: exec-probe --checkout DIR --codex-home DIR --schema FILE'); return 2; }
  process.env.CODEX_HOME = codexHome;
  const workDir = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'nexus-exec-'));
  try {
    const r = await runExecSuite({ checkout: f.checkout || '.', codexHome, baseRef: f.base, schema: f.schema, workDir });
    say(`codex exec exited ${r.codexExit}; hostile project config planted: ${r.hostileConfig ? 'yes' : 'no'}`);
    const code = report(f.label || 'codex exec path (scripted model)', r.results, 'clean', f.record);
    return code === 0 && r.codexExit === 0 && r.hostileConfig ? 0 : 1;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function preflight(f) {
  const codexHome = absHome(f);
  if (!codexHome || !f.checkout) { say('usage: preflight --checkout DIR --codex-home DIR [--base REF]'); return 2; }
  const want = configText({ codexHome, codexPackageDir: codexPackageDir() });
  if (readText(join(codexHome, 'config.toml')) !== want.trim()) { say('preflight: config.toml is not the owner\'s profile'); return 1; }
  if (!existsSync(join(codexHome, 'auth.json'))) { say('preflight: no login file to test against'); return 1; }
  // Same refusal as the review, so a PR-supplied .codex fails here first.
  if (hasProjectConfig(f.checkout)) { say(PROJECT_CONFIG_REFUSAL); return PROJECT_CONFIG_EXIT; }
  const results = await runSuite({ mode: 'profile', checkout: f.checkout, codexHome, baseRef: f.base });
  return report('preflight (real layout)', results, 'clean');
}

async function review(f) {
  if (!f.checkout || !validBaseRef(f.base) || !f.schema || !f.out || !f.log) {
    say('usage: review --checkout DIR --base REF --schema FILE --out FILE --log FILE');
    return 2;
  }
  const code = await runReview({ checkout: f.checkout, baseRef: f.base, schema: f.schema, out: f.out, log: f.log });
  say(`Codex exited ${code}`);
  return code;
}

function summary(f) {
  const rows = (readText(f.record) ?? '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  say('| Step | Expectation | Outcome | Breaches |');
  say('| --- | --- | --- | --- |');
  for (const r of rows) {
    const breaches = Object.keys(r.results).filter((n) => r.results[n] === 'breach').join(', ') || 'none';
    say(`| ${r.label} | ${r.expectation} | ${r.ok ? 'as expected' : 'NOT as expected'} | ${breaches} |`);
  }
  if (rows.length === 0) say('| (no probe step recorded a result) | | NOT as expected | |');
  return 0;
}

export async function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;
  const f = flags(rest);
  if (cmd === 'version') { say(CODEX_VERSION); return 0; }
  if (cmd === 'install') return install();
  if (cmd === 'write-config') {
    const home = rest[0];
    if (!home || !isAbsolute(home)) { say('usage: write-config <absolute codex home>'); return 2; }
    writeConfig(home);
    say(`wrote ${PROFILE} profile to ${join(home, 'config.toml')}`);
    return 0;
  }
  const table = { observe, 'prepare-host': prepareHost, probe, 'exec-probe': execProbe, preflight, review, summary };
  if (!table[cmd]) { say(`unknown command: ${cmd ?? '(none)'}`); return 2; }
  return table[cmd](f);
}
