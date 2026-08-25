/**
 * The SWMS catalogue route. Auth first, shape second.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const req = () => new NextRequest("http://localhost/api/swms/activities");

beforeEach(() => getServerSession.mockReset());

describe("GET /api/swms/activities", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    expect((await GET(req())).status).toBe(401);
  });

  it("returns 401 when the session has no user id", async () => {
    getServerSession.mockResolvedValueOnce({ user: {} });
    expect((await GET(req())).status).toBe(401);
  });

  it("lists the seven activities and the jurisdictions they can be issued for", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "user_1" } });
    const res = await GET(req());
    expect(res.status).toBe(200);

    const { data } = await res.json();
    expect(data.activities).toHaveLength(7);
    expect(data.jurisdictions.map((j: { code: string }) => j.code)).toContain("VIC");
    expect(data.jurisdictions.map((j: { code: string }) => j.code)).toContain("NZ");

    for (const a of data.activities) {
      expect(a.id).toBeTruthy();
      expect(a.title).toBeTruthy();
      expect(a.stepCount).toBeGreaterThan(0);
      expect(a.highestResidualRisk).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns a summary, not the full risk table", async () => {
    // The catalogue is fetched on page load; shipping seven complete risk
    // tables with it would be a large payload nobody asked for.
    getServerSession.mockResolvedValueOnce({ user: { id: "user_1" } });
    const { data } = await (await GET(req())).json();
    expect(data.activities[0]).not.toHaveProperty("rows");
  });
});
