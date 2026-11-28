import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

// The workflow IS the control: .github/workflows/nexus-release-receipt.yml
// posts the required `nexus/release-receipt` status. Whether the job that posts
// it waits for the job that tests its verdict logic is a YAML property, and
// nothing in the JavaScript notices when a YAML property changes (UNI-3575
// review: the receipt job had no `needs`, so it could post success while the
// verdict tests were failing on the same commit).
//
// This suite cannot live in scripts/ci/nexus-receipt/verdict.test.mjs: the
// workflow's own verdict-tests job runs that file with no `npm install`, so it
// cannot import a YAML parser.

const WORKFLOW = fileURLToPath(
  new URL('../../../.github/workflows/nexus-release-receipt.yml', import.meta.url)
);
const TEST_JOB = 'verdict-tests';
const RECEIPT_JOB = 'receipt';
// The only job condition allowed. Written out in full on purpose: GitHub adds
// its own "every needed job succeeded" check to a job condition only while the
// condition calls none of always(), failure(), cancelled() or success(), so the
// safe set is this one known expression, not "anything without always()".
const RECEIPT_IF = 'github.event.pull_request.head.repo.full_name == github.repository';
const TEST_COMMAND = 'node --test scripts/ci/nexus-receipt/verdict.test.mjs';

/** Returns a list of plain-English problems; empty means the wiring is sound. */
export function receiptWorkflowProblems(yamlText) {
  const problems = [];
  const jobs = parseYaml(yamlText)?.jobs ?? {};
  const names = Object.keys(jobs).sort().join(',');
  if (names !== [RECEIPT_JOB, TEST_JOB].sort().join(',')) {
    problems.push(`jobs are "${names}", expected exactly ${RECEIPT_JOB} and ${TEST_JOB}`);
  }
  const receipt = jobs[RECEIPT_JOB] ?? {};
  const needs = [receipt.needs ?? []].flat();
  if (!needs.includes(TEST_JOB)) {
    problems.push(`${RECEIPT_JOB} does not need ${TEST_JOB}`);
  }
  if (receipt.if !== RECEIPT_IF) {
    problems.push(`${RECEIPT_JOB} has a job condition other than the one reviewed`);
  }
  const tests = jobs[TEST_JOB] ?? {};
  if ('continue-on-error' in tests) {
    problems.push(`${TEST_JOB} sets continue-on-error, so its failure would not stop ${RECEIPT_JOB}`);
  }
  if ('if' in tests) {
    problems.push(`${TEST_JOB} has a job condition, so it can be skipped`);
  }
  const steps = Array.isArray(tests.steps) ? tests.steps : [];
  if (steps.some((s) => s && typeof s === 'object' && 'continue-on-error' in s)) {
    problems.push(`a ${TEST_JOB} step sets continue-on-error`);
  }
  if (steps.some((s) => s && typeof s === 'object' && 'if' in s)) {
    problems.push(`a ${TEST_JOB} step is conditional`);
  }
  if (steps.filter((s) => s?.run === TEST_COMMAND).length !== 1) {
    problems.push(`${TEST_JOB} does not run exactly "${TEST_COMMAND}"`);
  }
  // The test job must test the base branch's verdict logic, never the pull
  // request's copy: a checkout that names a ref could run the author's tests.
  for (const s of steps) {
    if (typeof s?.uses === 'string' && s.uses.startsWith('actions/checkout@')) {
      if (JSON.stringify(s.with ?? {}) !== JSON.stringify({ 'persist-credentials': false })) {
        problems.push(`${TEST_JOB} checkout takes options other than persist-credentials: false`);
      }
    }
  }
  return problems;
}

const real = () => readFileSync(WORKFLOW, 'utf8');

/** Replaces one exact piece of the real workflow; fails loudly if it is absent. */
function mutate(text, from, to) {
  assert.ok(text.includes(from), `the workflow no longer contains: ${from}`);
  return text.replace(from, to);
}

test('the receipt job runs only after verdict-tests succeeded', () => {
  assert.deepEqual(receiptWorkflowProblems(real()), []);
});

test('each way of unhooking the receipt from its tests is caught', () => {
  // Start from a workflow known to be wired correctly, then break one thing at
  // a time, so this proves the check above can fail.
  const good = real();
  const withNeeds = /^ {4}needs: verdict-tests\n/m;
  assert.match(good, withNeeds, 'the receipt job declares its needs on one line');
  const cases = {
    'needs removed': good.replace(withNeeds, ''),
    'needs points at nothing': good.replace(withNeeds, '    needs: []\n'),
    'always() in the receipt condition': mutate(
      good,
      `    if: ${RECEIPT_IF}`,
      `    if: always() && ${RECEIPT_IF}`
    ),
    '!cancelled() in the receipt condition': mutate(
      good,
      `    if: ${RECEIPT_IF}`,
      `    if: \${{ !cancelled() && ${RECEIPT_IF} }}`
    ),
    'receipt condition removed': mutate(good, `    if: ${RECEIPT_IF}\n`, ''),
    'test job may fail quietly': mutate(
      good,
      '  verdict-tests:\n',
      '  verdict-tests:\n    continue-on-error: true\n'
    ),
    'test job can be skipped': mutate(
      good,
      '  verdict-tests:\n',
      "  verdict-tests:\n    if: github.actor != 'someone'\n"
    ),
    'test step may fail quietly': mutate(
      good,
      `      - run: ${TEST_COMMAND}`,
      `      - run: ${TEST_COMMAND}\n        continue-on-error: true`
    ),
    'test command softened': mutate(
      good,
      `      - run: ${TEST_COMMAND}`,
      `      - run: ${TEST_COMMAND} || true`
    ),
    'test job checks out the pull request': mutate(
      good,
      '        with:\n          persist-credentials: false\n      - uses: actions/setup-node',
      '        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n          persist-credentials: false\n      - uses: actions/setup-node'
    ),
    'a third job that could post on its own': `${good}\n  other:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`,
  };
  for (const [name, text] of Object.entries(cases)) {
    assert.notEqual(text, good, `${name}: the mutation changed nothing`);
    assert.notDeepEqual(receiptWorkflowProblems(text), [], name);
  }
});

test('the workflow keeps its trigger and permissions as reviewed', () => {
  // Tier 1: this job holds a Codex login next to untrusted pull-request content.
  // A wider permission or a second trigger is a decision, not a drive-by edit.
  const wf = parseYaml(real());
  assert.deepEqual(Object.keys(wf.on), ['pull_request_target']);
  assert.deepEqual(wf.permissions, {
    contents: 'read',
    statuses: 'write',
    'pull-requests': 'write',
  });
  for (const job of Object.values(wf.jobs)) assert.ok(!('permissions' in job));
});
