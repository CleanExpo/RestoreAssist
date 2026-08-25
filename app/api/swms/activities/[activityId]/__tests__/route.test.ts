/**
 * Fetching one SWMS template, and composing it for a job.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../route";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const ctx = (activityId: string) => ({ params: Promise.resolve({ activityId }) });
const url = (id: string) => `http://localhost/api/swms/activities/${id}`;
const getReq = (id: string) => new NextRequest(url(id));
const postReq = (id: string, body: unknown) =>
  new NextRequest(url(id), {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const VALID_BODY = {
  pcbu: {
    companyName: "Disaster Recovery QLD",
    address: "4/17 Tile St, Wacol QLD 4076",
    abn: "42 633 062 307",
    contactName: "Paul Lederhose",
    contactPosition: "Director",
    contactPhone: "07 3879 4677",
  },
  project: {
    name: "Burst pipe make-safe",
    address: "1 Test St, Melbourne VIC 3000",
    jurisdictionCode: "VIC",
  },
};

beforeEach(() => getServerSession.mockReset());
const signedIn = () => getServerSession.mockResolvedValue({ user: { id: "u1" } });

describe("GET /api/swms/activities/[activityId]", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    expect((await GET(getReq("carpet-removal"), ctx("carpet-removal"))).status).toBe(401);
  });

  it("returns the template", async () => {
    signedIn();
    const res = await GET(getReq("carpet-removal"), ctx("carpet-removal"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.id).toBe("carpet-removal");
    expect(data.rows.length).toBeGreaterThan(0);
  });

  it("404s an unknown activity", async () => {
    signedIn();
    expect((await GET(getReq("nope"), ctx("nope"))).status).toBe(404);
  });

  it("404s __proto__ rather than returning an inherited object", async () => {
    // A bare registry lookup returns Object.prototype for this id, which is
    // truthy — the route would 200 with a body that has no risk table.
    signedIn();
    expect((await GET(getReq("__proto__"), ctx("__proto__"))).status).toBe(404);
  });
});

describe("POST /api/swms/activities/[activityId]", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(postReq("carpet-removal", VALID_BODY), ctx("carpet-removal"));
    expect(res.status).toBe(401);
  });

  it("composes a SWMS citing the project's jurisdiction", async () => {
    signedIn();
    const res = await POST(postReq("carpet-removal", VALID_BODY), ctx("carpet-removal"));
    expect(res.status).toBe(200);

    const { data } = await res.json();
    expect(data.activityId).toBe("carpet-removal");
    expect(data.applicableJurisdiction.act).toBe(
      "Occupational Health and Safety Act 2004 (Vic)",
    );
    expect(data.pcbu.companyName).toBe("Disaster Recovery QLD");
    expect(data.rows.length).toBeGreaterThan(0);
  });

  it("400s a malformed body", async () => {
    signedIn();
    const res = await POST(postReq("carpet-removal", { pcbu: {} }), ctx("carpet-removal"));
    expect(res.status).toBe(400);
  });

  it("400s a body that is not JSON", async () => {
    signedIn();
    const res = await POST(postReq("carpet-removal", "not json"), ctx("carpet-removal"));
    expect(res.status).toBe(400);
  });

  it("400s, not 500, when composition rejects the input", async () => {
    signedIn();
    const res = await POST(
      postReq("carpet-removal", {
        ...VALID_BODY,
        pcbu: { ...VALID_BODY.pcbu, abn: "12345" },
      }),
      ctx("carpet-removal"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/ABN/);
  });

  it("400s an unknown jurisdiction rather than defaulting to one", async () => {
    signedIn();
    const res = await POST(
      postReq("carpet-removal", {
        ...VALID_BODY,
        project: { ...VALID_BODY.project, jurisdictionCode: "XX" },
      }),
      ctx("carpet-removal"),
    );
    expect(res.status).toBe(400);
  });
});
