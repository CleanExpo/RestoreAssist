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

describe("GET /api/margot/linear/top — a failed read is never a quiet backlog", () => {
  it("reports a GraphQL error as stale, not as zero issues", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        errors: [{ message: "Entity not found: Team - secret-team-id" }],
      }),
    );

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("Linear GraphQL error");
    expect(body.data.issues).toEqual([]);
    // The upstream message can name workspace internals; it must not escape.
    expect(JSON.stringify(body)).not.toContain("secret-team-id");
  });

  it("reports a response missing the issues field as stale", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: {} }));

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("Linear response missing issues");
    expect(body.data.issues).toEqual([]);
  });

  it("reports a genuinely empty backlog as fresh, with no reason", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ data: { issues: { nodes: [] } } }),
    );

    const body = await (await GET()).json();

    expect(body.stale).toBe(false);
    expect(body.reason).toBeUndefined();
    expect(body.data.issues).toEqual([]);
  });

  it("returns issues when the read succeeds", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          issues: {
            nodes: [
              {
                id: "i1",
                identifier: "RA-1",
                title: "Fix the board",
                priority: 1,
                state: { name: "Todo" },
                assignee: { name: "Phill" },
                url: "https://linear.app/x/RA-1",
                team: { name: "RestoreAssist" },
              },
            ],
          },
        },
      }),
    );

    const body = await (await GET()).json();

    expect(body.stale).toBe(false);
    expect(body.data.issues).toHaveLength(1);
    expect(body.data.issues[0]).toMatchObject({
      identifier: "RA-1",
      state: "Todo",
      team: "RestoreAssist",
    });
  });

  it("survives a node with a null team instead of blaming the network", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          issues: {
            nodes: [
              {
                id: "i2",
                identifier: "RA-2",
                title: "No team",
                priority: 2,
                state: null,
                assignee: null,
                url: "https://linear.app/x/RA-2",
                team: null,
              },
            ],
          },
        },
      }),
    );

    const body = await (await GET()).json();

    expect(body.stale).toBe(false);
    expect(body.reason).toBeUndefined();
    expect(body.data.issues[0]).toMatchObject({
      identifier: "RA-2",
      state: null,
      team: null,
    });
  });

  it("reports an unconfigured key as stale rather than an empty board", async () => {
    delete process.env.LINEAR_API_KEY;

    const body = await (await GET()).json();

    expect(body.stale).toBe(true);
    expect(body.reason).toBe("LINEAR_API_KEY not configured");
    expect(body.data.issues).toEqual([]);
  });
});
