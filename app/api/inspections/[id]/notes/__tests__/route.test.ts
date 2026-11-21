/**
 * RA-8496 — append-only, time-stamped job notes.
 *
 * Prisma is mocked; the tenancy code in lib/auth/assert-tenancy is REAL. The
 * mocked `inspection.findFirst` evaluates the ownership clauses that code
 * builds against a small fixture, so a defect in how the route opens the job
 * (or in the clauses themselves) changes the answer here.
 *
 * People: the owner (ADMIN) of business A, who created the job; an office
 * manager (MANAGER) and a technician (USER) of business A; and the owner of a
 * different business B.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const users: Record<
    string,
    {
      id: string;
      name: string | null;
      email: string;
      role: string;
      organizationId: string | null;
    }
  > = {
    owner: {
      id: "owner",
      name: "Olive Owner",
      email: "o@a.test",
      role: "ADMIN",
      organizationId: "orgA",
    },
    office: {
      id: "office",
      name: "Mia Office",
      email: "m@a.test",
      role: "MANAGER",
      organizationId: "orgA",
    },
    tech: {
      id: "tech",
      name: null,
      email: "tech@a.test",
      role: "USER",
      organizationId: "orgA",
    },
    outsider: {
      id: "outsider",
      name: "Bob Other",
      email: "b@b.test",
      role: "ADMIN",
      organizationId: "orgB",
    },
    support: {
      id: "support",
      name: "Sam Support",
      email: "s@p.test",
      role: "ADMIN",
      organizationId: "orgP",
    },
  };
  const inspection = {
    id: "insp_1",
    userId: "owner",
    workspaceId: null as string | null,
  };

  type Clause = Record<string, unknown>;
  const clauseMatches = (c: Clause): boolean => {
    if (typeof c.userId === "string" && !("createdAt" in c))
      return c.userId === inspection.userId;
    const user = c.user as { organizationId?: unknown } | undefined;
    if (user && typeof user.organizationId === "string") {
      return users[inspection.userId]?.organizationId === user.organizationId;
    }
    return false; // workspace membership, removed-member windows: none in this fixture
  };
  const whereMatches = (where: Record<string, unknown>): boolean => {
    if (where.id !== inspection.id) return false;
    const ors: Clause[][] = [];
    if (Array.isArray(where.OR)) ors.push(where.OR as Clause[]);
    if (Array.isArray(where.AND)) {
      for (const a of where.AND as Clause[])
        if (Array.isArray(a.OR)) ors.push(a.OR as Clause[]);
    }
    if (ors.length === 0) return true; // platform scope: by id
    return ors.every((list) => list.some(clauseMatches));
  };

  return {
    users,
    inspection,
    whereMatches,
    getServerSession: vi.fn(),
    jobNoteFindMany: vi.fn(),
    jobNoteCreate: vi.fn(),
    jobNoteFindFirst: vi.fn(),
    applyRateLimit: vi.fn(),
  };
});

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => h.getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...a: unknown[]) => h.applyRateLimit(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const u = h.users[where.id];
        return u
          ? { ...u, organizationLeftAt: null, organizationLeftId: null }
          : null;
      }),
      findMany: vi.fn(async () => []),
    },
    inspection: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        h.whereMatches(where) ? { ...h.inspection } : null,
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === h.inspection.id
          ? {
              ...h.inspection,
              user: {
                organizationId:
                  h.users[h.inspection.userId]?.organizationId ?? null,
              },
            }
          : null,
      ),
    },
    jobNote: {
      findMany: (...a: unknown[]) => h.jobNoteFindMany(...a),
      create: (...a: unknown[]) => h.jobNoteCreate(...a),
      findFirst: (...a: unknown[]) => h.jobNoteFindFirst(...a),
    },
  },
}));

import * as route from "../route";
const { GET, POST } = route;

const ctx = () => ({ params: Promise.resolve({ id: "insp_1" }) });
const as = (id: string | null) =>
  h.getServerSession.mockResolvedValue(
    id ? { user: { id, role: "ADMIN" } } : null,
  );
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/inspections/insp_1/notes", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const get = () =>
  new NextRequest("http://localhost/api/inspections/insp_1/notes");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PLATFORM_SUPPORT_USER_IDS = "support";
  h.applyRateLimit.mockResolvedValue(null);
  h.jobNoteFindMany.mockResolvedValue([]);
  h.jobNoteCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "note_new",
      createdAt: new Date("2026-11-21T01:02:03.456Z"),
      ...data,
    }),
  );
});

describe("RA-8496 job notes: who may read and add", () => {
  it("401 without a session, and nothing is written", async () => {
    as(null);
    expect((await GET(get(), ctx())).status).toBe(401);
    expect((await POST(post({ body: "x" }), ctx())).status).toBe(401);
    expect(h.jobNoteCreate).not.toHaveBeenCalled();
  });

  it("another organisation gets 404 on read and on add, and nothing is read or written", async () => {
    as("outsider");
    expect((await GET(get(), ctx())).status).toBe(404);
    const res = await POST(
      post({ kind: "CALL", body: "Rang the insured" }),
      ctx(),
    );
    expect(res.status).toBe(404);
    expect(h.jobNoteFindMany).not.toHaveBeenCalled();
    expect(h.jobNoteCreate).not.toHaveBeenCalled();
  });

  it.each(["owner", "office", "tech"])(
    "%s of the job's organisation can read and add",
    async (who) => {
      as(who);
      expect((await GET(get(), ctx())).status).toBe(200);
      expect((await POST(post({ body: "Note" }), ctx())).status).toBe(201);
    },
  );

  it("platform support can read another business's notes but cannot add one under that business's name", async () => {
    as("support");
    expect((await GET(get(), ctx())).status).toBe(200);
    const res = await POST(post({ kind: "CALL", body: "Support note" }), ctx());
    expect(res.status).toBe(404);
    expect(h.jobNoteCreate).not.toHaveBeenCalled();
  });

  it("adding is rate limited per user at 30 a minute, and a refusal writes nothing", async () => {
    as("office");
    await POST(post({ body: "One" }), ctx());
    expect(h.applyRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        maxRequests: 30,
        windowMs: 60_000,
        key: "office",
      }),
    );
    h.jobNoteCreate.mockClear();
    h.applyRateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await POST(post({ body: "Two" }), ctx())).status).toBe(429);
    expect(h.jobNoteCreate).not.toHaveBeenCalled();
  });
});

describe("RA-8496 job notes: a retried save never makes a second note", () => {
  it("passes the client's request id through to the row", async () => {
    as("office");
    await POST(
      post({ body: "Rang insured", clientRequestId: "draft-1" }),
      ctx(),
    );
    const { data } = h.jobNoteCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.clientRequestId).toBe("draft-1");
  });

  it("a repeat of the same request id returns the note already saved, with 200", async () => {
    as("office");
    h.jobNoteCreate.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    h.jobNoteFindFirst.mockResolvedValueOnce({
      id: "note_first",
      kind: "GENERAL",
      body: "Rang insured",
      authorName: "Mia Office",
      authorRole: "MANAGER",
      createdAt: new Date("2026-11-21T01:00:00.000Z"),
    });
    const res = await POST(
      post({ body: "Rang insured", clientRequestId: "draft-1" }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe("note_first");
    const args = h.jobNoteFindFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({
      inspectionId: "insp_1",
      clientRequestId: "draft-1",
    });
  });

  it.each([[123], ["x".repeat(101)], [""]])(
    "400 for an unusable request id %j",
    async (clientRequestId) => {
      as("office");
      expect(
        (await POST(post({ body: "ok", clientRequestId }), ctx())).status,
      ).toBe(400);
      expect(h.jobNoteCreate).not.toHaveBeenCalled();
    },
  );
});

describe("RA-8496 job notes: the stamp", () => {
  it("author, role and time come from the server and database, never the request body", async () => {
    // The session claims ADMIN; the database says MANAGER. The body tries to forge everything.
    as("office");
    const res = await POST(
      post({
        kind: "BOOKING",
        body: "  Booked Tom for Tuesday 9am  ",
        authorName: "Forged",
        authorRole: "ADMIN",
        authorUserId: "outsider",
        createdAt: "2001-01-01T00:00:00.000Z",
        inspectionId: "other_job",
        id: "chosen",
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const { data } = h.jobNoteCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data).toEqual({
      inspectionId: "insp_1",
      authorUserId: "office",
      authorName: "Mia Office",
      authorRole: "MANAGER",
      kind: "BOOKING",
      body: "Booked Tom for Tuesday 9am",
      clientRequestId: null,
    });
    const json = await res.json();
    expect(json.data).toMatchObject({
      id: "note_new",
      kind: "BOOKING",
      authorName: "Mia Office",
      authorRole: "MANAGER",
      createdAt: "2026-11-21T01:02:03.456Z",
    });
  });

  it("an account with no name is stamped 'Team member', never its email (the stamp outlives the account)", async () => {
    as("tech");
    await POST(post({ body: "On site" }), ctx());
    const { data } = h.jobNoteCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.authorName).toBe("Team member");
    expect(JSON.stringify(data)).not.toContain("tech@a.test");
    expect(data.authorRole).toBe("USER");
    expect(data.kind).toBe("GENERAL");
  });

  it.each([
    [{ body: "" }, "empty"],
    [{ body: "   " }, "blank"],
    [{}, "missing"],
    [{ body: "x".repeat(4001) }, "too long"],
    [{ body: "ok", kind: "DELETE" }, "unknown kind"],
  ])("400 and no write for %j (%s)", async (body) => {
    as("owner");
    expect((await POST(post(body), ctx())).status).toBe(400);
    expect(h.jobNoteCreate).not.toHaveBeenCalled();
  });

  it("stores the text as typed, not HTML-encoded (React escapes it on render)", async () => {
    as("owner");
    await POST(post({ body: "Didn't answer & left a message <again>" }), ctx());
    const { data } = h.jobNoteCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.body).toBe("Didn't answer & left a message <again>");
  });
});

describe("RA-8496 job notes: reading", () => {
  it("asks for this job's notes newest first and returns exact ISO times", async () => {
    h.jobNoteFindMany.mockResolvedValue([
      {
        id: "n2",
        kind: "REBOOKING",
        body: "Moved to Thursday",
        authorName: "Mia Office",
        authorRole: "MANAGER",
        createdAt: new Date("2026-11-21T03:00:00.000Z"),
      },
      {
        id: "n1",
        kind: "BOOKING",
        body: "Booked Tuesday",
        authorName: "Mia Office",
        authorRole: "MANAGER",
        createdAt: new Date("2026-11-20T23:15:00.000Z"),
      },
    ]);
    as("tech");
    const res = await GET(get(), ctx());
    expect(res.status).toBe(200);
    const args = h.jobNoteFindMany.mock.calls[0][0] as Record<string, unknown>;
    expect(args.where).toEqual({ inspectionId: "insp_1" });
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(typeof args.take).toBe("number");
    const json = await res.json();
    expect(json.meta).toEqual({ truncated: false });
    expect(json.data.map((n: { id: string }) => n.id)).toEqual(["n2", "n1"]);
    expect(json.data[0].createdAt).toBe("2026-11-21T03:00:00.000Z");
    expect(json.data[0]).not.toHaveProperty("authorUserId");
  });

  it("says when older notes were left off, instead of dropping them silently", async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      id: `n${i}`,
      kind: "GENERAL",
      body: "x",
      authorName: "A",
      authorRole: "USER",
      createdAt: new Date(Date.UTC(2026, 10, 21, 0, 0, 0, 0) - i * 1000),
    }));
    h.jobNoteFindMany.mockResolvedValue(many);
    as("owner");
    const json = await (await GET(get(), ctx())).json();
    expect(json.data).toHaveLength(500);
    expect(json.meta).toEqual({ truncated: true });
    const args = h.jobNoteFindMany.mock.calls[0][0] as { take: number };
    expect(args.take).toBe(501);
  });

  it("answers 503 FEATURE_UNAVAILABLE on add as well, before the table exists", async () => {
    h.jobNoteCreate.mockRejectedValue(
      Object.assign(new Error("The table `public.JobNote` does not exist"), {
        code: "P2021",
      }),
    );
    as("owner");
    const res = await POST(post({ body: "x" }), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("FEATURE_UNAVAILABLE");
  });

  it("answers 503 FEATURE_UNAVAILABLE, not 500, before the table exists", async () => {
    h.jobNoteFindMany.mockRejectedValue(
      Object.assign(new Error("The table `public.JobNote` does not exist"), {
        code: "P2021",
      }),
    );
    as("owner");
    const res = await GET(get(), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("FEATURE_UNAVAILABLE");
  });
});

describe("RA-8496 job notes: append-only", () => {
  it("exports no edit or delete handler", () => {
    const exported = Object.keys(route);
    for (const verb of ["PUT", "PATCH", "DELETE"])
      expect(exported).not.toContain(verb);
  });
});
