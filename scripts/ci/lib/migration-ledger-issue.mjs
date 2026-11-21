/**
 * Keep exactly one open GitHub issue while production's migration ledger is
 * behind this revision, and close it on the next passing check (RA-8227).
 *
 * THE FAULT THIS EXISTS FOR
 * -------------------------
 * On 6 Nov 2026 two merged migrations sat unapplied on production for hours.
 * The daily RA-7939 parity run (migration-ledger-parity.yml) was the only
 * signal, and a red scheduled run has no owner: nobody is asked to do
 * anything. This turns the red result into one issue that stays open until a
 * check passes. It is an interim alarm; the permanent fix is RA-7942.
 *
 * Read-only towards the database: it reads the outcome of
 * check-migration-ledger-parity.mjs and writes GitHub issues. It never applies,
 * resolves or inspects a migration itself.
 *
 *   LEDGER_TARGET=production PARITY_OUTCOME=failure PARITY_LOG=/tmp/parity.log \
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/ci/migration-ledger-issue.mjs
 *
 * LEDGER_TARGET (RA-8386) is the matrix leg: production or sandbox. Each keeps
 * its own labelled issue; anything else is refused before any GitHub call.
 *
 * PARITY_OUTCOME is the GitHub step outcome of the parity check. Only the exact
 * string "success" counts as a pass; anything else (failure, skipped, empty)
 * is treated as behind, so an unclear result can never close the issue.
 *
 * Exit 0 = the issue state now matches the outcome. Exit 1 = a GitHub call
 * failed or the environment is incomplete; the step goes red.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One alarm per database (RA-8386). Each target has its own label, because a
 * passing check closes every open issue carrying its label: if sandbox and
 * production shared one, a green sandbox would close a live production alarm.
 * The production values are the RA-8227 originals, unchanged.
 */
export const TARGETS = Object.freeze({
  production: Object.freeze({
    label: "migration-ledger-behind",
    labelDescription:
      "Production database is behind main's migrations (RA-8227 alarm)",
    title: "Production database is missing migrations that are on main",
    summary:
      "The production database has not applied every migration in `main`, or the check could not read it.",
    whatToDo:
      "**What to do.** Apply the pending migrations through the separately approved production release step " +
      "(see the headers of `scripts/start-production.sh` and `scripts/verify-production-migrations.sh`). " +
      "This workflow never applies them.",
  }),
  sandbox: Object.freeze({
    label: "migration-ledger-behind-sandbox",
    labelDescription:
      "Sandbox database is behind main's migrations (RA-8386 alarm)",
    title: "Sandbox database is missing migrations that are on main",
    summary:
      "The sandbox database has fewer applied migrations than `main`, has a failed or rolled-back migration, " +
      "or the check could not read it. Being ahead of `main` (branch migrations under test) is only a warning " +
      "and never opens this issue.",
    whatToDo:
      "**What to do.** Bring the sandbox database up to `main` through the separately approved migration step " +
      "for the sandbox. This workflow never applies, resolves or resets migrations.",
  }),
});

export const LABEL = TARGETS.production.label;
const MAX_LINE = 2000;
const PER_PAGE = 100;

/** The alarm settings for a matrix leg name. Unknown or missing is refused. */
export function targetConfig(name) {
  if (typeof name === "string" && Object.hasOwn(TARGETS, name))
    return TARGETS[name];
  throw new Error(
    `LEDGER_TARGET must be one of ${Object.keys(TARGETS).join(", ")}; got ${JSON.stringify(name ?? null)}`,
  );
}

/**
 * Decide what to do from the check outcome and the open labelled issues.
 * Pure: no I/O. Pull requests are ignored. Oldest issue is the one kept.
 */
export function planIssueActions(outcome, openIssues) {
  const issues = openIssues
    .filter((issue) => !issue.pull_request)
    .map((issue) => issue.number)
    .sort((a, b) => a - b);
  if (outcome === "success") {
    return issues.map((number) => ({ type: "close-resolved", number }));
  }
  if (issues.length === 0) return [{ type: "create" }];
  const [keep, ...duplicates] = issues;
  return [
    { type: "comment", number: keep },
    ...duplicates.map((number) => ({ type: "close-duplicate", number, keep })),
  ];
}

/** Make the parity log line safe to place inside one fenced code block. */
function fencedLine(line) {
  const text = String(line ?? "(no output captured)")
    .replace(/`{3,}/g, "'''")
    .trim()
    .slice(0, MAX_LINE);
  return "```text\n" + (text || "(no output captured)") + "\n```";
}

function provenance({ sha, runUrl, event, target }) {
  return `Target: ${target}; Commit: \`${sha}\`; Trigger: \`${event}\`; Run: ${runUrl}`;
}

function issueBody(line, context, target) {
  return [
    "<!-- managed-by: .github/workflows/migration-ledger-parity.yml (RA-8227) -->",
    target.summary,
    "",
    fencedLine(line),
    "",
    provenance(context),
    "",
    target.whatToDo,
    "",
    "Then run the **Migration ledger parity** workflow on `main` (Actions, Run workflow). " +
      "The first passing check closes this issue. Until then each check adds a comment here.",
    "",
    `This issue is opened and closed by the workflow. Only one \`${target.label}\` issue stays open; ` +
      "any duplicate is closed automatically. The permanent fix is RA-7942.",
  ].join("\n");
}

export async function syncLedgerIssue({
  outcome,
  line,
  context,
  client,
  target = TARGETS.production,
}) {
  const open = await client.listOpenLabelled();
  const actions = planIssueActions(outcome, open);
  const done = [];
  for (const action of actions) {
    if (action.type === "create") {
      await client.ensureLabel();
      const number = await client.createIssue({
        title: target.title,
        body: issueBody(line, context, target),
      });
      done.push(`opened #${number}`);
    } else if (action.type === "comment") {
      await client.comment(
        action.number,
        `Still not in parity.\n\n${fencedLine(line)}\n\n${provenance(context)}`,
      );
      done.push(`commented on #${action.number}`);
    } else if (action.type === "close-duplicate") {
      await client.comment(
        action.number,
        `Duplicate of #${action.keep}. Only one \`${target.label}\` issue stays open.`,
      );
      await client.close(action.number, "not_planned");
      done.push(`closed duplicate #${action.number}`);
    } else if (action.type === "close-resolved") {
      await client.comment(
        action.number,
        `Parity check passed. Closing.\n\n${fencedLine(line)}\n\n${provenance(context)}`,
      );
      await client.close(action.number, "completed");
      done.push(`closed #${action.number}`);
    }
  }
  return done;
}

/** Minimal GitHub REST client over fetch. The token is sent, never logged. */
export function createGitHubClient({
  token,
  repository,
  apiUrl = "https://api.github.com",
  fetchImpl = globalThis.fetch,
  label = TARGETS.production.label,
  labelDescription = TARGETS.production.labelDescription,
}) {
  if (!token) throw new Error("GITHUB_TOKEN is required");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? ""))
    throw new Error("GITHUB_REPOSITORY must be owner/repo");
  const base = `${apiUrl.replace(/\/$/, "")}/repos/${repository}`;

  async function call(method, path, body, { allow404 = false } = {}) {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) {
      const route = path.split("?")[0];
      throw new Error(`${method} ${route} failed: HTTP ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }

  return {
    async listOpenLabelled() {
      const found = [];
      for (let page = 1; ; page += 1) {
        const query = new URLSearchParams({
          state: "open",
          labels: label,
          per_page: String(PER_PAGE),
          page: String(page),
        });
        const batch = await call("GET", `/issues?${query}`);
        if (!Array.isArray(batch))
          throw new Error("GET /issues returned a non-array body");
        found.push(...batch);
        if (batch.length < PER_PAGE) return found;
      }
    },
    async ensureLabel() {
      const existing = await call(
        "GET",
        `/labels/${encodeURIComponent(label)}`,
        null,
        { allow404: true },
      );
      if (existing) return;
      await call("POST", "/labels", {
        name: label,
        color: "b60205",
        description: labelDescription,
      });
    },
    async createIssue({ title, body }) {
      const created = await call("POST", "/issues", {
        title,
        body,
        labels: [label],
      });
      return created.number;
    },
    async comment(number, body) {
      await call("POST", `/issues/${number}/comments`, { body });
    },
    async close(number, stateReason) {
      await call("PATCH", `/issues/${number}`, {
        state: "closed",
        state_reason: stateReason,
      });
    },
  };
}

/**
 * Provenance for issue text. `sha` is the commit actually compared
 * (CHECKED_SHA, the checked-out branch tip), which can be newer than
 * GITHUB_SHA, the commit that started the run.
 */
export function contextFromEnv(env) {
  const server = env.GITHUB_SERVER_URL ?? "https://github.com";
  return {
    sha: env.CHECKED_SHA || env.GITHUB_SHA || "unknown",
    runUrl: `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID ?? "unknown"}`,
    event: env.GITHUB_EVENT_NAME ?? "unknown",
    target: env.TARGET_ORIGIN ?? "production",
  };
}

export async function main(env) {
  let line = "";
  if (env.PARITY_LOG) {
    try {
      line = readFileSync(env.PARITY_LOG, "utf8");
    } catch {
      line = "(parity log could not be read)";
    }
  }
  const context = contextFromEnv(env);
  try {
    // Checked before any GitHub call: a missing or mistyped leg name must not
    // fall back to another database's label.
    const target = targetConfig(env.LEDGER_TARGET);
    const client = createGitHubClient({
      token: env.GITHUB_TOKEN,
      repository: env.GITHUB_REPOSITORY,
      apiUrl: env.GITHUB_API_URL,
      label: target.label,
      labelDescription: target.labelDescription,
    });
    const done = await syncLedgerIssue({
      outcome: env.PARITY_OUTCOME,
      line,
      context,
      client,
      target,
    });
    console.log(
      `[migration-ledger-issue] ${env.LEDGER_TARGET} outcome ${JSON.stringify(env.PARITY_OUTCOME ?? null)}: ` +
        (done.length ? done.join(", ") : "no open issue, nothing to do"),
    );
    return 0;
  } catch (error) {
    console.error(`[migration-ledger-issue] FAIL: ${error.message}`);
    return 1;
  }
}


