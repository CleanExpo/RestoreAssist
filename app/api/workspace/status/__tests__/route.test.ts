import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const getWorkspaceStatus = vi.hoisted(() => vi.fn());
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/workspace/payment-gate", () => ({ getWorkspaceStatus }));

import { GET } from "../route";

const request = () => new NextRequest("http://localhost/api/workspace/status");

beforeEach(() => vi.clearAllMocks());

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
