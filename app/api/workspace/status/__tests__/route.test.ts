import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const getWorkspaceStatus = vi.hoisted(() => vi.fn());
const ensureWorkspaceForUser = vi.hoisted(() => vi.fn());
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/workspace/payment-gate", () => ({ getWorkspaceStatus }));
vi.mock("@/lib/workspace/provision", () => ({ ensureWorkspaceForUser }));

import { GET } from "../route";

const request = () => new NextRequest("http://localhost/api/workspace/status");

beforeEach(() => {
  vi.clearAllMocks();
  ensureWorkspaceForUser.mockResolvedValue(null);
});

describe("GET /api/workspace/status — lazy provision", () => {
  it("returns 200 with hasWorkspace false when none exists after ensure", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    getWorkspaceStatus.mockResolvedValue(null);
    ensureWorkspaceForUser.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ hasWorkspace: false });
    expect(ensureWorkspaceForUser).toHaveBeenCalledWith("u1");
  });

  it("re-reads status after ensure provisions a workspace", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    getWorkspaceStatus
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: "READY",
        workspaceId: "ws-1",
        workspaceName: "Acme",
        pilotSandboxEnabled: false,
      });
    ensureWorkspaceForUser.mockResolvedValue({
      workspaceId: "ws-1",
      workspaceName: "Acme",
      alreadyExisted: false,
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      hasWorkspace: true,
      ready: true,
      workspaceId: "ws-1",
    });
  });
});

describe("GET /api/workspace/status pilot identity", () => {
  it("returns the canonical name and marker only for an explicitly flagged sandbox", async () => {
    getServerSession.mockResolvedValue({ user: { id: "pilot-user" } });
    getWorkspaceStatus.mockResolvedValue({
      status: "READY", workspaceId: "ws-pilot", workspaceName: "Beyond Clean (sandbox pilot)", pilotSandboxEnabled: true,
    });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      workspaceName: "Beyond Clean (sandbox pilot)", sandboxMarker: "RESTOREASSIST_PILOT_SANDBOX_V1",
    });
  });

  it("never self-labels a production workspace that merely has a sandbox-like name", async () => {
    getServerSession.mockResolvedValue({ user: { id: "customer" } });
    getWorkspaceStatus.mockResolvedValue({
      status: "READY", workspaceId: "ws-prod", workspaceName: "Sandbox Restoration", pilotSandboxEnabled: false,
    });
    const response = await GET(request());
    const json = await response.json();
    expect(json.workspaceName).toBe("Sandbox Restoration");
    expect(json).not.toHaveProperty("sandboxMarker");
  });
});
