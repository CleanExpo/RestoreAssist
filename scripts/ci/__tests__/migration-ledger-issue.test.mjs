import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LABEL,
  createGitHubClient,
  planIssueActions,
  syncLedgerIssue,
} from "../migration-ledger-issue.mjs";

const WORKFLOW = fileURLToPath(
  new URL(
    "../../../.github/workflows/migration-ledger-parity.yml",
    import.meta.url,
  ),
);

const CONTEXT = {
  sha: "abc1234def5678",
  runUrl: "https://github.com/CleanExpo/RestoreAssist/actions/runs/1",
  event: "push",
  target: "https://restoreassist.app",
};

/**
 * In-memory stand-in for the parts of the GitHub REST API the alarm uses.
 * It records every request so a test can prove which endpoints were called.
 */
function fakeGitHub({ issues = [], labels = [LABEL], failOn = null } = {}) {
  const state = {
    issues: issues.map((issue) => ({
      comments: [],
      state: "open",
      labels: [LABEL],
      ...issue,
    })),
    labels: [...labels],
    requests: [],
    nextNumber: 100,
  };
  const reply = (status, body) => ({
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  });
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? "GET";
    const parsed = new URL(url);
    const path = parsed.pathname.replace(
      /^\/repos\/CleanExpo\/RestoreAssist/,
      "",
    );
    const body = init.body ? JSON.parse(init.body) : null;
    state.requests.push({
      method,
      path,
      query: parsed.searchParams,
      body,
      headers: init.headers,
    });
    if (failOn && failOn(method, path)) return reply(500, { message: "boom" });

    if (method === "GET" && path === `/labels/${encodeURIComponent(LABEL)}`) {
      return state.labels.includes(LABEL)
        ? reply(200, { name: LABEL })
        : reply(404, { message: "Not Found" });
    }
    if (method === "POST" && path === "/labels") {
      state.labels.push(body.name);
      return reply(201, { name: body.name });
    }
    if (method === "GET" && path === "/issues") {
      const wanted = parsed.searchParams.get("labels");
      const page = Number(parsed.searchParams.get("page") ?? "1");
      const perPage = Number(parsed.searchParams.get("per_page") ?? "30");
      const open = state.issues
        .filter(
          (issue) => issue.state === "open" && issue.labels.includes(wanted),
        )
        .sort((a, b) => a.number - b.number)
        .map(({ number, pull_request }) => ({
          number,
          ...(pull_request ? { pull_request } : {}),
        }));
      return reply(200, open.slice((page - 1) * perPage, page * perPage));
    }
    if (method === "POST" && path === "/issues") {
      const number = state.nextNumber++;
      state.issues.push({
        number,
        title: body.title,
        body: body.body,
        labels: body.labels,
        state: "open",
        comments: [],
      });
      return reply(201, { number, html_url: `https://github.com/x/${number}` });
    }
    const comment = path.match(/^\/issues\/(\d+)\/comments$/);
    if (method === "POST" && comment) {
      state.issues
        .find((issue) => issue.number === Number(comment[1]))
        .comments.push(body.body);
      return reply(201, {});
    }
    const patch = path.match(/^\/issues\/(\d+)$/);
    if (method === "PATCH" && patch) {
      Object.assign(
        state.issues.find((issue) => issue.number === Number(patch[1])),
        {
          state: body.state,
          state_reason: body.state_reason,
        },
      );
      return reply(200, {});
    }
    return reply(404, { message: `unhandled ${method} ${path}` });
  };
  const client = createGitHubClient({
    token: "test-token-not-real",
    repository: "CleanExpo/RestoreAssist",
    apiUrl: "https://api.github.com",
    fetchImpl,
  });
  return { state, client };
}

const openIssues = (state) =>
  state.issues.filter((issue) => issue.state === "open" && !issue.pull_request);

// ---------------------------------------------------------------- planner

test("planner: behind with no open issue creates exactly one", () => {
  assert.deepEqual(planIssueActions("failure", []), [{ type: "create" }]);
});

test("planner: behind with one open issue comments on it and creates nothing", () => {
  assert.deepEqual(planIssueActions("failure", [{ number: 7 }]), [
    { type: "comment", number: 7 },
  ]);
});

test("planner: behind with duplicates keeps the oldest and closes the rest", () => {
  assert.deepEqual(
    planIssueActions("failure", [{ number: 9 }, { number: 4 }, { number: 6 }]),
    [
      { type: "comment", number: 4 },
      { type: "close-duplicate", number: 6, keep: 4 },
      { type: "close-duplicate", number: 9, keep: 4 },
    ],
  );
});

test("planner: a pass closes every open issue", () => {
  assert.deepEqual(
    planIssueActions("success", [{ number: 3 }, { number: 8 }]),
    [
      { type: "close-resolved", number: 3 },
      { type: "close-resolved", number: 8 },
    ],
  );
  assert.deepEqual(planIssueActions("success", []), []);
});

test("planner: any outcome other than success is treated as behind and never closes", () => {
  for (const outcome of [
    "failure",
    "skipped",
    "cancelled",
    "",
    undefined,
    "SUCCESS",
    " success",
  ]) {
    const actions = planIssueActions(outcome, [{ number: 5 }]);
    assert.deepEqual(
      actions,
      [{ type: "comment", number: 5 }],
      `outcome ${JSON.stringify(outcome)}`,
    );
  }
});

test("planner: pull requests carrying the label are ignored", () => {
  assert.deepEqual(
    planIssueActions("failure", [{ number: 2, pull_request: {} }]),
    [{ type: "create" }],
  );
  assert.deepEqual(
    planIssueActions("success", [{ number: 2, pull_request: {} }]),
    [],
  );
});

// ---------------------------------------------------------- end to end

test("lifecycle: behind, behind, pass leaves one issue opened then closed", async () => {
  const { state, client } = fakeGitHub();
  const line =
    "[migration-ledger-parity] FAIL (drift) https://restoreassist.app: applied 270 migrations, repo has 272";

  await syncLedgerIssue({ outcome: "failure", line, context: CONTEXT, client });
  assert.equal(openIssues(state).length, 1);
  const [issue] = openIssues(state);
  assert.deepEqual(issue.labels, [LABEL]);
  assert.match(issue.body, /applied 270 migrations, repo has 272/);
  assert.match(issue.body, /abc1234def5678/);
  assert.match(issue.body, /actions\/runs\/1/);

  await syncLedgerIssue({
    outcome: "failure",
    line,
    context: { ...CONTEXT, event: "schedule" },
    client,
  });
  assert.equal(
    openIssues(state).length,
    1,
    "a second failing run must not open a second issue",
  );
  assert.equal(issue.comments.length, 1);

  await syncLedgerIssue({
    outcome: "success",
    line: "[migration-ledger-parity] PASS https://restoreassist.app: ledger matches the repo",
    context: CONTEXT,
    client,
  });
  assert.equal(openIssues(state).length, 0);
  assert.equal(issue.state, "closed");
  assert.equal(issue.state_reason, "completed");
  assert.match(issue.comments.at(-1), /ledger matches the repo/);
});

test("lifecycle: uncheckable opens the issue too", async () => {
  const { state, client } = fakeGitHub();
  await syncLedgerIssue({
    outcome: "failure",
    line: "[migration-ledger-parity] FAIL (could not check) https://restoreassist.app: request failed: TimeoutError",
    context: CONTEXT,
    client,
  });
  assert.equal(openIssues(state).length, 1);
  assert.match(openIssues(state)[0].body, /could not check/);
});

test("lifecycle: pre-existing duplicates collapse to one, oldest kept", async () => {
  const { state, client } = fakeGitHub({
    issues: [{ number: 12 }, { number: 10 }, { number: 11 }],
  });
  await syncLedgerIssue({
    outcome: "failure",
    line: "x",
    context: CONTEXT,
    client,
  });
  assert.deepEqual(
    openIssues(state).map((issue) => issue.number),
    [10],
  );
  const closed = state.issues.filter((issue) => issue.state === "closed");
  assert.deepEqual(
    closed.map((issue) => issue.state_reason),
    ["not_planned", "not_planned"],
  );
  assert.match(closed[0].comments[0], /#10/);
});

test("lifecycle: missing label is created before the issue", async () => {
  const { state, client } = fakeGitHub({ labels: [] });
  await syncLedgerIssue({
    outcome: "failure",
    line: "x",
    context: CONTEXT,
    client,
  });
  assert.ok(state.labels.includes(LABEL));
  const labelPost = state.requests.findIndex(
    (r) => r.method === "POST" && r.path === "/labels",
  );
  const issuePost = state.requests.findIndex(
    (r) => r.method === "POST" && r.path === "/issues",
  );
  assert.ok(labelPost >= 0 && labelPost < issuePost);
});

test("lifecycle: issues are listed by label through the issues API, never search", async () => {
  const { state, client } = fakeGitHub({ issues: [{ number: 3 }] });
  await syncLedgerIssue({
    outcome: "failure",
    line: "x",
    context: CONTEXT,
    client,
  });
  const lists = state.requests.filter(
    (r) => r.method === "GET" && r.path === "/issues",
  );
  assert.equal(lists.length, 1);
  assert.equal(lists[0].query.get("state"), "open");
  assert.equal(lists[0].query.get("labels"), LABEL);
  assert.ok(state.requests.every((r) => !r.path.includes("search")));
  assert.equal(lists[0].headers.authorization, "Bearer test-token-not-real");
});

test("lifecycle: listing pages through more than one page", async () => {
  const many = Array.from({ length: 105 }, (_, i) => ({ number: i + 1 }));
  const { state, client } = fakeGitHub({ issues: many });
  await syncLedgerIssue({
    outcome: "failure",
    line: "x",
    context: CONTEXT,
    client,
  });
  assert.deepEqual(
    openIssues(state).map((issue) => issue.number),
    [1],
  );
});

test("lifecycle: an API failure throws instead of reporting success", async () => {
  const { client } = fakeGitHub({
    failOn: (method, path) => method === "POST" && path === "/issues",
  });
  await assert.rejects(
    syncLedgerIssue({
      outcome: "failure",
      line: "x",
      context: CONTEXT,
      client,
    }),
    /POST \/issues failed: HTTP 500/,
  );
});

test("lifecycle: the log line cannot break out of its code block", async () => {
  const { state, client } = fakeGitHub();
  await syncLedgerIssue({
    outcome: "failure",
    line: "a ``` b\n".repeat(400),
    context: CONTEXT,
    client,
  });
  const body = openIssues(state)[0].body;
  const fence = body.match(/```text\n([\s\S]*?)\n```/);
  assert.ok(fence, "the log line sits in one fenced block");
  assert.ok(!fence[1].includes("```"));
  assert.ok(fence[1].length <= 2000);
});

// ------------------------------------------------------------- workflow

const workflow = readFileSync(WORKFLOW, "utf8");
const code = workflow
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");

function topLevelBlock(key) {
  const match = code.match(
    new RegExp(`^${key}:\\n((?:[ \\t]+.*\\n|\\n)*)`, "m"),
  );
  assert.ok(match, `top-level ${key}: block exists`);
  return match[1];
}

function stepBlock(name) {
  const lines = code.split("\n");
  const start = lines.findIndex(
    (line) => line.match(/^\s*- name:\s*(.*)$/)?.[1] === name,
  );
  assert.ok(start >= 0, `step "${name}" exists`);
  const indent = lines[start].indexOf("-");
  const end = lines.findIndex(
    (line, i) => i > start && line.trim() !== "" && line.search(/\S/) <= indent,
  );
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

test("workflow: runs on every push to main that touches prisma/migrations", () => {
  const on = topLevelBlock("on");
  assert.match(
    on,
    /^ {2}push:\n {4}branches:\s*\[\s*main\s*\]\n {4}paths:\n {6}- "prisma\/migrations\/\*\*"\n/m,
  );
  assert.match(on, /^ {2}schedule:/m);
  assert.match(on, /^ {2}workflow_dispatch:/m);
});

test("workflow: the issue step runs only for production on main, even after a failed check", () => {
  const step = stepBlock("Keep one issue open while production is behind");
  const condition = step.match(/^\s*if:\s*(.*)$/m)?.[1] ?? "";
  assert.match(condition, /!cancelled\(\)/);
  assert.match(condition, /matrix\.target\.name == 'production'/);
  assert.match(condition, /github\.ref == 'refs\/heads\/main'/);
  assert.match(
    step,
    /PARITY_OUTCOME:\s*\$\{\{\s*steps\.parity\.outcome\s*\}\}/,
  );
  assert.match(step, /node scripts\/ci\/migration-ledger-issue\.mjs/);
});

test("workflow: a failed check still fails the job", () => {
  const parity = stepBlock("Compare the deployed ledger with this revision");
  assert.match(parity, /^\s*id:\s*parity$/m);
  assert.match(parity, /^\s*continue-on-error:\s*true$/m);
  assert.match(parity, /exit "\$status"/);
  const fail = stepBlock("Fail the job when the ledger is not in parity");
  assert.match(fail, /steps\.parity\.outcome != 'success'/);
  assert.match(fail, /exit 1/);
  assert.ok(
    code.indexOf("Fail the job when the ledger") >
      code.indexOf("Keep one issue open"),
  );
});

test("workflow: issues:write is granted to the job only, top level stays read-only", () => {
  assert.equal(topLevelBlock("permissions").trim(), "contents: read");
  assert.match(
    code,
    /^ {4}permissions:\n {6}contents: read\n {6}issues: write\n/m,
  );
});

test("workflow: issue writers are serialised, never cancelled mid-write", () => {
  // A cancelled run's already-sent issue writes still land, so overlapping runs
  // can leave two open issues or close one after a newer failure. The design
  // answer is one writer at a time: a single group shared by every main run,
  // and no cancellation of the run in progress.
  const concurrency = topLevelBlock("concurrency");
  assert.match(
    concurrency,
    /^ {2}group: migration-ledger-parity-\$\{\{ github\.ref \}\}$/m,
  );
  assert.match(concurrency, /^ {2}cancel-in-progress: false$/m);
  assert.doesNotMatch(code, /cancel-in-progress:\s*true/);
  assert.doesNotMatch(
    code.slice(code.indexOf("\njobs:")),
    /^\s+concurrency:/m,
    "keep one workflow-level group so every writer shares it",
  );
});

test("workflow: never applies, resolves or pushes migrations", () => {
  for (const banned of [
    /migrate\s+deploy/,
    /migrate\s+resolve/,
    /migrate\s+dev/,
    /db\s+push/,
    /migrate\s+reset/,
  ]) {
    assert.doesNotMatch(code, banned);
  }
  assert.doesNotMatch(
    code,
    /secrets\./,
    "the alarm needs no secret beyond the job token",
  );
});
