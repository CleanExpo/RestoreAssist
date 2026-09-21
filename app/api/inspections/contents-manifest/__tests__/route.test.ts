import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const inspectionUpdate = vi.fn();
const generateContentsManifest = vi.fn();
const resolveWorkspaceRouterConfig = vi.fn();
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
vi.mock("@/lib/ai/contents-manifest", () => ({
  generateContentsManifest: (...args: unknown[]) =>
    generateContentsManifest(...args),
  manifestToCsv: vi.fn(),
  estimateManifestCost: vi.fn(),
}));
vi.mock("@/lib/ai/workspace-byok-dispatch", () => ({
  resolveWorkspaceRouterConfig: (...args: unknown[]) =>
    resolveWorkspaceRouterConfig(...args),
}));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: (...args: unknown[]) => getWorkspaceForUser(...args),
}));
vi.mock("@/lib/ai/contents-manifest-draft-bridge", () => ({
  visionManifestToDraft: (manifest: unknown) => ({
    inspectionId: "inspection_1",
    items: [],
    draftFrom: manifest,
  }),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  inspectionUpdate.mockReset();
  generateContentsManifest.mockReset();
  resolveWorkspaceRouterConfig.mockReset();
  getWorkspaceForUser.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  getWorkspaceForUser.mockResolvedValue({ id: "ws_1", name: "Test Workspace" });
  inspectionFindFirst.mockResolvedValue({
    id: "inspection_1",
    workspaceId: "ws_1",
    inspectionNumber: "INS-001",
    propertyAddress: "1 Test St",
    inspectionWorkflow: { jobType: "water_damage" },
  });
  inspectionUpdate.mockResolvedValue({ id: "inspection_1" });
  resolveWorkspaceRouterConfig.mockResolvedValue({
    byokModel: "claude-sonnet-4-6",
    byokApiKey: "server-resolved-key",
  });
  generateContentsManifest.mockResolvedValue({
    inspectionId: "inspection_1",
    items: [],
    photosAnalysed: 1,
    model: "claude-sonnet-4-6",
    generatedAt: new Date().toISOString(),
  });
});

function postRequest(extra?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/inspections/contents-manifest", {
    method: "POST",
    body: JSON.stringify({
      inspectionId: "inspection_1",
      model: "claude-sonnet-4-6",
      photos: [
        { data: "base64-photo", mediaType: "image/jpeg", label: "kitchen" },
      ],
      ...extra,
    }),
  });
}

describe("POST /api/inspections/contents-manifest", () => {
  it("resolves the BYOK key server-side and ignores any client-supplied apiKey (B2)", async () => {
    const response = await POST(postRequest({ apiKey: "forged-client-key" }));

    expect(response.status).toBe(200);
    expect(resolveWorkspaceRouterConfig).toHaveBeenCalledWith(
      "ws_1",
      "claude-sonnet-4-6",
    );
    const routerConfigArg = generateContentsManifest.mock.calls[0][2] as {
      byokApiKey: string;
    };
    expect(routerConfigArg.byokApiKey).toBe("server-resolved-key");
    // the forged body key must never reach the dispatch layer
    expect(JSON.stringify(generateContentsManifest.mock.calls[0])).not.toContain(
      "forged-client-key",
    );
  });

  it("succeeds when the request omits apiKey entirely", async () => {
    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    expect(generateContentsManifest).toHaveBeenCalled();
  });

  it("persists the generated manifest into contentsManifestDraft", async () => {
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(inspectionUpdate).toHaveBeenCalled();
    expect(body.persisted).toBe(true);
    expect(body.draft).toBeTruthy();
  });

  // RA-7585: no create path ever writes Inspection.workspaceId, so in
  // production it is always null. The key must come from the caller's
  // workspace, as report generation resolves it.
  it("works for an inspection with no workspaceId, using the caller's workspace (RA-7585)", async () => {
    inspectionFindFirst.mockResolvedValueOnce({
      id: "inspection_1",
      workspaceId: null,
      inspectionNumber: "INS-001",
      propertyAddress: "1 Test St",
      inspectionWorkflow: { jobType: "water_damage" },
    });
    getWorkspaceForUser.mockResolvedValueOnce({ id: "ws_user", name: "Mine" });

    const response = await POST(postRequest());

    expect(response.status).toBe(200);
    expect(getWorkspaceForUser).toHaveBeenCalledWith("user_1");
    expect(resolveWorkspaceRouterConfig).toHaveBeenCalledWith(
      "ws_user",
      "claude-sonnet-4-6",
    );
    expect(generateContentsManifest).toHaveBeenCalled();
  });

  it("returns 422 and makes no AI call when the caller has no workspace (RA-7585)", async () => {
    getWorkspaceForUser.mockResolvedValueOnce(null);
    const response = await POST(postRequest());
    expect(response.status).toBe(422);
    expect(resolveWorkspaceRouterConfig).not.toHaveBeenCalled();
    expect(generateContentsManifest).not.toHaveBeenCalled();
  });

  it("returns 422 when the workspace has no active provider", async () => {
    resolveWorkspaceRouterConfig.mockResolvedValueOnce(null);
    const response = await POST(postRequest());
    expect(response.status).toBe(422);
    expect(generateContentsManifest).not.toHaveBeenCalled();
  });

  it("does not expose provider exception details in 500 responses", async () => {
    generateContentsManifest.mockRejectedValueOnce(
      new Error("provider failed with api key server-resolved-key"),
    );
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Contents manifest generation failed");
    // must not leak the raw provider exception (which names the resolved key)
    expect(JSON.stringify(body)).not.toContain("server-resolved-key");
  });
});
