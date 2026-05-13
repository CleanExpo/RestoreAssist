import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const getServerSession = vi.fn();
const authFindFirst = vi.fn();
const userFindUnique = vi.fn();
const inspectionCount = vi.fn();
const moistureReadingCount = vi.fn();
const reportCount = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorisation: { findFirst: (...a: unknown[]) => authFindFirst(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    inspection: { count: (...a: unknown[]) => inspectionCount(...a) },
    moistureReading: { count: (...a: unknown[]) => moistureReadingCount(...a) },
    report: { count: (...a: unknown[]) => reportCount(...a) },
  },
}));

beforeEach(() => {
  getServerSession.mockReset();
  authFindFirst.mockReset();
  userFindUnique.mockReset();
  inspectionCount.mockReset();
  moistureReadingCount.mockReset();
  reportCount.mockReset();

  // Sensible defaults so the non-USER (ADMIN) path doesn't crash.
  userFindUnique.mockResolvedValue(null);
  inspectionCount.mockResolvedValue(0);
  moistureReadingCount.mockResolvedValue(0);
  reportCount.mockResolvedValue(0);
});

describe("GET /api/onboarding/first-run", () => {
  it("returns tech step set when session.user.role === 'USER'", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", role: "USER" },
    });
    authFindFirst.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest("http://localhost/api/onboarding/first-run"),
    );
    const body = await res.json();
    expect(body.steps.map((s: { id: string }) => s.id)).toEqual([
      "tech_iicrc",
      "tech_whs",
      "tech_state",
    ]);
    expect(body.dismissed).toBe(false);
    expect(body.allComplete).toBe(false);
  });

  it("auto-dismisses tech banner when an Authorisation row exists", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", role: "USER" },
    });
    authFindFirst.mockResolvedValueOnce({
      id: "a_1",
      subjectLicenceNumber: "IICRC-1",
      whsCardNumber: "WHS-1",
    });
    const res = await GET(
      new NextRequest("http://localhost/api/onboarding/first-run"),
    );
    const body = await res.json();
    expect(body.dismissed).toBe(true);
    expect(body.allComplete).toBe(true);
  });

  it("returns original (non-tech) step set when session.user.role !== 'USER'", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", role: "ADMIN" },
    });
    const res = await GET(
      new NextRequest("http://localhost/api/onboarding/first-run"),
    );
    const body = await res.json();
    const techIds = ["tech_iicrc", "tech_whs", "tech_state"];
    for (const id of body.steps.map((s: { id: string }) => s.id)) {
      expect(techIds).not.toContain(id);
    }
  });
});
