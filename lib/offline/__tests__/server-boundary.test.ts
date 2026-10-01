import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ token: vi.fn(), user: vi.fn(), workspace: vi.fn(), primary: vi.fn(), revoked: vi.fn(), session: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.token }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: mocks.user }, workspace: { findUnique: mocks.workspace }, securityEvent: { findFirst: mocks.revoked },
} }));
vi.mock("@/lib/workspace/provider-connections", () => ({ getWorkspaceForUser: mocks.primary }));
vi.mock("@/lib/rate-limiter-edge", () => ({ applyRateLimitEdge: () => null }));

import { guardOfflineReplay, verifiedOfflineOwner } from "../server-boundary";
import { GET } from "@/app/api/auth/offline-context/route";
import { proxy } from "@/proxy";

const OWNER = { userId: "synthetic-a", organizationId: "org-a", workspaceId: "ws-a", workspaceOwnerId: "synthetic-a" };
function request(owner: unknown = OWNER) {
  return new NextRequest("https://example.test/api/ai/voice-note-transcribe", {
    method: "POST", headers: owner === null ? {} : { "x-restoreassist-offline-owner": encodeURIComponent(JSON.stringify(owner)) },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.token.mockResolvedValue({ sub: OWNER.userId, mintedAt: 100, customExp: Date.now() / 1000 + 3600 });
  mocks.session.mockResolvedValue({ user: { id: OWNER.userId } });
  mocks.user.mockResolvedValue({ id: OWNER.userId, organizationId: OWNER.organizationId });
  mocks.primary.mockResolvedValue({ id: OWNER.workspaceId, name: "Synthetic" });
  mocks.workspace.mockResolvedValue({ ownerId: OWNER.workspaceOwnerId, status: "READY" });
  mocks.revoked.mockResolvedValue(null);
});

describe("offline replay server boundary", () => {
  it("does not intercept normal requests or grant authority to a header", async () => {
    expect(await guardOfflineReplay(request(null))).toBeNull();
    expect(mocks.token).not.toHaveBeenCalled();
    mocks.token.mockResolvedValue(null);
    expect((await guardOfflineReplay(request()))?.status).toBe(401);
  });

  it("requires the cookie user to match the queued owner on the actual replay request", async () => {
    expect(await guardOfflineReplay(request())).toBeNull();
    mocks.token.mockResolvedValue({ sub: "synthetic-b", mintedAt: 100, customExp: Date.now() / 1000 + 3600 });
    mocks.user.mockResolvedValue({ id: "synthetic-b", organizationId: "org-b" });
    expect((await guardOfflineReplay(request()))?.status).toBe(409);
  });

  it.each([
    { ...OWNER, workspaceId: "ws-b" },
    { ...OWNER, organizationId: "org-b" },
    { ...OWNER, workspaceOwnerId: "other-owner" },
    { userId: OWNER.userId },
  ])("refuses foreign or incomplete persisted scope %j", async (owner) => {
    expect((await guardOfflineReplay(request(owner)))?.status).toBe(409);
  });

  it("rechecks revoked sessions without waiting for normal JWT refresh", async () => {
    mocks.revoked.mockResolvedValue({ createdAt: new Date(100_000) });
    expect((await guardOfflineReplay(request()))?.status).toBe(401);
    expect(mocks.primary).not.toHaveBeenCalled();
  });

  it.each([
    { sub: OWNER.userId, mintedAt: 100, customExp: 1 },
    { sub: OWNER.userId, mintedAt: 100, customExp: Infinity },
    { sub: OWNER.userId, customExp: Date.now() / 1000 + 3600 },
    { sub: OWNER.userId, mintedAt: 100, customExp: Date.now() / 1000 + 3600, revoked: true },
  ])("rejects stale or malformed session metadata", async (token) => {
    mocks.token.mockResolvedValue(token);
    expect(await verifiedOfflineOwner(request())).toBeNull();
  });

  it("fails closed when database authority cannot be checked", async () => {
    mocks.revoked.mockRejectedValue(new Error("synthetic unavailable"));
    expect((await guardOfflineReplay(request()))?.status).toBe(503);
  });

  it("detects membership loss and workspace ownership transfer", async () => {
    mocks.primary.mockResolvedValue(null);
    expect((await guardOfflineReplay(request()))?.status).toBe(409);
    mocks.primary.mockResolvedValue({ id: OWNER.workspaceId });
    mocks.workspace.mockResolvedValue({ ownerId: "new-owner", status: "READY" });
    expect((await guardOfflineReplay(request()))?.status).toBe(409);
  });

  it("runs at the proxy before a mismatched replay reaches its route", async () => {
    const response = await proxy(request({ ...OWNER, userId: "another-user" }));
    expect(response.status).toBe(409);
    expect(response.headers.get("x-restoreassist-offline-paused")).toBe("1");
    expect(await response.json()).toMatchObject({ error: { code: "OFFLINE_CONTEXT_CHANGED" } });
  });

  it("serves only verified context with no-store, never client identity", async () => {
    const response = await GET(request());
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ owner: OWNER });
    mocks.session.mockResolvedValue({ user: { id: "different-session" } });
    expect((await GET(request())).status).toBe(401);
  });
});
