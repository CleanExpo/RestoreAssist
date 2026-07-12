import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  verifyAdminFromDb: vi.fn(),
  pilotObservationFindMany: vi.fn(),
  inspectionFindMany: vi.fn(),
  generatePilotReport: vi.fn(),
  deriveCycleTimeObservations: vi.fn(),
  getPilotCommandCentre: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: mocks.verifyAdminFromDb,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pilotObservation: { findMany: mocks.pilotObservationFindMany },
    inspection: { findMany: mocks.inspectionFindMany },
  },
}));
vi.mock("@/lib/api-errors", () => ({
  fromException: () =>
    NextResponse.json({ error: "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/nir-pilot-measurement", () => ({
  generatePilotReport: mocks.generatePilotReport,
  deriveCycleTimeObservations: mocks.deriveCycleTimeObservations,
}));
vi.mock("@/lib/pilot-readiness-command-centre", () => ({
  getPilotCommandCentre: mocks.getPilotCommandCentre,
}));

import { GET } from "../route";

const REPORT = {
  generatedAt: "2026-07-12T00:00:00.000Z",
  readyToPromote: [],
  inProgress: [],
  totalObservations: 0,
  actionItems: [],
  pilotComplete: false,
};

const COMMAND_CENTRE = {
  decision: "NO_GO",
  summary: "1 blocker must be cleared before pilot.",
  generatedAt: "2026-07-12T00:00:00.000Z",
  deployment: {
    environment: "production",
    branch: "main",
    commitSha: "0123456789abcdef",
    commitUrl:
      "https://github.com/CleanExpo/RestoreAssist/commit/0123456789abcdef",
    deploymentUrl: "https://restoreassist.app",
  },
  gates: [],
  blockers: [],
  counts: { verified: 0, needsEvidence: 1, blockers: 1 },
};

function request() {
  return new NextRequest("http://localhost/api/pilot/readiness");
}

describe("GET /api/pilot/readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });
    mocks.verifyAdminFromDb.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN", organizationId: null },
    });
    mocks.pilotObservationFindMany.mockResolvedValue([]);
    mocks.inspectionFindMany.mockResolvedValue([]);
    mocks.generatePilotReport.mockReturnValue(REPORT);
    mocks.deriveCycleTimeObservations.mockReturnValue([]);
    mocks.getPilotCommandCentre.mockResolvedValue(COMMAND_CENTRE);
  });

  it("returns the verifier response before loading operational or NIR evidence", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    mocks.verifyAdminFromDb.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.pilotObservationFindMany).not.toHaveBeenCalled();
    expect(mocks.inspectionFindMany).not.toHaveBeenCalled();
    expect(mocks.getPilotCommandCentre).not.toHaveBeenCalled();
  });

  it("returns the command-centre snapshot to a DB-verified admin", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.commandCentre).toEqual(COMMAND_CENTRE);
    expect(body.report).toEqual(REPORT);
    expect(mocks.getPilotCommandCentre).toHaveBeenCalledTimes(1);
  });

  it("loads pilot observations with an explicit bounded select", async () => {
    await GET(request());

    expect(mocks.pilotObservationFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        claimId: true,
        observationType: true,
        value: true,
        group: true,
        inspectionId: true,
        recordedByUserId: true,
        context: true,
        notes: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 1_000,
    });
  });
});
