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
} from './verdict.mjs';

test('scrub removes every credential string from auth.json and the API key', () => {
  const auth = JSON.stringify({
    tokens: { access_token: 'eyJaccess-token-value-123', refresh_token: 'rt_refresh-value-456789' },
    short: 'abc',
  });
  const secrets = credentialStrings(auth, ['sk-proj-apikey-0123456789']);
  const leaked = JSON.stringify({
    verdict: 'PASS',
    summary: 'token eyJaccess-token-value-123 and sk-proj-apikey-0123456789',
    findings: [{ severity: 'P3', title: 'rt_refresh-value-456789', file: 'a' }],
  });
  const out = scrub(leaked, secrets);
  assert.ok(!out.includes('eyJaccess-token-value-123'));
  assert.ok(!out.includes('rt_refresh-value-456789'));
  assert.ok(!out.includes('sk-proj-apikey-0123456789'));
  assert.equal(out.split('[REDACTED]').length - 1, 3);
  assert.ok(!secrets.includes('abc'), 'short values are not treated as secrets');
});

test('CLI --scrub rewrites the verdict file in place', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scrub-'));
  const v = join(dir, 'v.json');
  const a = join(dir, 'auth.json');
  writeFileSync(a, JSON.stringify({ t: 'secret-token-abcdefghijkl' }));
  writeFileSync(v, JSON.stringify({ summary: 'saw secret-token-abcdefghijkl' }));
  const r = spawnSync(process.execPath, [SCRIPT, '--scrub', v, a], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!readFileSync(v, 'utf8').includes('secret-token-abcdefghijkl'));
});

test('blocked comment carries the marker, the findings table and the fix instruction', () => {
  const raw = JSON.stringify({
    verdict: 'BLOCK',
    summary: 'one real bug',
    findings: [{ severity: 'P1', title: 'refund | double-charged', file: 'app/api/x.ts' }],
  });
  const body = renderComment(raw, 'abcdef1234567890', 'https://run');
  assert.ok(body.startsWith(COMMENT_MARKER));
  assert.match(body, /BLOCKED on `abcdef123456`/);
  assert.match(body, /\| P1 \| refund \\\| double-charged \| app\/api\/x\.ts \|/);
  assert.match(body, /Fix the P0\/P1 findings below and push/);
});

test('pass comment says the block is resolved', () => {
  const body = renderComment(
    JSON.stringify({ verdict: 'PASS', summary: '', findings: [] }),
    'abc',
    'u'
  );
  assert.match(body, /PASS on `abc`/);
  assert.match(body, /resolved/);
});

const SCRIPT = fileURLToPath(new URL('./verdict.mjs', import.meta.url));

test('PASS with only P2/P3 findings is success', () => {
  const r = decide(
    JSON.stringify({ verdict: 'PASS', findings: [{ severity: 'P2', title: 'nit' }] })
  );
  assert.equal(r.state, 'success');
  assert.match(r.description, /^PASS reviewer=codex/);
});

test('any P0 or P1 fails even when verdict says PASS', () => {
  for (const severity of ['P0', 'P1', 'p1']) {
    const r = decide(
      JSON.stringify({ verdict: 'PASS', findings: [{ severity, title: 'auth bypass' }] })
    );
    assert.equal(r.state, 'failure', severity);
    assert.match(r.description, /BLOCK reviewer=codex 1 P0\/P1: auth bypass/);
  }
});

test('BLOCK verdict with no findings still fails', () => {
  assert.equal(decide(JSON.stringify({ verdict: 'BLOCK', findings: [] })).state, 'failure');
});

test('malformed, empty or missing-findings input fails closed', () => {
  for (const raw of ['', 'not json', 'null', '{}', JSON.stringify({ verdict: 'PASS' })]) {
    assert.equal(decide(raw).state, 'failure', JSON.stringify(raw));
  }
});

test('CLI exits 1 on a missing file and 0 on a clean PASS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-'));
  const missing = spawnSync(process.execPath, [SCRIPT, join(dir, 'nope.json')], {
    encoding: 'utf8',
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /^failure\|/);
  const ok = join(dir, 'ok.json');
  writeFileSync(ok, JSON.stringify({ verdict: 'PASS', findings: [] }));
  const pass = spawnSync(process.execPath, [SCRIPT, ok], { encoding: 'utf8' });
  assert.equal(pass.status, 0);
  assert.match(pass.stdout, /^success\|PASS reviewer=codex ci findings=0/);
});
