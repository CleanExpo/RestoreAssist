// GET /api/margot/linear/top — RA-1658
// Returns top 5 urgent/high Linear issues (priority 1/2) across the workspace.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";
import { LINEAR_GRAPHQL_URL } from "@/lib/margot-linear";

export const dynamic = "force-dynamic";

const QUERY = `
  query MargotTopIssues($first: Int!, $after: String) {
    issues(
      first: $first
      filter: {
        priority: { in: [1, 2] }
        state: { type: { in: ["unstarted", "started"] } }
      }
      orderBy: priority
    ) {
      nodes {
        id
        identifier
        title
        priority
        state { name }
        assignee { name }
        url
        team { name }
      }
    }
  }
`;

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  // Platform-owned surface: tenant ADMIN is every self-registered owner.
  const operator = verifyPlatformSupportOperator(auth);
  if (operator.response) return operator.response;

  const fetchedAt = new Date().toISOString();
  const apiKey = process.env.LINEAR_API_KEY ?? "";

  if (!apiKey) {
    return Response.json({
      data: { issues: [] },
      fetchedAt,
      stale: true,
      reason: "LINEAR_API_KEY not configured",
    });
  }

  try {
    const res = await fetch(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { first: 5 } }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return Response.json({
        data: { issues: [] },
        fetchedAt,
        stale: true,
        reason: `Linear ${res.status}`,
      });
    }

    const json = (await res.json()) as {
      data?: { issues?: { nodes?: unknown[] } };
      errors?: unknown[];
    };

    // A GraphQL error arrives as HTTP 200 with an `errors` array and no data.
    // Reporting that as an empty board would be indistinguishable from a
    // genuinely quiet backlog, so refuse it explicitly. Do not echo the
    // upstream message — it can carry workspace internals.
    if (Array.isArray(json.errors) && json.errors.length > 0) {
      return Response.json({
        data: { issues: [] },
        fetchedAt,
        stale: true,
        reason: "Linear GraphQL error",
      });
    }

    // `data.issues` absent (rather than present-and-empty) means the query
    // shape was not honoured; that is also not an empty backlog.
    const nodes = json.data?.issues?.nodes;
    if (!Array.isArray(nodes)) {
      return Response.json({
        data: { issues: [] },
        fetchedAt,
        stale: true,
        reason: "Linear response missing issues",
      });
    }

    const issues = nodes.map((n: unknown) => {
      const node = (n ?? {}) as {
        id?: string;
        identifier?: string;
        title?: string;
        priority?: number;
        state?: { name?: string } | null;
        assignee?: { name?: string } | null;
        url?: string;
        team?: { name?: string } | null;
      };
      return {
        id: node.id ?? "",
        identifier: node.identifier ?? "",
        title: node.title ?? "",
        priority: node.priority ?? 0,
        state: node.state?.name ?? null,
        assignee: node.assignee?.name ?? null,
        url: node.url ?? "",
        team: node.team?.name ?? null,
      };
    });

    return Response.json({ data: { issues }, fetchedAt, stale: false });
  } catch {
    return Response.json({
      data: { issues: [] },
      fetchedAt,
      stale: true,
      reason: "Linear fetch failed",
    });
  }
}
