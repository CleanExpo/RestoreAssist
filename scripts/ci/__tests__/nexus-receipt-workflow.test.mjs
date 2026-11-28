import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
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

// The test job is held to ONE reviewed shape, not checked against a list of
// settings known to be harmful. A list is only as long as its author's
// imagination: the first version of this suite looked for `if` and
// `continue-on-error`, and an `env` block setting NODE_OPTIONS walked past it and
// ran none of the verdict tests while the job still read success (UNI-3575
// discovery sweep). So anything not written here (an `env`, a `defaults`, a
// container, an extra step, another action, another option) is a failure, and
// adding one means changing this constant in the same reviewed diff.
// The top-level keys are held the same way, because a workflow-level `env` or
// `defaults` reaches the test job too.
const TOP_LEVEL_KEYS = ['concurrency', 'jobs', 'name', 'on', 'permissions'];
const TEST_JOB_SHAPE = {
  'runs-on': 'ubuntu-latest',
  'timeout-minutes': 5,
  steps: [
    // No `ref`: the base branch's verdict logic is tested, never the pull
    // request's copy.
    { uses: 'actions/checkout@<commit>', with: { 'persist-credentials': false } },
    { uses: 'actions/setup-node@<commit>', with: { 'node-version-file': '.nvmrc' } },
    { run: TEST_COMMAND },
  ],
};
// The two actions the test job may use, each pinned to a full commit id. The
// commit itself is not held: a dependency update that re-pins one is not a
// wiring change.
const PINNED_ACTION = /^(actions\/(?:checkout|setup-node))@[0-9a-f]{40}$/;

/** The job with each pinned action's commit replaced by a placeholder. */
function withoutActionCommits(job) {
  if (!job || typeof job !== 'object' || !Array.isArray(job.steps)) return job;
  const steps = job.steps.map((s) => {
    const pinned = typeof s?.uses === 'string' ? PINNED_ACTION.exec(s.uses) : null;
    return pinned ? { ...s, uses: `${pinned[1]}@<commit>` } : s;
  });
  return { ...job, steps };
}

/** Returns a list of plain-English problems; empty means the wiring is sound. */
export function receiptWorkflowProblems(yamlText) {
  const problems = [];
  const parsed = parseYaml(yamlText);
  const wf = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const top = Object.keys(wf).sort().join(',');
  if (top !== TOP_LEVEL_KEYS.join(',')) {
    problems.push(`top-level keys are "${top}", expected exactly ${TOP_LEVEL_KEYS.join(',')}`);
  }
  const jobs = wf.jobs && typeof wf.jobs === 'object' ? wf.jobs : {};
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
  if (!isDeepStrictEqual(withoutActionCommits(jobs[TEST_JOB]), TEST_JOB_SHAPE)) {
    problems.push(
      `${TEST_JOB} is not exactly the reviewed job (TEST_JOB_SHAPE in this file); ` +
        'anything added to it can stop the verdict tests running while it still succeeds'
    );
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
    // Settings that leave the test command and the `needs` line untouched but can
    // make the test job succeed without running the verdict tests (UNI-3575
    // discovery sweep: NODE_OPTIONS=--test-skip-pattern=.* ran none of them).
    'workflow environment switches the tests off': mutate(
      good,
      '\njobs:\n',
      '\nenv:\n  NODE_OPTIONS: --test-skip-pattern=.*\n\njobs:\n'
    ),
    'test job environment switches the tests off': mutate(
      good,
      '  verdict-tests:\n',
      '  verdict-tests:\n    env:\n      NODE_OPTIONS: --test-skip-pattern=.*\n'
    ),
    'test step environment switches the tests off': mutate(
      good,
      `      - run: ${TEST_COMMAND}`,
      `      - run: ${TEST_COMMAND}\n        env:\n          NODE_OPTIONS: --test-skip-pattern=.*`
    ),
    'an earlier step sets the environment for the test step': mutate(
      good,
      `      - run: ${TEST_COMMAND}`,
      `      - run: echo NODE_OPTIONS=--test-skip-pattern=.* >> "$GITHUB_ENV"\n      - run: ${TEST_COMMAND}`
    ),
    'workflow defaults move where commands run': mutate(
      good,
      '\njobs:\n',
      '\ndefaults:\n  run:\n    working-directory: pr\n\njobs:\n'
    ),
    'test job defaults move where commands run': mutate(
      good,
      '  verdict-tests:\n',
      '  verdict-tests:\n    defaults:\n      run:\n        working-directory: pr\n'
    ),
    'test job runs inside a container': mutate(
      good,
      '  verdict-tests:\n',
      '  verdict-tests:\n    container: node:22\n'
    ),
    'test job checkout is some other action': mutate(
      good,
      '      - uses: actions/checkout@',
      '      - uses: someone-else/checkout@'
    ),
    'test job checkout is not pinned to a commit': good.replace(
      /( {6}- uses: actions\/checkout@)[0-9a-f]{40}/,
      '$1v7'
    ),
    'test job Node version is set some other way': mutate(
      good,
      '          node-version-file: .nvmrc\n',
      '          node-version: 8\n'
    ),
  };
  // Collect every planted edit the check misses, so one run names them all.
  const missed = [];
  for (const [name, text] of Object.entries(cases)) {
    assert.notEqual(text, good, `${name}: the mutation changed nothing`);
    if (receiptWorkflowProblems(text).length === 0) missed.push(name);
  }
  assert.deepEqual(missed, [], 'planted edits the check did not catch');
});

test('a pinned action may move to another commit without failing the check', () => {
  // The shape is reviewed, not the version: a dependency update that re-pins
  // checkout or setup-node to a new 40-character commit is not a wiring change.
  const good = real();
  const pin = /(- uses: actions\/(?:checkout|setup-node)@)[0-9a-f]{40}/g;
  assert.ok((good.match(pin) ?? []).length >= 2, 'the test job pins both actions to commits');
  const bumped = good.replace(pin, `$1${'a'.repeat(40)}`);
  assert.notEqual(bumped, good);
  assert.deepEqual(receiptWorkflowProblems(bumped), []);
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

// --- the release gate's local copy of CI ------------------------------------
// The release gate re-runs this repository's workflows on the developer's
// machine before a branch is published. The receipt job cannot run there: it
// needs the Codex login held on the GitHub environment and it writes the
// required status. So .github/ci-mirror.exempt.json says, in writing, that the
// local copy skips it. That entry must stay exactly one job wide. An entry that
// named every job (or no job, which means every job) would also stop the
// verdict tests running locally, and nothing else would notice.
const EXEMPTIONS = fileURLToPath(
  new URL('../../../.github/ci-mirror.exempt.json', import.meta.url)
);
const WORKFLOW_FILE = 'nexus-release-receipt.yml';

/** Returns a list of plain-English problems; empty means the entry is sound. */
export function mirrorExemptionProblems(jsonText) {
  let doc;
  try {
    doc = JSON.parse(jsonText);
  } catch {
    return ['the exemption file is not valid JSON'];
  }
  const list = (kind) => (Array.isArray(doc?.[kind]) ? doc[kind] : []);
  const mine = (kind) => list(kind).filter((e) => e?.workflow === WORKFLOW_FILE);
  const problems = [];
  if (mine('unavailable').length !== 0) {
    problems.push(`${WORKFLOW_FILE} has an "unavailable" entry; only the one exemption is reviewed`);
  }
  const entries = mine('exempt');
  if (entries.length !== 1) {
    problems.push(`${WORKFLOW_FILE} has ${entries.length} exemptions, expected exactly 1`);
  }
  for (const e of entries) {
    if (e.job !== RECEIPT_JOB) {
      problems.push(`an exemption covers job "${e.job ?? '*'}", expected only ${RECEIPT_JOB}`);
    }
    if (e.test_gap !== true) {
      problems.push('the exemption does not declare itself as a counted gap (test_gap: true)');
    }
    if (typeof e.reason !== 'string' || e.reason.trim().length < 40) {
      problems.push('the exemption has no real reason');
    }
  }
  return problems;
}

const realExemptions = () => readFileSync(EXEMPTIONS, 'utf8');

test('the local CI copy skips the receipt job only, and says why', () => {
  assert.deepEqual(mirrorExemptionProblems(realExemptions()), []);
});

test('each way of widening the local skip is caught', () => {
  const good = JSON.parse(realExemptions());
  const entry = good.exempt.find((e) => e.workflow === WORKFLOW_FILE);
  assert.ok(entry, 'the real file has the entry this test starts from');
  const others = good.exempt.filter((e) => e !== entry);
  const withEntries = (...es) => JSON.stringify({ ...good, exempt: [...others, ...es] });
  const noJob = Object.fromEntries(Object.entries(entry).filter(([k]) => k !== 'job'));
  const noGap = Object.fromEntries(Object.entries(entry).filter(([k]) => k !== 'test_gap'));
  const cases = {
    'every job': withEntries({ ...entry, job: '*' }),
    'no job named, which means every job': withEntries(noJob),
    'the test job instead': withEntries({ ...entry, job: TEST_JOB }),
    'the test job as well': withEntries(entry, { ...entry, job: TEST_JOB }),
    'gap not declared': withEntries(noGap),
    'no reason': withEntries({ ...entry, reason: ' ' }),
    'entry removed': withEntries(),
    'marked unavailable too': JSON.stringify({
      ...good,
      unavailable: [{ ...entry, host: 'any' }],
    }),
    'not JSON': '{',
  };
  for (const [name, text] of Object.entries(cases)) {
    assert.notDeepEqual(mirrorExemptionProblems(text), [], name);
  }
});
