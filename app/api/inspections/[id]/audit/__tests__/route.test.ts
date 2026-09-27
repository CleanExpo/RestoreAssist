import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const auditLogFindMany = vi.fn();
const auditLogCount = vi.fn();
const userFindMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
    auditLog: {
      findMany: (...a: unknown[]) => auditLogFindMany(...a),
      count: (...a: unknown[]) => auditLogCount(...a),
    },
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
  },
}));

// Import after mocks
import { GET } from "../route";

const params = { params: Promise.resolve({ id: "insp_1" }) };
const req = () =>
  new NextRequest("http://localhost/api/inspections/insp_1/audit");

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "owner_1" } });
  inspectionFindFirst.mockResolvedValue({ id: "insp_1" });
  auditLogFindMany.mockResolvedValue([
    { id: "a1", inspectionId: "insp_1", userId: "tech_1", action: "PHOTO_ADDED" },
    { id: "a2", inspectionId: "insp_1", userId: "owner_1", action: "JOB_CREATED" },
    { id: "a3", inspectionId: "insp_1", userId: "tech_1", action: "READING_ADDED" },
    { id: "a4", inspectionId: "insp_1", userId: "gone_1", action: "NOTE_ADDED" },
  ]);
  auditLogCount.mockResolvedValue(4);
  userFindMany.mockResolvedValue([
    { id: "tech_1", name: "Sam Technician" },
    { id: "owner_1", name: "Olivia Owner" },
  ]);
});

describe("GET /api/inspections/[id]/audit — who did it (RA-7721)", () => {
  it("returns each entry with the name of the person who made it", async () => {
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(4);
    expect(body.logs.map((l: { userName: string | null }) => l.userName)).toEqual([
      "Sam Technician",
      "Olivia Owner",
      "Sam Technician",
      null, // user since deleted: page falls back to the id
    ]);
  });

  it("looks up only the people in this job's entries, and only their names", async () => {
    await GET(req(), params);
    expect(userFindMany).toHaveBeenCalledTimes(1);
    const arg = userFindMany.mock.calls[0][0];
    expect([...arg.where.id.in].sort()).toEqual(["gone_1", "owner_1", "tech_1"]);
    expect(arg.select).toEqual({ id: true, name: true });
  });

  it("does not look anyone up when the job is not the caller's", async () => {
    inspectionFindFirst.mockResolvedValueOnce(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(404);
    expect(userFindMany).not.toHaveBeenCalled();
  });
});
