// Guard for .github/workflows/nexus-sandbox-proof.yml (RA-8676). The proof job
// is the only place the review sandbox is observed on a real GitHub runner, so
// its shape is reviewed: no secret, read-only token, its red controls keep their
// exact expected breaches, and the proof steps keep expecting a clean result.
// Each check is shown to fail on a planted edit.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parse as parseYaml } from 'yaml';

const PROOF = fileURLToPath(new URL('../../../.github/workflows/nexus-sandbox-proof.yml', import.meta.url));
const RECEIPT = fileURLToPath(new URL('../../../.github/workflows/nexus-release-receipt.yml', import.meta.url));
const EXEMPTIONS = fileURLToPath(new URL('../../../.github/ci-mirror.exempt.json', import.meta.url));

const PROBE_TAIL = '--checkout . --codex-home "$CODEX_HOME" --base main';
// Step name -> the exact text its run line must start with. Red controls must
// name their breaches; a proof step must expect clean.
const EXPECTED_RUNS = {
  'Install Codex': 'node "$SB" install',
  'Remove PR-supplied Codex configuration': 'rm -rf .codex',
  'Observe the runner': 'node "$SB" observe --checkout . --codex-home "$CODEX_HOME"',
  'Prepare runner for the sandbox': 'node "$SB" prepare-host --checkout . --codex-home "$CODEX_HOME"',
  'Control, sandbox off': `node "$SB" probe --mode off --expect breach:outside-read,net-ip,net-host ${PROBE_TAIL}`,
  "Control, today's layout": `node "$SB" probe --mode legacy --expect breach:outside-read,login-read ${PROBE_TAIL}`,
  'Proof, review profile': `node "$SB" probe --mode profile --expect clean --hostile-config ${PROBE_TAIL}`,
  'Proof, codex exec path with a scripted model': `node "$SB" exec-probe ${PROBE_TAIL}`,
};
const STEP_NAMES = [
  '(checkout)', '(setup-node)', 'Install Codex', 'Create a fake Codex home',
  'Remove PR-supplied Codex configuration', 'Observe the runner',
  'Prepare runner for the sandbox', 'Control, sandbox off', "Control, today's layout",
  'Proof, review profile', 'Proof, codex exec path with a scripted model', 'Summary',
];
const FAKE_LOGIN = `printf '%s' '{"FAKE":"not a real login"}' > "$RUNNER_TEMP/codex-fake/auth.json"`;

const usesOf = (text, action) => [...text.matchAll(new RegExp(`uses: ${action}@([0-9a-f]{40})`, 'g'))].map((m) => m[1]);
const stepName = (s) => s?.name ?? (String(s?.uses ?? '').startsWith('actions/checkout@') ? '(checkout)'
  : String(s?.uses ?? '').startsWith('actions/setup-node@') ? '(setup-node)' : '(unnamed)');

/** Plain-English problems with the proof workflow; empty means it is as reviewed. */
export function proofWorkflowProblems(text, receiptText = readFileSync(RECEIPT, 'utf8')) {
  let wf;
  try { wf = parseYaml(text); } catch { return ['the proof workflow is not valid YAML']; }
  const problems = [];
  const on = wf?.on ?? {};
  if (!isDeepStrictEqual(Object.keys(on).sort(), ['pull_request', 'push', 'schedule', 'workflow_dispatch']))
    problems.push(`triggers are [${Object.keys(on)}], expected pull_request, push, schedule, workflow_dispatch`);
  if (/pull_request_target/.test(text)) problems.push('the proof must never run on pull_request_target');
  if (!isDeepStrictEqual(wf?.permissions, { contents: 'read' })) problems.push('permissions are wider than contents: read');
  if (/secrets\.|environment:|GITHUB_TOKEN|github\.token/.test(text)) problems.push('the proof touches a secret, an environment or the token');
  const jobs = Object.keys(wf?.jobs ?? {});
  if (!isDeepStrictEqual(jobs, ['proof'])) problems.push(`jobs are [${jobs}], expected only proof`);
  const job = wf?.jobs?.proof ?? {};
  for (const k of ['continue-on-error', 'if', 'container', 'permissions', 'defaults'])
    if (k in job) problems.push(`the proof job sets ${k}`);
  if (job['runs-on'] !== 'ubuntu-latest') problems.push('the proof does not run on ubuntu-latest');
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const names = steps.map(stepName);
  if (!isDeepStrictEqual(names, STEP_NAMES)) problems.push(`steps are [${names.join(' | ')}]`);
  for (const s of steps) {
    if ('continue-on-error' in s) problems.push(`"${stepName(s)}" may fail quietly`);
    if ('env' in s) problems.push(`"${stepName(s)}" sets its own environment`);
    if ('if' in s && stepName(s) !== 'Summary') problems.push(`"${stepName(s)}" has a condition`);
    const run = String(s.run ?? '').replace(/\s+/g, ' ').trim();
    const want = EXPECTED_RUNS[stepName(s)];
    const exact = stepName(s) === 'Remove PR-supplied Codex configuration';
    if (want && !(exact ? run === want : run.startsWith(want))) problems.push(`"${stepName(s)}" no longer runs: ${want}`);
    if (/\|\||; *true|exit 0/.test(run)) problems.push(`"${stepName(s)}" can swallow a failure`);
  }
  const summary = steps.find((s) => s?.name === 'Summary');
  if (summary?.if !== 'always()') problems.push('the summary does not run after a failure');
  const home = String(steps.find((s) => s?.name === 'Create a fake Codex home')?.run ?? '');
  if (!home.includes(FAKE_LOGIN)) problems.push('the Codex home does not hold the fixed fake login');
  for (const action of ['actions/checkout', 'actions/setup-node']) {
    const mine = usesOf(text, action);
    const theirs = new Set(usesOf(receiptText, action));
    if (mine.length !== 1 || !theirs.has(mine[0])) problems.push(`${action} is not pinned to the receipt workflow's commit`);
  }
  return problems;
}

/** The proof job is skipped by the local CI copy, and only that job. */
export function proofExemptionProblems(jsonText) {
  let doc;
  try { doc = JSON.parse(jsonText); } catch { return ['the exemption file is not valid JSON']; }
  const mine = (k) => (Array.isArray(doc?.[k]) ? doc[k] : []).filter((e) => e?.workflow === 'nexus-sandbox-proof.yml');
  const problems = [];
  if (mine('unavailable').length) problems.push('the proof has an "unavailable" entry');
  const es = mine('exempt');
  if (es.length !== 1) problems.push(`the proof has ${es.length} exemptions, expected 1`);
  for (const e of es) {
    if (e.job !== 'proof') problems.push(`the exemption covers job "${e.job ?? '*'}", expected proof`);
    if (e.test_gap !== true) problems.push('the exemption is not counted as a gap');
    if (typeof e.reason !== 'string' || e.reason.trim().length < 40) problems.push('the exemption has no real reason');
  }
  return problems;
}

const real = () => readFileSync(PROOF, 'utf8');
function mutate(text, from, to) {
  assert.ok(text.includes(from), `the proof workflow no longer contains: ${from}`);
  return text.replace(from, to);
}

test('the proof workflow is as reviewed', () => {
  assert.deepEqual(proofWorkflowProblems(real()), []);
});

test('each way of weakening the proof is caught', () => {
  const good = real();
  const cases = {
    'red control expects nothing': mutate(good, '--expect breach:outside-read,net-ip,net-host', '--expect clean'),
    "today's layout control drops the login": mutate(good, 'breach:outside-read,login-read', 'breach:outside-read'),
    'proof accepts a breach': mutate(good, '--mode profile --expect clean', '--mode profile --expect breach:write'),
    'proof run without the hostile config': mutate(good, '--expect clean --hostile-config', '--expect clean'),
    'proof run with the sandbox off': mutate(good, '--mode profile', '--mode off'),
    'exec proof removed': good.slice(0, good.indexOf('      - name: Proof, codex exec path'))
      + good.slice(good.indexOf('      - name: Summary')),
    'a step may fail quietly': mutate(good, '      - name: Proof, review profile\n',
      '      - name: Proof, review profile\n        continue-on-error: true\n'),
    'a step swallows its exit code': mutate(good, '--label "Proof, review profile" --record "$PROOF_RECORD"',
      '--label "Proof, review profile" --record "$PROOF_RECORD" || true'),
    'a secret is handed in': mutate(good, '    env:\n      SB:', '    env:\n      X: ${{ secrets.CODEX_AUTH_JSON }}\n      SB:'),
    'an environment is attached': mutate(good, '    runs-on: ubuntu-latest\n', '    runs-on: ubuntu-latest\n    environment: nexus-release-receipt\n'),
    'token widened': mutate(good, 'permissions:\n  contents: read\n', 'permissions:\n  contents: write\n'),
    'runs on pull_request_target': mutate(good, '  pull_request:\n', '  pull_request_target:\n'),
    'summary skipped after a failure': mutate(good, '        if: always()\n', ''),
    'a real-looking login is planted': mutate(good, '{"FAKE":"not a real login"}', '{"tokens":"x"}'),
    'checkout moved to another commit': good.replace(/(actions\/checkout@)[0-9a-f]{40}/, `$1${'b'.repeat(40)}`),
    'repository .codex left in place': good.replace(/ {6}# Mirrors "Remove PR-supplied[\s\S]*?run: rm -rf \.codex\n\n/, ''),
    'repository .codex removal aimed elsewhere': mutate(good, 'run: rm -rf .codex', 'run: rm -rf .codex-old'),
    'repository .codex removed after the probes': (() => {
      const block = good.match(/ {6}# Mirrors "Remove PR-supplied[\s\S]*?run: rm -rf \.codex\n\n/)[0];
      return good.replace(block, '').replace('      - name: Summary', `${block}      - name: Summary`);
    })(),
    'the proof job is skipped': mutate(good, '  proof:\n', "  proof:\n    if: github.actor == 'nobody'\n"),
  };
  const missed = [];
  for (const [name, text] of Object.entries(cases)) {
    assert.notEqual(text, good, `${name}: the mutation changed nothing`);
    if (proofWorkflowProblems(text).length === 0) missed.push(name);
  }
  assert.deepEqual(missed, [], 'planted edits the check did not catch');
});

test('the local CI copy skips the proof job only, and says why', () => {
  const text = readFileSync(EXEMPTIONS, 'utf8');
  assert.deepEqual(proofExemptionProblems(text), []);
  const good = JSON.parse(text);
  const entry = good.exempt.find((e) => e.workflow === 'nexus-sandbox-proof.yml');
  const others = good.exempt.filter((e) => e !== entry);
  const withEntries = (...es) => JSON.stringify({ ...good, exempt: [...others, ...es] });
  for (const [name, t] of Object.entries({
    'every job': withEntries({ ...entry, job: '*' }),
    'entry removed': withEntries(),
    'gap not declared': withEntries({ ...entry, test_gap: false }),
    'twice': withEntries(entry, entry),
    'not JSON': '{',
  })) assert.notDeepEqual(proofExemptionProblems(t), [], name);
});
