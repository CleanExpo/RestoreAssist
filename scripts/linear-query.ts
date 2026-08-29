/**
 * Read-only Linear issue query — an API-key fallback for when the Linear MCP
 * connector is unavailable.
 *
 * The `linear-task-processor` and `continuous-linear-loop` agents normally
 * reach Linear through the `linear` MCP connector declared in their
 * frontmatter. When that connector is disconnected, this script restores the
 * *read* half of that access using LINEAR_API_KEY. It deliberately performs no
 * writes: the loop's "comment on the issue" and "move to In Progress" steps
 * still require the connector.
 *
 * Usage:
 *   npm run script:linear-query
 *   npx tsx scripts/linear-query.ts --state Todo,Backlog --limit 10
 *   npx tsx scripts/linear-query.ts --all-teams
 *   npx tsx scripts/linear-query.ts --json
 *
 * `--json` emits an array of LinearIssueInput — the shape
 * scripts/linear-loop-decide.ts expects — so the two compose:
 *
 *   npx tsx scripts/linear-query.ts --json > issues.json
 *   npx tsx scripts/linear-loop-decide.ts --issue-json "$(jq -c '.[0]' issues.json)"
 *
 * Ported from scripts/linear-query.ps1, which needs PowerShell.
 */

import type { LinearIssueInput } from "../lib/agents/routing/types";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

/** Linear's numeric priority scale. 0 means "no priority", not "most urgent". */
const PRIORITY_LABELS: Record<number, string> = {
  0: "None",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IssueNode {
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  state: { name: string } | null;
  team: { key: string } | null;
  project: { name: string } | null;
  labels: { nodes: Array<{ name: string }> };
}

/**
 * Collapses blank values to undefined so `??` chains fall through to their
 * default. `.env.example` ships LINEAR_RA_TEAM_ID="", and `??` alone would
 * accept that empty string as the team — filtering on a team key of "" matches
 * no issues and reports "No matching issues." rather than failing.
 */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Reads `--name <value>`. A missing value, or another flag, counts as unset. */
function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  return value?.startsWith("--") ? undefined : nonEmpty(value);
}

/** True when the bare `--name` switch is present, regardless of any value. */
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * Builds the GraphQL issue filter.
 *
 * Defaults mirror the agents' own scope: the RA team, excluding issues that
 * are finished or abandoned. `--state` narrows to explicit state names
 * instead, which is how you reproduce the loop's Todo/Backlog selection.
 */
function buildFilter(): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  const states = flag("state")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (states?.length) {
    filter.state = { name: { in: states } };
  } else {
    // Terminal state types, spelled as Linear spells them. The full set is
    // documented on WorkflowStateFilter.type in @linear/sdk: triage, backlog,
    // unstarted, started, completed, canceled, duplicate. "duplicate" is a
    // real status on the RA team and is not actionable work, so it is excluded
    // alongside the other two; "triage" is deliberately kept, being unresolved.
    filter.state = { type: { nin: ["completed", "canceled", "duplicate"] } };
  }

  if (!hasFlag("all-teams")) {
    const team =
      flag("team") ?? nonEmpty(process.env.LINEAR_RA_TEAM_ID) ?? "RA";
    filter.team = UUID_PATTERN.test(team)
      ? { id: { eq: team } }
      : { key: { eq: team } };
  }

  return filter;
}

/**
 * Strips control characters from issue-authored text before it reaches a
 * terminal. Titles and label names are free text written by any workspace
 * member, and an embedded ANSI sequence (e.g. erase-line + cursor-home) can
 * repaint the row so a listing misreports which issue is urgent. JSON output
 * needs no equivalent: JSON.stringify already escapes these as \uXXXX.
 */
export function sanitise(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
}

/**
 * Orders by urgency the way the agents describe it: 1 (Urgent) first, with
 * priority 0 sorted last because it means "unset" rather than "most urgent".
 * Done client-side — Linear's `orderBy` only accepts createdAt/updatedAt.
 */
export function byPriority(a: IssueNode, b: IssueNode): number {
  const rank = (p: number) => (p === 0 ? Number.POSITIVE_INFINITY : p);
  return rank(a.priority) - rank(b.priority);
}

/**
 * Runs the issue query. Throws on a non-2xx response and on GraphQL errors,
 * which Linear returns inside a 200 body rather than as an HTTP status.
 */
async function fetchIssues(
  apiKey: string,
  first: number,
): Promise<IssueNode[]> {
  const res = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `query Issues($first: Int!, $filter: IssueFilter) {
        issues(first: $first, filter: $filter, orderBy: updatedAt) {
          nodes {
            identifier
            title
            description
            priority
            state { name }
            team { key }
            project { name }
            labels { nodes { name } }
          }
        }
      }`,
      variables: { first, filter: buildFilter() },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Linear API returned ${res.status} ${res.statusText}: ${body.slice(0, 400)}`,
    );
  }

  // Linear reports query errors in a 200 response, so status alone is not enough.
  const json = (await res.json()) as {
    data?: { issues?: { nodes: IssueNode[] } };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(
      `Linear GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }

  return json.data?.issues?.nodes ?? [];
}

/** Maps to the exact shape scripts/linear-loop-decide.ts consumes. */
export function toIssueInput(node: IssueNode): LinearIssueInput {
  return {
    identifier: node.identifier,
    title: node.title,
    description: node.description ?? "",
    labels: node.labels.nodes.map((l) => l.name),
    team: node.team?.key ?? "",
    ...(node.project ? { project: node.project.name } : {}),
  };
}

/** Renders one issue as a single human-readable line, control-characters removed. */
export function formatLine(node: IssueNode): string {
  const priority = PRIORITY_LABELS[node.priority] ?? "None";
  const labels = node.labels.nodes.map((l) => sanitise(l.name)).join(", ");
  const state = sanitise(node.state?.name ?? "Unknown");
  return (
    `${sanitise(node.identifier)}: [${priority}] ${sanitise(node.title)} - ${state}` +
    (labels ? ` [${labels}]` : "")
  );
}

/** Entry point: validates credentials and arguments, then prints the listing. */
async function main(): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      "LINEAR_API_KEY is not set. This script needs its own key: create one " +
        "at https://linear.app/settings/api under Personal API keys, then " +
        "export it. The Linear MCP connector does not supply this variable " +
        "— it authenticates Claude's tools, not this process.\n",
    );
    process.exit(1);
  }

  const limit = Number(flag("limit") ?? 30);
  if (!Number.isInteger(limit) || limit < 1 || limit > 250) {
    throw new Error("--limit must be an integer between 1 and 250");
  }

  const issues = (await fetchIssues(apiKey, limit)).sort(byPriority);

  if (hasFlag("json")) {
    process.stdout.write(
      JSON.stringify(issues.map(toIssueInput), null, 2) + "\n",
    );
    return;
  }

  if (issues.length === 0) {
    process.stdout.write("No matching issues.\n");
    return;
  }

  process.stdout.write(issues.map(formatLine).join("\n") + "\n");
}

// CLI entry point — ESM-compatible main check, matching
// scripts/backfill-setup-wizard.ts. Without it, importing this module from a
// test would run the query and exit the process.
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] != null &&
  new URL(import.meta.url).pathname === process.argv[1];

if (isMain) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Error querying Linear: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
