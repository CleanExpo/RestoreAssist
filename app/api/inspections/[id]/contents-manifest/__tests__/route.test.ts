import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const inspectionUpdate = vi.fn();
const workspaceRouteAiRequest = vi.fn();
const getWorkspaceForUser = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
      update: (...args: unknown[]) => inspectionUpdate(...args),
    },
  },
}));
vi.mock("@/lib/ai/workspace-byok-dispatch", () => ({
  workspaceRouteAiRequest: (...args: unknown[]) =>
    workspaceRouteAiRequest(...args),
}));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: (...args: unknown[]) => getWorkspaceForUser(...args),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (
    _request: unknown,
    _userId: unknown,
    handler: () => Promise<Response>,
  ) => handler(),
}));

import { POST } from "../route";

// RA-7585: no create path ever writes Inspection.workspaceId, so this is the
// shape every production inspection has.
const productionInspection = {
  id: "inspection_1",
  userId: "user_1",
  workspaceId: null,
  evidenceItems: [
    {
      id: "ev_1",
      evidenceClass: "AFFECTED_CONTENTS",
      fileUrl: "https://files.example/sofa.jpg",
      fileName: "sofa.jpg",
      title: "Sofa",
      description: "Water line at 20 cm",
      roomName: "Lounge",
    },
  ],
  photos: [],
};

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  inspectionUpdate.mockReset();
  workspaceRouteAiRequest.mockReset();
  getWorkspaceForUser.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  inspectionFindFirst.mockResolvedValue(productionInspection);
  inspectionUpdate.mockResolvedValue({ id: "inspection_1" });
  getWorkspaceForUser.mockResolvedValue({ id: "ws_user", name: "Mine" });
  workspaceRouteAiRequest.mockResolvedValue({
    text: JSON.stringify({
      items: [
        {
          category: "Furniture",
          description: "Three-seat sofa",
          count: 1,
          condition: "poor",
          restorableStatus: "replace",
          confidence: 85,
        },
      ],
    }),
    model: "claude-sonnet-4-6",
    tier: "byok",
  });
});

function post() {
  return POST(
    new NextRequest(
      "http://localhost/api/inspections/inspection_1/contents-manifest",
      { method: "POST", body: JSON.stringify({}) },
    ),
    { params: Promise.resolve({ id: "inspection_1" }) },
  );
}

describe("POST /api/inspections/[id]/contents-manifest", () => {
  it("drafts a manifest for an inspection with no workspaceId, using the caller's workspace (RA-7585)", async () => {
    const response = await post();

    expect(response.status).toBe(201);
    expect(getWorkspaceForUser).toHaveBeenCalledWith("user_1");
    expect(workspaceRouteAiRequest).toHaveBeenCalledTimes(1);
    expect(workspaceRouteAiRequest.mock.calls[0][0]).toBe("ws_user");
    expect(inspectionUpdate).toHaveBeenCalled();
    const body = await response.json();
    expect(body.data.items).toHaveLength(1);
  });

  it("returns 422 and makes no AI call when the caller has no workspace (RA-7585)", async () => {
    getWorkspaceForUser.mockResolvedValueOnce(null);

    const response = await post();

    expect(response.status).toBe(422);
    expect(workspaceRouteAiRequest).not.toHaveBeenCalled();
    expect(inspectionUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 for an inspection the caller does not own", async () => {
    inspectionFindFirst.mockResolvedValueOnce(null);

    const response = await post();

    expect(response.status).toBe(404);
    expect(inspectionFindFirst.mock.calls[0][0].where).toEqual({
      id: "inspection_1",
      userId: "user_1",
    });
    expect(workspaceRouteAiRequest).not.toHaveBeenCalled();
  });
});
