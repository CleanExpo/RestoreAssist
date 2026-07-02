import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const generateContentsManifest = vi.fn();
const resolveWorkspaceRouterConfig = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
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

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  generateContentsManifest.mockReset();
  resolveWorkspaceRouterConfig.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  inspectionFindFirst.mockResolvedValue({
    id: "inspection_1",
    workspaceId: "ws_1",
    inspectionNumber: "INS-001",
    propertyAddress: "1 Test St",
    inspectionWorkflow: { jobType: "water_damage" },
  });
  resolveWorkspaceRouterConfig.mockResolvedValue({
    byokModel: "claude-sonnet-4-6",
    byokApiKey: "server-resolved-key",
  });
  generateContentsManifest.mockResolvedValue({ items: [] });
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
