/**
 * GET /api/mission-control/board — Mission Control board-column read projection.
 *
 * Linear is the source of truth for the board (ADR 2026-09-08, D2). This route
 * owns no cards; it renders a projection of Linear's workflow states as columns.
 *
 * D3 is the load-bearing rule here: a read that failed, was truncated, or could
 * not be fully accounted for must never render as a successful read of a quiet
 * board. Every degraded path returns `stale: true` with a `reason`, and
 * `stale: false` is reserved for a read that genuinely completed.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";
import { LINEAR_GRAPHQL_URL } from "@/lib/margot-linear";

export const dynamic = "force-dynamic";

// Linear caps a page at 250. Asking for that and reporting truncation is
// honest; paginating silently would hide how large the board really is.
const PAGE_SIZE = 250;

// The column a card lands in when its workflow state was not returned. It
// exists so an unaccounted card is visible rather than quietly dropped.
const UNKNOWN_COLUMN_ID = "unknown";

const QUERY = `
  query MissionControlBoard($first: Int!) {
    workflowStates(filter: { type: { nin: ["completed", "canceled"] } }) {
      nodes { id name type position }
    }
    issues(
      first: $first
      filter: { state: { type: { nin: ["completed", "canceled"] } } }
    ) {
      nodes {
        id
        identifier
        title
        priority
        url
        state { id }
        assignee { name }
        team { name }
      }
      pageInfo { hasNextPage }
    }
  }
`;

interface Card {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  url: string;
  assignee: string | null;
  team: string | null;
}

interface Column {
  id: string;
  name: string;
  type: string;
  position: number;
  cards: Card[];
}

function degraded(reason: string, fetchedAt: string, columns: Column[] = []) {
  return Response.json({
    data: { columns },
    fetchedAt,
    stale: true,
    reason,
  });
}

function toCard(n: unknown): Card {
  const node = (n ?? {}) as {
    id?: string;
    identifier?: string;
    title?: string;
    priority?: number;
    url?: string;
    assignee?: { name?: string } | null;
    team?: { name?: string } | null;
  };
  return {
    id: node.id ?? "",
    identifier: node.identifier ?? "",
    title: node.title ?? "",
    priority: node.priority ?? 0,
    url: node.url ?? "",
    assignee: node.assignee?.name ?? null,
    team: node.team?.name ?? null,
  };
}

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
    return degraded("LINEAR_API_KEY not configured", fetchedAt);
  }

  let json: {
    data?: {
      workflowStates?: { nodes?: unknown[] };
      issues?: { nodes?: unknown[]; pageInfo?: { hasNextPage?: boolean } };
    };
    errors?: unknown[];
  };

  try {
    const res = await fetch(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { first: PAGE_SIZE } }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return degraded(`Linear ${res.status}`, fetchedAt);
    }

    json = await res.json();
  } catch {
    // Do not echo the thrown message: it can carry hostnames and internals.
    return degraded("Linear fetch failed", fetchedAt);
  }

  // A GraphQL error arrives as HTTP 200 with an `errors` array. Rendering that
  // as an empty board would be indistinguishable from a finished week.
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    return degraded("Linear GraphQL error", fetchedAt);
  }

  const stateNodes = json.data?.workflowStates?.nodes;
  if (!Array.isArray(stateNodes)) {
    return degraded("Linear response missing workflow states", fetchedAt);
  }

  const issueNodes = json.data?.issues?.nodes;
  if (!Array.isArray(issueNodes)) {
    return degraded("Linear response missing issues", fetchedAt);
  }

  // A real team always has workflow states. Zero of them means the query was
  // not honoured, not that the board has no columns.
  if (stateNodes.length === 0) {
    return degraded("Linear returned no workflow states", fetchedAt);
  }

  const columns: Column[] = stateNodes
    .map((n: unknown) => {
      const node = (n ?? {}) as {
        id?: string;
        name?: string;
        type?: string;
        position?: number;
      };
      return {
        id: node.id ?? "",
        name: node.name ?? "",
        type: node.type ?? "",
        position: node.position ?? 0,
        cards: [] as Card[],
      };
    })
    .sort((a, b) => a.position - b.position);

  const byStateId = new Map(columns.map((c) => [c.id, c]));
  let orphans = 0;

  for (const n of issueNodes) {
    const stateId =
      ((n ?? {}) as { state?: { id?: string } | null }).state?.id ?? "";
    const column = byStateId.get(stateId);
    if (column) {
      column.cards.push(toCard(n));
      continue;
    }
    orphans += 1;
    let unknown = byStateId.get(UNKNOWN_COLUMN_ID);
    if (!unknown) {
      unknown = {
        id: UNKNOWN_COLUMN_ID,
        name: "Unknown column",
        type: "unknown",
        position: Number.MAX_SAFE_INTEGER,
        cards: [],
      };
      byStateId.set(UNKNOWN_COLUMN_ID, unknown);
      columns.push(unknown);
    }
    unknown.cards.push(toCard(n));
  }

  // A truncated page is a partial board. Return what was read, but never let it
  // claim completeness.
  if (json.data?.issues?.pageInfo?.hasNextPage === true) {
    return degraded("Linear board truncated", fetchedAt, columns);
  }

  if (orphans > 0) {
    return degraded(
      "Linear returned cards outside the known columns",
      fetchedAt,
      columns,
    );
  }

  return Response.json({ data: { columns }, fetchedAt, stale: false });
}
