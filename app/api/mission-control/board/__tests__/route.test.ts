import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
}));

import { GET } from "../route";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function board(
  states: unknown[],
  issues: unknown[],
  hasNextPage = false,
): unknown {
  return {
    data: {
      workflowStates: { nodes: states },
      issues: { nodes: issues, pageInfo: { hasNextPage } },
    },
  };
}

const TODO = { id: "st_todo", name: "Todo", type: "unstarted", position: 1 };
const DOING = {
  id: "st_doing",
  name: "In Progress",
  type: "started",
  position: 2,
};

function issue(id: string, stateId: string, extra: object = {}) {
  return {
    id,
    identifier: id.toUpperCase(),
    title: `Issue ${id}`,
    priority: 2,
    url: `https://linear.app/i/${id}`,
    state: { id: stateId },
    assignee: null,
    team: { name: "RA" },
    ...extra,
  };
}

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "admin_user" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin_user", role: "ADMIN" },
  });
  process.env.LINEAR_API_KEY = "lin_api_test";
  vi.stubGlobal("fetch", vi.fn());
});

describe("GET /api/mission-control/board — admin gate", () => {
  it("returns the auth response without reading Linear when not admin", async () => {
    verifyAdminFromDb.mockResolvedValue({
      response: Response.json({ error: "forbidden" }, { status: 403 }),
    });

    const res = await GET();

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/mission-control/board — a failed read is never an empty board", () => {
  it("reports an unconfigured key as stale", async () => {
    process.env.LINEAR_API_KEY = "";

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("LINEAR_API_KEY not configured");
    expect(body.data.columns).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports an HTTP failure as stale, naming the status", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 503));

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("Linear 503");
    expect(body.data.columns).toEqual([]);
  });

  it("reports a GraphQL error as stale without leaking the upstream message", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        errors: [{ message: "Entity not found: Team - secret-team-id" }],
      }),
    );

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("Linear GraphQL error");
    expect(body.data.columns).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("secret-team-id");
  });

  it("reports a response missing workflowStates as stale", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ data: { issues: { nodes: [], pageInfo: {} } } }),
    );

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("Linear response missing workflow states");
    expect(body.data.columns).toEqual([]);
  });

  it("reports a response missing issues as stale", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ data: { workflowStates: { nodes: [TODO] } } }),
    );

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("Linear response missing issues");
    expect(body.data.columns).toEqual([]);
  });

  it("reports zero workflow states as stale, not as a board with no columns", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(board([], [])));

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("Linear returned no workflow states");
    expect(body.data.columns).toEqual([]);
  });

  it("reports a thrown fetch as stale", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNRESET"));

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("Linear fetch failed");
    expect(body.data.columns).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("ECONNRESET");
  });

  it("reports a truncated page as stale while still returning the partial board", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(board([TODO], [issue("ra_1", "st_todo")], true)),
    );

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("Linear board truncated");
    // The partial board is still useful; it just must not claim completeness.
    expect(body.data.columns).toHaveLength(1);
    expect(body.data.columns[0].cards).toHaveLength(1);
  });

  it("reports a card whose column is unknown as stale rather than dropping it", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        board([TODO], [issue("ra_1", "st_todo"), issue("ra_2", "st_ghost")]),
      ),
    );

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("Linear returned cards outside the known columns");
    // Silently dropping the orphan would under-report the board.
    const cards = body.data.columns.flatMap(
      (c: { cards: unknown[] }) => c.cards,
    );
    expect(cards).toHaveLength(2);
  });
});

describe("GET /api/mission-control/board — a complete read reports fresh", () => {
  it("reports a genuinely empty board as fresh, with its columns intact", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(board([DOING, TODO], [])));

    const body = await (await GET()).json();

    expect(body.stale).toBe(false);
    expect(body.reason).toBeUndefined();
    expect(body.data.columns.map((c: { name: string }) => c.name)).toEqual([
      "Todo",
      "In Progress",
    ]);
    expect(body.data.columns.every((c: { cards: unknown[] }) => c.cards.length === 0)).toBe(true);
  });

  it("groups cards into their columns, ordered by workflow position", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        board(
          [DOING, TODO],
          [
            issue("ra_1", "st_todo"),
            issue("ra_2", "st_doing"),
            issue("ra_3", "st_todo"),
          ],
        ),
      ),
    );

    const body = await (await GET()).json();

    expect(body.stale).toBe(false);
    expect(body.data.columns).toHaveLength(2);
    expect(body.data.columns[0]).toMatchObject({ id: "st_todo", name: "Todo" });
    expect(
      body.data.columns[0].cards.map((c: { identifier: string }) => c.identifier),
    ).toEqual(["RA_1", "RA_3"]);
    expect(body.data.columns[1].cards).toHaveLength(1);
    expect(body.data.columns[1].cards[0]).toMatchObject({
      identifier: "RA_2",
      title: "Issue ra_2",
      priority: 2,
      team: "RA",
      assignee: null,
    });
    expect(typeof body.fetchedAt).toBe("string");
  });
});
