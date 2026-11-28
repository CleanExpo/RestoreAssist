// Tests for the Codex sandbox owner (RA-8676). Node built-ins only: the
// verdict-tests job runs this file with no `npm install`. No Codex is needed:
// the command runner is stubbed, and every planted value is obviously fake.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BREACH_PROBES, CANARY_NAME, CONTROLS, HOOK_EVENTS, PROFILE_FLAG, PROJECT_CONFIG_EXIT,
  PROJECT_CONFIG_REFUSAL, RESULT_PREFIX, SENTINEL, classify, configText, hostileProjectFiles,
  judge, packageDirFromBin, parseExpectation, parseProbeOutput, probeScripts, reviewArgs, reviewEnv,
  reviewPrompt, validBaseRef,
} from './sandbox-lib.mjs';
import { expectedNames, markerResults, runSuite } from './sandbox-probe.mjs';
import { hasProjectConfig, runReview, writeConfig } from './sandbox-run.mjs';
import { main } from './sandbox-cli.mjs';

const HOME = '/runner/_temp/codex';
const allDenied = () =>
  Object.fromEntries([...BREACH_PROBES.filter((n) => !n.startsWith('hostile-')).map((n) => [n, 'denied']),
    ...CONTROLS.map((c) => [c, 'pass'])]);

// --- judging ---------------------------------------------------------------
test('a clean run is clean only with no breach, every control passed and nothing not-run', () => {
  assert.equal(judge(allDenied(), 'clean').ok, true);
  const notRun = { ...allDenied(), 'net-ip': 'not-run' };
  const v = judge(notRun, 'clean');
  assert.equal(v.ok, false, 'unknown is never clean');
  assert.deepEqual(v.notRun, ['net-ip']);
  assert.equal(judge({ ...allDenied(), git: 'fail' }, 'clean').ok, false, 'a dead control is not clean');
  assert.equal(judge({ ...allDenied(), git: 'not-run' }, 'clean').ok, false);
});

test('sandbox off is reported as a breach for the named reasons', () => {
  const off = { ...allDenied(), 'outside-read': 'breach', 'login-read': 'breach', 'net-ip': 'breach',
    'net-host': 'breach', 'env-canary': 'breach' };
  assert.equal(judge(off, 'clean').ok, false);
  assert.deepEqual(judge(off, 'clean').breaches.slice(0, 2), ['env-canary', 'login-read']);
  assert.equal(judge(off, 'breach:outside-read,net-ip,net-host').ok, true);
});

test("today's layout (legacy read-only) is reported as a breach of the login", () => {
  const legacy = { ...allDenied(), 'outside-read': 'breach', 'login-read': 'breach' };
  assert.equal(judge(legacy, 'clean').ok, false);
  assert.equal(judge(legacy, 'breach:outside-read,login-read').ok, true);
});

test('a red control is red for the named reason only', () => {
  // Red for some other reason (only the network leaked) must not pass a
  // control that expects the outside read.
  const wrongReason = { ...allDenied(), 'net-host': 'breach' };
  const v = judge(wrongReason, 'breach:outside-read');
  assert.equal(v.ok, false);
  assert.deepEqual(v.reasons, ['expected breach not seen: outside-read']);
  // A dead sandbox (all not-run) can never pass a red control either.
  const dead = Object.fromEntries(Object.keys(allDenied()).map((n) => [n, 'not-run']));
  assert.equal(judge(dead, 'breach:outside-read').ok, false);
  // And a red control still needs its functional controls.
  const noGit = { ...allDenied(), 'outside-read': 'breach', git: 'fail' };
  assert.equal(judge(noGit, 'breach:outside-read').ok, false);
});

test('only "clean" or "breach:<known names>" is an expectation', () => {
  for (const bad of ['', 'breach:', 'breach:nope', 'Clean', 'breach:outside-read;rm', undefined])
    assert.equal(parseExpectation(bad), null, String(bad));
  assert.equal(judge(allDenied(), 'whatever').ok, false);
});

test('probe output: the sentinel and exactly one result line, else not-run', () => {
  assert.equal(parseProbeOutput(`${SENTINEL}\n${RESULT_PREFIX}1\n`), 'yes');
  assert.equal(parseProbeOutput(`noise\n${SENTINEL}\n${RESULT_PREFIX}0`), 'no');
  assert.equal(parseProbeOutput(`${RESULT_PREFIX}0`), 'not-run', 'no sentinel: the sandbox never started');
  assert.equal(parseProbeOutput('bwrap: setting up uid map: Permission denied'), 'not-run');
  assert.equal(parseProbeOutput(`${SENTINEL}\n`), 'not-run');
  assert.equal(parseProbeOutput(`${SENTINEL}\n${RESULT_PREFIX}1\n${RESULT_PREFIX}0`), 'not-run');
  assert.equal(parseProbeOutput(undefined), 'not-run');
  assert.deepEqual(classify({ 'outside-read': 'yes', git: 'no', write: 'not-run' }),
    { 'outside-read': 'breach', git: 'fail', write: 'not-run' });
});

test('read probes report a byte count, never file contents', () => {
  const s = probeScripts({ planted: '/t/planted.txt', loginFile: `${HOME}/auth.json`, runnerPid: 42,
    symlink: '/w/.nexus-probe-link-ab', netIp: '192.0.2.1', writeTarget: '/w/.nexus-probe-write-cd',
    trackedFile: '/w/README.md', baseRef: 'main' });
  for (const n of ['outside-read', 'login-read', 'symlink-read', 'tracked-read'])
    assert.match(s[n], /head -c 1 .* \| wc -c/);
  assert.match(s['procpid-root-read'], /\/proc\/42\/root\/t\/planted\.txt/);
  assert.match(s.git, /git diff --stat 'origin\/main\.\.\.HEAD'/);
  for (const text of Object.values(s)) assert.ok(text.startsWith(`echo ${SENTINEL};`));
  assert.equal(probeScripts({}).git.includes('git log -1'), true, 'no base ref: git log');
});

// --- config text -----------------------------------------------------------
test('the profile denies the Codex home, has no :root, cuts the network and the environment', () => {
  const t = configText({ codexHome: HOME, codexPackageDir: '/opt/node/lib/node_modules/@openai' });
  assert.match(t, /^default_permissions = "nexus_review"$/m);
  assert.match(t, /^":minimal" = "read"$/m);
  assert.match(t, /^":workspace_roots" = \{ "\." = "read" \}$/m);
  assert.match(t, new RegExp(`^"${HOME}" = "deny"$`, 'm'));
  assert.match(t, /^"\/opt\/node\/lib\/node_modules\/@openai" = "read"$/m);
  assert.ok(!t.includes(':root'));
  assert.ok(!/= "write"/.test(t), 'nothing is writable');
  assert.match(t, /\[permissions\.nexus_review\.network\]\nenabled = false/);
  assert.match(t, /\[shell_environment_policy\]\ninherit = "core"\nignore_default_excludes = false/);
  for (const bad of ['relative/home', '/a/../b', '/a"b', '/a\nb'])
    assert.throws(() => configText({ codexHome: bad }), bad);
  assert.equal(packageDirFromBin('/opt/n/lib/node_modules/@openai/codex/bin/codex.js'),
    '/opt/n/lib/node_modules/@openai');
  assert.equal(packageDirFromBin('/usr/bin/codex'), null);
});

// --- the review command ------------------------------------------------------
test('the review argument list has the profile and none of the forbidden flags', () => {
  const args = reviewArgs({ schema: '/s.json', out: '/v.json', prompt: reviewPrompt('main') });
  assert.deepEqual(args.slice(0, 5), ['exec', '--ephemeral', '--skip-git-repo-check', '-c', PROFILE_FLAG]);
  for (const bad of ['--sandbox', '--ignore-user-config', '--add-dir', '--full-auto', '--yolo',
    '--dangerously-bypass-approvals-and-sandbox', '-s'])
    assert.ok(!args.includes(bad), bad);
  assert.ok(!args.join(' ').includes('read-only'));
  assert.deepEqual(args.slice(-5, -1), ['--output-schema', '/s.json', '-o', '/v.json']);
  assert.throws(() => reviewArgs({ schema: 's', out: 'o', prompt: 'p', overrides: ['sandbox_mode="danger-full-access"'] }));
  assert.throws(() => reviewArgs({ schema: 's', out: 'o', prompt: 'p', overrides: ['permissions.nexus_review.network.enabled=true'] }));
});

test('the review environment is an allow-list: a planted token is not passed on', () => {
  const env = reviewEnv({ PATH: '/usr/bin', HOME: '/home/r', CODEX_HOME: HOME, LC_ALL: 'C',
    GITHUB_TOKEN: 'FAKE-TOKEN-NOT-REAL', NEXUS_FAKE_PAT: 'FAKE', CODEX_AUTH_JSON: '{"FAKE":1}',
    ACTIONS_RUNTIME_TOKEN: 'FAKE', [CANARY_NAME]: 'FAKE-NOT-A-SECRET', NODE_OPTIONS: '--require x' });
  assert.deepEqual(Object.keys(env).sort(), ['CODEX_HOME', 'HOME', 'LC_ALL', 'PATH']);
});

test('the base ref is validated before it reaches the prompt', () => {
  for (const ok of ['main', 'release/2026-11', 'feature_x.y']) assert.ok(validBaseRef(ok), ok);
  for (const bad of ['-main', 'main;rm', 'a b', '$(x)', '', 'a..b', undefined, 'main\n'])
    assert.equal(validBaseRef(bad), false, String(bad));
  assert.throws(() => reviewPrompt('main;echo'));
  assert.match(reviewPrompt('main'), /git diff origin\/main\.\.\.HEAD/);
});

// --- the suite, with a stubbed runner ----------------------------------------
function fakeCheckout() {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-sbx-test-'));
  const home = join(dir, 'home');
  const co = join(dir, 'co');
  spawnSync('mkdir', ['-p', home, co]);
  writeFileSync(join(home, 'auth.json'), '{"FAKE":"not a real login"}');
  writeFileSync(join(co, 'README.txt'), 'fake tracked file\n');
  const git = (...a) => spawnSync('git', a, { cwd: co });
  git('init', '-q');
  git('add', 'README.txt');
  git('-c', 'user.email=f@example.invalid', '-c', 'user.name=fake', 'commit', '-qm', 'init');
  return { dir, home, co };
}

test('runSuite plants, probes and removes everything it planted', async () => {
  const { dir, home, co } = fakeCheckout();
  try {
    const seen = [];
    const runner = async (mode, script, opts, name) => {
      seen.push(name);
      const breach = mode === 'off' && ['outside-read', 'net-host'].includes(name);
      const pass = CONTROLS.includes(name);
      return { out: `${SENTINEL}\n${RESULT_PREFIX}${breach || pass ? 1 : 0}\n` };
    };
    const off = await runSuite({ mode: 'off', checkout: co, codexHome: home }, { runner, lookupIp: async () => '192.0.2.1' });
    assert.equal(judge(off, 'breach:outside-read,net-host').ok, true);
    const clean = await runSuite({ mode: 'profile', checkout: co, codexHome: home, hostile: true },
      { runner, lookupIp: async () => '192.0.2.1' });
    assert.equal(judge(clean, 'clean').ok, true);
    assert.ok(seen.includes('hostile-outside-read'));
    assert.deepEqual(readdirSync(co).sort(), ['.git', 'README.txt'], 'nothing planted is left behind');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a sandbox that never starts gives not-run, and not-run is not clean', async () => {
  const { dir, home, co } = fakeCheckout();
  try {
    const runner = async () => ({ out: 'bwrap: No permissions to create a new namespace' });
    const r = await runSuite({ mode: 'profile', checkout: co, codexHome: home }, { runner, lookupIp: async () => null });
    assert.ok(Object.values(r).every((v) => v === 'not-run'));
    assert.deepEqual(Object.keys(r).sort(), expectedNames({ hostile: false }).sort());
    assert.equal(judge(r, 'clean').ok, false);
    assert.ok(existsSync(join(home, 'auth.json')), 'the login file is never touched');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- PR-supplied .codex (hooks and MCP run outside the sandbox) -------------

async function captured(fn) {
  const lines = [];
  const write = process.stdout.write;
  process.stdout.write = (s) => { lines.push(String(s)); return true; };
  try { return { value: await fn(), out: lines.join('') }; } finally { process.stdout.write = write; }
}
const reviewIn = (co, extra = {}) => runReview({
  checkout: co, baseRef: 'main', schema: join(co, 's.json'), out: join(co, 'o.json'), log: join(co, 'l.log'), ...extra,
});

test('the review refuses while the checkout has .codex (folder, link or dangling link) and deletes nothing', async () => {
  for (const kind of ['folder', 'link', 'dangling link']) {
    const co = mkdtempSync(join(tmpdir(), 'nexus-pc-'));
    try {
      const target = join(co, '.codex');
      if (kind === 'folder') { mkdirSync(target); writeFileSync(join(target, 'hooks.json'), '{}'); }
      if (kind === 'link') { mkdirSync(join(co, 'real')); symlinkSync(join(co, 'real'), target); }
      if (kind === 'dangling link') symlinkSync(join(co, 'missing'), target);
      assert.equal(hasProjectConfig(co), true, kind);
      const r = await captured(() => reviewIn(co));
      assert.equal(r.value, PROJECT_CONFIG_EXIT, kind);
      assert.equal(r.out, `${PROJECT_CONFIG_REFUSAL}\n`, kind);
      assert.ok(readdirSync(co).includes('.codex'), `${kind}: nothing was deleted`);
      assert.equal(existsSync(join(co, 'l.log')), false, `${kind}: Codex never started`);
    } finally {
      rmSync(co, { recursive: true, force: true });
    }
  }
});

test('only the internal exec suite can pass the .codex check; the CLI review and preflight cannot', async () => {
  const co = mkdtempSync(join(tmpdir(), 'nexus-pc-'));
  const saved = process.env.NEXUS_CODEX_BIN;
  try {
    mkdirSync(join(co, '.codex'));
    process.env.NEXUS_CODEX_BIN = join(co, 'no-such-codex');
    const allowed = await captured(() => reviewIn(co, { allowProjectConfig: true }));
    assert.equal(allowed.value, 127, 'past the check, stopped only by the missing Codex');
    assert.equal(allowed.out, '');
    const cli = await captured(() => main(['review', '--checkout', co, '--base', 'main', '--schema', join(co, 's.json'),
      '--out', join(co, 'o.json'), '--log', join(co, 'l.log'), '--allow-project-config', 'true']));
    assert.equal(cli.value, PROJECT_CONFIG_EXIT, 'no CLI flag reaches allowProjectConfig');
    const home = join(co, 'home');
    writeConfig(home);
    writeFileSync(join(home, 'auth.json'), '{"FAKE":"not a real login"}');
    const pre = await captured(() => main(['preflight', '--checkout', co, '--codex-home', home]));
    assert.equal(pre.value, PROJECT_CONFIG_EXIT);
    assert.ok(pre.out.includes(PROJECT_CONFIG_REFUSAL));
    rmSync(join(co, '.codex'), { recursive: true });
    assert.equal(hasProjectConfig(co), false);
  } finally {
    if (saved === undefined) delete process.env.NEXUS_CODEX_BIN; else process.env.NEXUS_CODEX_BIN = saved;
    rmSync(co, { recursive: true, force: true });
  }
});

test('the hostile .codex registers a marker on every hook event and an MCP server', () => {
  const marks = '/runner/_temp/hook-marks';
  const { config, hooks } = hostileProjectFiles(marks);
  const doc = JSON.parse(hooks).hooks;
  assert.deepEqual(Object.keys(doc).sort(), [...HOOK_EVENTS].sort());
  for (const e of HOOK_EVENTS)
    assert.deepEqual(doc[e], [{ hooks: [{ type: 'command', command: `touch ${marks}/hook-${e}` }] }], e);
  assert.match(config, /\[mcp_servers\.nexus_probe_mcp\]\ncommand = "\/bin\/sh"/);
  assert.ok(config.includes(`touch ${marks}/mcp-ran`));
  assert.throws(() => hostileProjectFiles('relative/marks'));
});

test('hook and MCP markers: yes is a breach, none is denied, no real run is not-run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-marks-'));
  try {
    const notRun = { 'hostile-hook-ran': 'not-run', 'hostile-mcp-ran': 'not-run' };
    assert.deepEqual(markerResults(dir, false), notRun);
    assert.deepEqual(markerResults(join(dir, 'gone'), true), notRun);
    assert.deepEqual(classify(markerResults(dir, true)), { 'hostile-hook-ran': 'denied', 'hostile-mcp-ran': 'denied' });
    writeFileSync(join(dir, 'hook-Stop'), '');
    writeFileSync(join(dir, 'mcp-ran'), '');
    assert.deepEqual(classify(markerResults(dir, true)), { 'hostile-hook-ran': 'breach', 'hostile-mcp-ran': 'breach' });
    assert.ok(BREACH_PROBES.includes('hostile-hook-ran') && BREACH_PROBES.includes('hostile-mcp-ran'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
