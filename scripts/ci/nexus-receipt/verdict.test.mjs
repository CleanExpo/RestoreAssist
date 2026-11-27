import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decide,
  renderComment,
  COMMENT_MARKER,
  credentialStrings,
  scrub,
  schemaError,
} from './lib.mjs';

const SCRIPT = fileURLToPath(new URL('./verdict.mjs', import.meta.url));
const verdict = (v, findings = [], summary = '') => JSON.stringify({ verdict: v, summary, findings });
const finding = (severity, title = 't', file = 'a.ts') => ({ severity, title, file });

test('schema-valid PASS with only P2/P3 findings is success', () => {
  const r = decide(verdict('PASS', [finding('P2', 'nit'), finding('P3')]));
  assert.equal(r.state, 'success');
  assert.match(r.description, /^PASS reviewer=codex ci findings=2/);
});

test('any P0 or P1 fails even when the verdict says PASS', () => {
  for (const severity of ['P0', 'P1']) {
    const r = decide(verdict('PASS', [finding(severity, 'auth bypass')]));
    assert.equal(r.state, 'failure', severity);
    assert.match(r.description, /BLOCK reviewer=codex 1 P0\/P1: auth bypass/);
  }
});

test('BLOCK with no findings still fails', () => {
  assert.equal(decide(verdict('BLOCK')).state, 'failure');
});

test('schema-invalid receipts fail closed (CodeRabbit #2728)', () => {
  const bad = [
    '',
    'not json',
    'null',
    '{}',
    JSON.stringify({ verdict: 'PASS' }),
    JSON.stringify({ verdict: 'PASS', summary: '', findings: [null] }),
    JSON.stringify({ verdict: 'PASS', summary: '', findings: [finding('p1')] }),
    JSON.stringify({ verdict: 'PASS', summary: '', findings: [finding('HIGH')] }),
    JSON.stringify({ verdict: 'PASS', summary: '', findings: [{ severity: 'P3' }] }),
    JSON.stringify({ verdict: 'PASS', summary: 1, findings: [] }),
    JSON.stringify({ verdict: 'PASS', summary: '', findings: [], extra: true }),
    JSON.stringify({ verdict: 'pass', summary: '', findings: [] }),
  ];
  for (const raw of bad) assert.equal(decide(raw).state, 'failure', raw);
  assert.equal(schemaError(JSON.parse(verdict('PASS'))), null);
});

test('a non-zero Codex exit fails even with a PASS file on disk (CodeRabbit #2728)', () => {
  const r = decide(verdict('PASS'), '124');
  assert.equal(r.state, 'failure');
  assert.match(r.description, /Codex exited 124/);
  assert.equal(decide(verdict('PASS'), '0').state, 'success');
});

test('scrub removes credentials, including \\u-escaped ones, and long token runs', () => {
  const auth = JSON.stringify({
    tokens: { access_token: 'eyJaccess-token-value-123', refresh_token: 'rt_refresh-value-456789' },
    short: 'abc',
  });
  const secrets = credentialStrings(auth, ['sk-proj-0123456789abcdef']);
  assert.ok(!secrets.includes('abc'), 'short values are not treated as secrets');
  // s is "s": JSON.parse decodes it, so a literal text replace would miss it.
  const escaped =
    '{"verdict":"PASS","summary":"\\u0073k-proj-0123456789abcdef","findings":[{"severity":"P3","title":"rt_refresh-value-456789","file":"a"}]}';
  const out = scrub(escaped, secrets);
  const parsed = JSON.parse(out);
  assert.equal(parsed.summary, '[REDACTED]');
  assert.equal(parsed.findings[0].title, '[REDACTED]');
  const long = scrub(
    verdict('PASS', [finding('P3', 'see QWxhZGRpbjpvcGVuIHNlc2FtZQxxxxxxxxxxxxxx here')]),
    []
  );
  assert.match(JSON.parse(long).findings[0].title, /^see \[REDACTED\] here$/);
  const path = scrub(verdict('PASS', [finding('P3', 't', 'scripts/ci/nexus-receipt/lib.mjs')]), []);
  assert.equal(JSON.parse(path).findings[0].file, 'scripts/ci/nexus-receipt/lib.mjs');
});

test('blocked comment carries the marker and findings table, and no free-text summary', () => {
  const raw = verdict(
    'BLOCK',
    [finding('P1', 'refund | double-charged', 'app/api/x.ts')],
    'secret-ish prose'
  );
  const body = renderComment(raw, 'abcdef1234567890', 'https://run');
  assert.ok(body.startsWith(COMMENT_MARKER));
  assert.match(body, /BLOCKED on `abcdef123456`/);
  assert.match(body, /\| P1 \| refund \\\| double-charged \| app\/api\/x\.ts \|/);
  assert.match(body, /Fix the P0\/P1 findings below and push/);
  assert.ok(!body.includes('secret-ish prose'));
});

test('pass comment says the block is resolved', () => {
  const body = renderComment(verdict('PASS'), 'abc', 'u');
  assert.match(body, /PASS on `abc`/);
  assert.match(body, /resolved/);
});

const run = (args, env = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  });

test('CLI: missing file fails, clean PASS succeeds, non-zero CODEX_EXIT fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-'));
  const missing = run([join(dir, 'nope.json')]);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /^failure\|/);
  const ok = join(dir, 'ok.json');
  writeFileSync(ok, verdict('PASS'));
  const pass = run([ok]);
  assert.equal(pass.status, 0);
  assert.match(pass.stdout, /^success\|PASS reviewer=codex ci findings=0/);
  const crashed = run([ok], { CODEX_EXIT: '1' });
  assert.equal(crashed.status, 1);
  assert.match(crashed.stdout, /^failure\|Codex exited 1/);
});

test('CLI --scrub rewrites the file; --mask prints one add-mask line per credential', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scrub-'));
  const v = join(dir, 'v.json');
  const a = join(dir, 'auth.json');
  writeFileSync(a, JSON.stringify({ t: 'secret-token-abcdefghijkl', u: 'other-secret-mnopqrstuv' }));
  writeFileSync(v, verdict('PASS', [], 'saw secret-token-abcdefghijkl'));
  assert.equal(run(['--scrub', v, a]).status, 0);
  assert.ok(!readFileSync(v, 'utf8').includes('secret-token-abcdefghijkl'));
  const mask = run(['--mask', a], { OPENAI_API_KEY: 'sk-test-key-000000000000' });
  assert.equal(mask.status, 0);
  const lines = mask.stdout.trim().split('\n').sort();
  assert.deepEqual(lines, [
    '::add-mask::other-secret-mnopqrstuv',
    '::add-mask::secret-token-abcdefghijkl',
    '::add-mask::sk-test-key-000000000000',
  ]);
});
