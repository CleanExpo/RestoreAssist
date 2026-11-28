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
const verdict = (v, findings = [], summary = '') =>
  JSON.stringify({ verdict: v, summary, findings });
const finding = (severity, title = 't', file = 'a.ts') => ({ severity, title, file });

// What the workflow passes in. Codex exited 0, a 40-hex head commit, this
// repository's run link. None of them shares four characters in a row with FAKE.
const RAN = '0';
const SHA = 'c0ffee11c0ffee22c0ffee33c0ffee44c0ffee55';
const RUN_URL = 'https://github.com/CleanExpo/RestoreAssist/actions/runs/9080706050';

// A made-up value standing in for a credential. It is not one and unlocks nothing.
const FAKE = 'FAKE-TOKEN-NOT-REAL-0123456789-ABCDEFGH';
const pieces = (s, n) => s.match(new RegExp(`.{1,${n}}`, 'g'));
// Ways a model could be talked into writing that value so a redaction misses it.
const DISGUISES = {
  whole: FAKE,
  'spaced chunks (the reviewed defect)': pieces(FAKE, 8).join(' '),
  'path-like chunks': pieces(FAKE, 8).join('/'),
  'one chunk per line': pieces(FAKE, 4).join('\n'),
  'zero-width separators': pieces(FAKE, 1).join('​'),
  reversed: [...FAKE].reverse().join(''),
  base64: Buffer.from(FAKE).toString('base64'),
  hex: Buffer.from(FAKE).toString('hex'),
  'lower case': FAKE.toLowerCase(),
  'character codes': [...FAKE].map((c) => c.charCodeAt(0)).join(','),
  'markdown and table breakers': `| ${FAKE} | [x](https://example.invalid/${FAKE}) <!-- ${FAKE} -->`,
};
const windows = (s, n = 4) =>
  Array.from({ length: s.length - n + 1 }, (_, i) => s.slice(i, i + n));
const FAKE_WINDOWS = [...new Set([...windows(FAKE), ...windows(FAKE.toLowerCase())])];
const carriesFake = (text) => FAKE_WINDOWS.some((w) => text.includes(w));

test('schema-valid PASS with only P2/P3 findings is success', () => {
  const r = decide(verdict('PASS', [finding('P2', 'nit'), finding('P3')]), RAN);
  assert.equal(r.state, 'success');
  assert.equal(r.description, 'PASS reviewer=codex ci findings=2');
});

test('any P0 or P1 fails even when the verdict says PASS', () => {
  for (const severity of ['P0', 'P1']) {
    const r = decide(verdict('PASS', [finding(severity, 'auth bypass')]), RAN);
    assert.equal(r.state, 'failure', severity);
    assert.equal(
      r.description,
      'BLOCK reviewer=codex 1 P0/P1 finding(s); finding text withheld'
    );
  }
});

test('BLOCK with no findings still fails', () => {
  const r = decide(verdict('BLOCK'), RAN);
  assert.equal(r.state, 'failure');
  assert.equal(r.description, 'Codex verdict was BLOCK');
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
  for (const raw of bad) assert.equal(decide(raw, RAN).state, 'failure', raw);
  assert.equal(decide(undefined, RAN).state, 'failure', 'no verdict text at all');
  assert.equal(schemaError(JSON.parse(verdict('PASS'))), null);
});

test('a non-zero Codex exit fails even with a PASS file on disk (CodeRabbit #2728)', () => {
  const r = decide(verdict('PASS'), '124');
  assert.equal(r.state, 'failure');
  assert.equal(r.description, 'Codex exited 124');
  assert.equal(decide(verdict('PASS'), RAN).state, 'success');
});

test('a missing, empty or malformed Codex exit is a failure, never a default', () => {
  // UNI-3575 review: `env.CODEX_EXIT ?? '0'` and `decide(raw, codexExit = '0')`
  // turned "nobody recorded an exit code" into "Codex exited 0". Only the exact
  // text "0" proves the review ran to the end.
  const pass = verdict('PASS');
  const notProof = [
    undefined,
    null,
    '',
    ' ',
    'not-run',
    '00',
    '0 ',
    ' 0',
    '0\n',
    '+0',
    '-0',
    '0.0',
    '0x0',
    'true',
    'success',
    0,
    false,
    [],
    ['0'],
    {},
  ];
  for (const exit of notProof) {
    const r = decide(pass, exit);
    assert.equal(r.state, 'failure', `exit ${JSON.stringify(exit)}`);
    assert.equal(
      r.description,
      'Codex exit code missing or malformed; the review is not proven',
      `exit ${JSON.stringify(exit)}`
    );
    assert.match(renderComment(pass, SHA, RUN_URL, exit), /Release receipt: BLOCKED/);
  }
  assert.equal(decide(pass).state, 'failure', 'no exit argument at all');
  assert.match(renderComment(pass, SHA, RUN_URL), /Release receipt: BLOCKED/);
  assert.equal(decide(pass, RAN).state, 'success', 'the control: an exact "0" still passes');
});

test('no text from the verdict reaches the status or the PR comment', () => {
  // UNI-3575 review: a credential split into spaced chunks survived the
  // redaction and was posted in a finding title. The fix is not a wider
  // redaction: nothing from the verdict is copied out at all, so what is posted
  // for a verdict full of the made-up value is identical, character for
  // character, to what is posted for the same verdict with dull text.
  const shapes = [
    ['BLOCK', ['P1']],
    ['BLOCK', ['P0', 'P1', 'P2', 'P3']],
    ['PASS', ['P1']],
    ['PASS', ['P2', 'P3']],
    ['PASS', []],
    ['BLOCK', []],
  ];
  for (const [name, text] of Object.entries(DISGUISES)) {
    for (const [v, severities] of shapes) {
      const leaky = verdict(v, severities.map((s) => finding(s, text, text)), text);
      const dull = verdict(v, severities.map((s) => finding(s)), '');
      const label = `${name}, ${v} ${severities.join('+') || 'no findings'}`;
      assert.equal(decide(leaky, RAN).description, decide(dull, RAN).description, label);
      assert.equal(
        renderComment(leaky, SHA, RUN_URL, RAN),
        renderComment(dull, SHA, RUN_URL, RAN),
        label
      );
      assert.ok(!carriesFake(decide(leaky, RAN).description), `status: ${label}`);
      assert.ok(!carriesFake(renderComment(leaky, SHA, RUN_URL, RAN)), `comment: ${label}`);
    }
    // A verdict that is refused must not echo what it was refused for.
    const refused = [
      text,
      JSON.stringify({ verdict: text, summary: '', findings: [] }),
      JSON.stringify({ verdict: 'PASS', summary: '', findings: [], [text]: text }),
      JSON.stringify({ verdict: 'PASS', summary: '', findings: [finding(text)] }),
      JSON.stringify({ verdict: 'PASS', summary: '', findings: [{ ...finding('P1'), [text]: 1 }] }),
    ];
    for (const raw of refused) {
      assert.equal(decide(raw, RAN).state, 'failure', name);
      assert.ok(!carriesFake(decide(raw, RAN).description), `refused status: ${name}`);
      assert.ok(!carriesFake(renderComment(raw, SHA, RUN_URL, RAN)), `refused comment: ${name}`);
    }
    // Nor may the exit code, the commit or the run link carry it out.
    assert.ok(!carriesFake(decide(verdict('PASS'), text).description), `exit: ${name}`);
    const odd = renderComment(verdict('PASS'), text, `${RUN_URL}?${text}`, text);
    assert.ok(!carriesFake(odd), `comment arguments: ${name}`);
  }
});

test('the status text and the comment are fixed wording plus counts', () => {
  const blocked = verdict(
    'BLOCK',
    [
      finding('P1', 'refund | double-charged', 'app/api/x.ts'),
      finding('P2', 'second'),
      finding('P2', 'third'),
    ],
    'free prose from the model'
  );
  assert.equal(
    renderComment(blocked, SHA, RUN_URL, RAN),
    [
      COMMENT_MARKER,
      '### Release receipt: BLOCKED on `c0ffee11c0ff`',
      '',
      'BLOCK reviewer=codex 1 P0/P1 finding(s); finding text withheld.',
      '',
      '| Severity | Findings |',
      '| --- | --- |',
      '| P0 | 0 |',
      '| P1 | 1 |',
      '| P2 | 2 |',
      '| P3 | 0 |',
      '',
      'Finding text is not posted: it is model output written next to a credential, so only counts leave the runner. Run the release-gate review on this commit locally to read the findings, fix every P0 and P1, and push; the review re-runs on the new commit.',
      '',
      `[Review run](${RUN_URL})`,
    ].join('\n')
  );
  assert.equal(
    renderComment(verdict('PASS', [finding('P3')]), SHA, RUN_URL, RAN),
    [
      COMMENT_MARKER,
      '### Release receipt: PASS on `c0ffee11c0ff`',
      '',
      'The earlier blocking findings are resolved. This PR has its receipt.',
      '',
      '| Severity | Findings |',
      '| --- | --- |',
      '| P0 | 0 |',
      '| P1 | 0 |',
      '| P2 | 0 |',
      '| P3 | 1 |',
      '',
      `[Review run](${RUN_URL})`,
    ].join('\n')
  );
  // No usable verdict: no table, and wording that does not talk about findings.
  assert.equal(
    renderComment('not json', SHA, RUN_URL, RAN),
    [
      COMMENT_MARKER,
      '### Release receipt: BLOCKED on `c0ffee11c0ff`',
      '',
      'Codex verdict was not valid JSON.',
      '',
      'The review did not produce a usable verdict, so there is no receipt. Push a new commit or re-run this workflow to review again.',
      '',
      `[Review run](${RUN_URL})`,
    ].join('\n')
  );
});

test('counts are capped, so a count cannot carry a long number out', () => {
  const many = Array.from({ length: 25 }, () => finding('P2'));
  assert.equal(decide(verdict('PASS', many), RAN).description, 'PASS reviewer=codex ci findings=20+');
  assert.match(renderComment(verdict('PASS', many), SHA, RUN_URL, RAN), /^\| P2 \| 20\+ \|$/m);
  const blocking = Array.from({ length: 21 }, () => finding('P0'));
  assert.equal(
    decide(verdict('BLOCK', blocking), RAN).description,
    'BLOCK reviewer=codex 20+ P0/P1 finding(s); finding text withheld'
  );
  const twenty = Array.from({ length: 20 }, () => finding('P3'));
  assert.equal(decide(verdict('PASS', twenty), RAN).description, 'PASS reviewer=codex ci findings=20');
});

test('a commit id or run link that is not in the expected shape is left out', () => {
  const pass = verdict('PASS');
  const badShas = [undefined, '', 'abc', SHA.toUpperCase(), `${SHA}0`, `${SHA}\n`, SHA.slice(1), `\`${SHA}`];
  for (const sha of badShas) {
    const body = renderComment(pass, sha, RUN_URL, RAN);
    assert.match(body, /^### Release receipt: PASS on an unverified commit$/m, JSON.stringify(sha));
  }
  const badUrls = [
    undefined,
    '',
    'u',
    'https://run',
    'http://github.com/CleanExpo/RestoreAssist/actions/runs/1',
    'https://github.com.example.invalid/CleanExpo/RestoreAssist/actions/runs/1',
    'https://github.com/CleanExpo/RestoreAssist/actions/runs/1?x=1',
    'https://github.com/CleanExpo/RestoreAssist/actions/runs/1) [x](https://example.invalid',
    'https://github.com/CleanExpo/RestoreAssist/actions/runs/1\n',
    'https://github.com/CleanExpo/RestoreAssist/pull/1',
    `${RUN_URL}/attempts/2`,
  ];
  for (const url of badUrls) {
    const body = renderComment(pass, SHA, url, RAN);
    assert.ok(!body.includes('Review run'), JSON.stringify(url));
    assert.ok(!body.includes('example.invalid'), JSON.stringify(url));
  }
  assert.ok(renderComment(pass, SHA, RUN_URL, RAN).endsWith(`[Review run](${RUN_URL})`));
});

test('scrub removes credentials, including \\u-escaped ones, and long token runs', () => {
  // Made-up values only. scrub() is the second layer, for the verdict file on
  // disk; no public output depends on it (see the tests above).
  const auth = JSON.stringify({
    tokens: { access_token: 'fake-access-not-real-123', refresh_token: 'fake-refresh-not-real-456' },
    short: 'abc',
  });
  const secrets = credentialStrings(auth, ['fake-key-not-real-0123456789']);
  assert.ok(!secrets.includes('abc'), 'short values are not treated as secrets');
  // f is "f": JSON.parse decodes it, so a literal text replace would miss it.
  const escaped =
    '{"verdict":"PASS","summary":"\\u0066ake-key-not-real-0123456789","findings":[{"severity":"P3","title":"fake-refresh-not-real-456","file":"a"}]}';
  const out = scrub(escaped, secrets);
  const parsed = JSON.parse(out);
  assert.equal(parsed.summary, '[REDACTED]');
  assert.equal(parsed.findings[0].title, '[REDACTED]');
  const long = scrub(
    verdict('PASS', [finding('P3', 'see FAKEfakeFAKEfakeFAKEfakeFAKEfakeFAKEfake here')]),
    []
  );
  assert.match(JSON.parse(long).findings[0].title, /^see \[REDACTED\] here$/);
  const path = scrub(verdict('PASS', [finding('P3', 't', 'scripts/ci/nexus-receipt/lib.mjs')]), []);
  assert.equal(JSON.parse(path).findings[0].file, 'scripts/ci/nexus-receipt/lib.mjs');
});

test('a credential used as a property name is scrubbed and never echoed (CodeRabbit #1386)', () => {
  const secret = 'fake-name-not-real-abcdefgh';
  const raw = JSON.stringify({ verdict: 'PASS', summary: '', findings: [], [secret]: 1 });
  const out = scrub(raw, [secret]);
  assert.ok(!out.includes(secret));
  assert.ok('summary' in JSON.parse(out), 'ordinary keys are unchanged');
  const r = decide(raw, RAN);
  assert.equal(r.state, 'failure');
  assert.ok(!r.description.includes(secret), 'schema errors never echo field names');
});

const run = (args, env = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  });

test('CLI: a missing file fails, a clean PASS with CODEX_EXIT=0 succeeds, a non-zero exit fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-'));
  const missing = run([join(dir, 'nope.json')], { CODEX_EXIT: '0' });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, 'failure|Codex verdict was not valid JSON\n');
  const none = run([], { CODEX_EXIT: '0' });
  assert.equal(none.status, 1);
  assert.match(none.stdout, /^failure\|/);
  const ok = join(dir, 'ok.json');
  writeFileSync(ok, verdict('PASS'));
  const pass = run([ok], { CODEX_EXIT: '0' });
  assert.equal(pass.status, 0);
  assert.equal(pass.stdout, 'success|PASS reviewer=codex ci findings=0\n');
  const crashed = run([ok], { CODEX_EXIT: '1' });
  assert.equal(crashed.status, 1);
  assert.equal(crashed.stdout, 'failure|Codex exited 1\n');
});

test('CLI: a PASS file with no CODEX_EXIT, an empty one or "not-run" is a failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-'));
  const ok = join(dir, 'ok.json');
  writeFileSync(ok, verdict('PASS'));
  for (const env of [{}, { CODEX_EXIT: '' }, { CODEX_EXIT: 'not-run' }, { CODEX_EXIT: '0 ' }]) {
    const r = run([ok], env);
    assert.equal(r.status, 1, JSON.stringify(env));
    assert.equal(
      r.stdout,
      'failure|Codex exit code missing or malformed; the review is not proven\n',
      JSON.stringify(env)
    );
    const comment = run(['--comment', ok, SHA, RUN_URL], env);
    assert.equal(comment.status, 0, JSON.stringify(env));
    assert.match(comment.stdout, /Release receipt: BLOCKED/, JSON.stringify(env));
  }
});

test('CLI: what is printed for the status and the comment carries no verdict text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-'));
  const leaky = join(dir, 'leaky.json');
  const spaced = DISGUISES['spaced chunks (the reviewed defect)'];
  writeFileSync(leaky, verdict('BLOCK', [finding('P1', spaced, spaced)], spaced));
  const status = run([leaky], { CODEX_EXIT: '0' });
  assert.equal(status.status, 1);
  assert.equal(
    status.stdout,
    'failure|BLOCK reviewer=codex 1 P0/P1 finding(s); finding text withheld\n'
  );
  const comment = run(['--comment', leaky, SHA, RUN_URL], { CODEX_EXIT: '0' });
  assert.equal(comment.status, 0);
  assert.ok(comment.stdout.startsWith(COMMENT_MARKER));
  assert.ok(!carriesFake(comment.stdout));
  assert.match(comment.stdout, /^\| P1 \| 1 \|$/m);
});

test('CLI --scrub rewrites the file; --mask prints one add-mask line per credential', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scrub-'));
  const v = join(dir, 'v.json');
  const a = join(dir, 'auth.json');
  writeFileSync(
    a,
    JSON.stringify({ t: 'fake-token-not-real-abcdefgh', u: 'fake-other-not-real-mnopqr' })
  );
  writeFileSync(v, verdict('PASS', [], 'saw fake-token-not-real-abcdefgh'));
  assert.equal(run(['--scrub', v, a]).status, 0);
  assert.ok(!readFileSync(v, 'utf8').includes('fake-token-not-real-abcdefgh'));
  const mask = run(['--mask', a], { OPENAI_API_KEY: 'fake-key-not-real-000000000' });
  assert.equal(mask.status, 0);
  const lines = mask.stdout.trim().split('\n').sort();
  assert.deepEqual(lines, [
    '::add-mask::fake-key-not-real-000000000',
    '::add-mask::fake-other-not-real-mnopqr',
    '::add-mask::fake-token-not-real-abcdefgh',
  ]);
});
