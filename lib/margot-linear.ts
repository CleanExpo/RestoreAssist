/**
 * Margot Dashboard v2 Inc 2 — Linear tool helpers.
 *
 * Thin GraphQL wrappers around https://api.linear.app/graphql used by the
 * `linear_list_issues`, `linear_create_issue`, and `linear_comment_on_issue`
 * tools in app/api/margot/chat/route.ts. All functions either return a
 * typed success payload or a `{ error, retryable }` shape — they never
 * throw. Destructive writes (create, comment) are gated behind a
 * confirmation handshake surfaced to the UI.
 */

import { reportError } from "@/lib/observability";

export const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

/** Fallback RestoreAssist team ID (matches `LINEAR_RA_TEAM_ID` in scout-agent). */
export const DEFAULT_RA_TEAM_ID = "a8a52f07-63cf-4ece-9ad2-3e3bd3c15673";

export interface LinearToolError {
  error: string;
  retryable: boolean;
}

function classifyRetryable(msg: string): boolean {
  return /rate|quota|timeout|network|ECONN|5\d\d|unavailable/i.test(msg);
}

async function linearFetch<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data: T } | LinearToolError> {
  try {
    const res = await fetch(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      return {
        error: `Linear API ${res.status}`,
        retryable: res.status >= 500 || res.status === 429,
      };
    }

    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

    if (json.errors && json.errors.length) {
      const msg = json.errors.map((e) => e.message).join("; ");
      return { error: `Linear GraphQL: ${msg}`, retryable: false };
    }

    if (!json.data) {
      return { error: "Linear GraphQL: empty response", retryable: true };
    }

    return { data: json.data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    reportError(err, { feature: "margot-linear" });
    return { error: `Linear fetch failed: ${msg}`, retryable: classifyRetryable(msg) };
  }
}

// ---------------------------------------------------------------------------
// list_issues
// ---------------------------------------------------------------------------

export interface LinearIssueListItem {
  id: string;
  identifier: string;
  title: string;
  state: string;
  priority: number;
  assignee: string | null;
  url: string;
}

export interface LinearListIssuesResult {
  issues: LinearIssueListItem[];
  count: number;
}

interface LinearIssuesGql {
  issues: {
    nodes: Array<{
      id: string;
      identifier: string;
      title: string;
      priority: number;
      url: string;
      state: { name: string } | null;
      assignee: { name: string } | null;
      team: { id: string; key: string; name: string } | null;
      project: { id: string; name: string } | null;
    }>;
  };
}

export async function linearListIssues(
  apiKey: string,
  params: { state?: string; project?: string; team?: string; limit?: number },
): Promise<LinearListIssuesResult | LinearToolError> {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 20);

  const filters: string[] = [];
  if (params.state) filters.push(`{ state: { name: { eqIgnoreCase: "${params.state.replace(/"/g, '\\"')}" } } }`);
  if (params.team) filters.push(`{ team: { name: { eqIgnoreCase: "${params.team.replace(/"/g, '\\"')}" } } }`);
  if (params.project) filters.push(`{ project: { name: { eqIgnoreCase: "${params.project.replace(/"/g, '\\"')}" } } }`);
  const filterClause = filters.length
    ? `filter: { and: [${filters.join(", ")}] }`
    : "";

  const query = `query MargotIssues($first: Int!) {
    issues(first: $first${filterClause ? `, ${filterClause}` : ""}) {
      nodes {
        id
        identifier
        title
        priority
        url
        state { name }
        assignee { name }
        team { id key name }
        project { id name }
      }
    }
  }`;

  const res = await linearFetch<LinearIssuesGql>(apiKey, query, { first: limit });
  if ("error" in res) return res;

  const issues = res.data.issues.nodes.map((n) => ({
    id: n.id,
    identifier: n.identifier,
    title: n.title,
    state: n.state?.name ?? "Unknown",
    priority: n.priority,
    assignee: n.assignee?.name ?? null,
    url: n.url,
  }));

  return { issues, count: issues.length };
}

// ---------------------------------------------------------------------------
// create_issue
// ---------------------------------------------------------------------------

export interface LinearCreateIssueResult {
  id: string;
  identifier: string;
  url: string;
}

interface LinearTeamLookupGql {
  teams: {
    nodes: Array<{ id: string; name: string; key: string }>;
  };
}

async function resolveTeamId(
  apiKey: string,
  teamNameOrId: string | undefined,
): Promise<string | LinearToolError> {
  if (!teamNameOrId) return DEFAULT_RA_TEAM_ID;
  // UUID shape → assume already an ID.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamNameOrId)) {
    return teamNameOrId;
  }

  const query = `query MargotTeamLookup($name: String!) {
    teams(filter: { or: [{ name: { eqIgnoreCase: $name } }, { key: { eqIgnoreCase: $name } }] }) {
      nodes { id name key }
    }
  }`;
  const res = await linearFetch<LinearTeamLookupGql>(apiKey, query, { name: teamNameOrId });
  if ("error" in res) return res;
  const hit = res.data.teams.nodes[0];
  if (!hit) {
    return { error: `Linear team "${teamNameOrId}" not found`, retryable: false };
  }
  return hit.id;
}

interface LinearProjectLookupGql {
  projects: { nodes: Array<{ id: string; name: string }> };
}

async function resolveProjectId(
  apiKey: string,
  projectNameOrId: string | undefined,
): Promise<string | null | LinearToolError> {
  if (!projectNameOrId) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectNameOrId)) {
    return projectNameOrId;
  }
  const query = `query MargotProjectLookup($name: String!) {
    projects(filter: { name: { eqIgnoreCase: $name } }) { nodes { id name } }
  }`;
  const res = await linearFetch<LinearProjectLookupGql>(apiKey, query, { name: projectNameOrId });
  if ("error" in res) return res;
  const hit = res.data.projects.nodes[0];
  if (!hit) {
    return { error: `Linear project "${projectNameOrId}" not found`, retryable: false };
  }
  return hit.id;
}

interface LinearIssueCreateGql {
  issueCreate: {
    success: boolean;
    issue: { id: string; identifier: string; url: string } | null;
  };
}

export async function linearCreateIssue(
  apiKey: string,
  params: {
    title: string;
    description?: string;
    team?: string;
    project?: string;
    priority?: number;
  },
): Promise<LinearCreateIssueResult | LinearToolError> {
  const teamId = await resolveTeamId(apiKey, params.team);
  if (typeof teamId !== "string") return teamId;

  const projectId = await resolveProjectId(apiKey, params.project);
  if (projectId && typeof projectId !== "string") return projectId;

  const input: Record<string, unknown> = {
    teamId,
    title: params.title,
  };
  if (params.description) input.description = params.description;
  if (projectId) input.projectId = projectId;
  if (typeof params.priority === "number") input.priority = params.priority;

  const query = `mutation MargotIssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier url }
    }
  }`;

  const res = await linearFetch<LinearIssueCreateGql>(apiKey, query, { input });
  if ("error" in res) return res;

  if (!res.data.issueCreate.success || !res.data.issueCreate.issue) {
    return { error: "Linear issueCreate returned success=false", retryable: true };
  }

  return res.data.issueCreate.issue;
}

// ---------------------------------------------------------------------------
// comment_on_issue
// ---------------------------------------------------------------------------

export interface LinearCommentResult {
  id: string;
  url: string;
}

interface LinearCommentCreateGql {
  commentCreate: {
    success: boolean;
    comment: { id: string; url: string } | null;
  };
}

export async function linearCommentOnIssue(
  apiKey: string,
  params: { issueId: string; body: string },
): Promise<LinearCommentResult | LinearToolError> {
  const query = `mutation MargotCommentCreate($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment { id url }
    }
  }`;

  const res = await linearFetch<LinearCommentCreateGql>(apiKey, query, {
    input: { issueId: params.issueId, body: params.body },
  });
  if ("error" in res) return res;

  if (!res.data.commentCreate.success || !res.data.commentCreate.comment) {
    return { error: "Linear commentCreate returned success=false", retryable: true };
  }

  return res.data.commentCreate.comment;
}
