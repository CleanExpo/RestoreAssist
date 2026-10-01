import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ token: vi.fn(), user: vi.fn(), workspace: vi.fn(), primary: vi.fn(), revoked: vi.fn(), session: vi.fn(), rateLimit: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.token }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: mocks.user }, workspace: { findUnique: mocks.workspace }, securityEvent: { findFirst: mocks.revoked },
} }));
vi.mock("@/lib/workspace/provider-connections", () => ({ getWorkspaceForUser: mocks.primary }));
vi.mock("@/lib/rate-limiter-edge", () => ({ applyRateLimitEdge: mocks.rateLimit }));

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
  vi.stubEnv("ALLOWED_APP_HOSTS", "");
  vi.stubEnv("SETUP_WIZARD_ENABLED", "false");
  mocks.rateLimit.mockReturnValue(null);
  mocks.token.mockResolvedValue({ sub: OWNER.userId, mintedAt: 100, customExp: Date.now() / 1000 + 3600 });
  mocks.session.mockResolvedValue({ user: { id: OWNER.userId } });
  mocks.user.mockResolvedValue({ id: OWNER.userId, organizationId: OWNER.organizationId });
  mocks.primary.mockResolvedValue({ id: OWNER.workspaceId, name: "Synthetic" });
  mocks.workspace.mockResolvedValue({ ownerId: OWNER.workspaceOwnerId, status: "READY" });
  mocks.revoked.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

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

  it.each(["POST", "GET"])("rejects a foreign host before replay auth or database work for %s", async (method) => {
    vi.stubEnv("ALLOWED_APP_HOSTS", "restoreassist.app");
    const req = new NextRequest("https://origin.example.test/api/inspections", {
      method, headers: { host: "origin.example.test", "x-restoreassist-offline-owner": encodeURIComponent(JSON.stringify(OWNER)) },
    });
    expect((await proxy(req)).status).toBe(421);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.revoked).not.toHaveBeenCalled();
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it("enforces the mutation budget before a replay can force auth or database work", async () => {
    mocks.rateLimit.mockReturnValue(new NextResponse(null, { status: 429 }));
    expect((await proxy(request())).status).toBe(429);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.revoked).not.toHaveBeenCalled();
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it("checks replay ownership after an allowed host and rate budget", async () => {
    vi.stubEnv("ALLOWED_APP_HOSTS", "restoreassist.app");
    const req = new NextRequest("https://restoreassist.app/api/inspections", {
      method: "POST", headers: { host: "restoreassist.app", "x-restoreassist-offline-owner": encodeURIComponent(JSON.stringify({ ...OWNER, userId: "foreign" })) },
    });
    expect((await proxy(req)).status).toBe(409);
    expect(mocks.rateLimit).toHaveBeenCalledOnce();
    expect(mocks.rateLimit.mock.invocationCallOrder[0]).toBeLessThan(mocks.token.mock.invocationCallOrder[0]);
  });

  it("serves only verified context with no-store, never client identity", async () => {
    const response = await GET(request());
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ owner: OWNER });
    mocks.session.mockResolvedValue({ user: { id: "different-session" } });
    expect((await GET(request())).status).toBe(401);
  });
});
