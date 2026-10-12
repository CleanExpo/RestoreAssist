import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ row: {} as Record<string, any> }));
const mocks = vi.hoisted(() => ({ decrypt: vi.fn((value: string) => value.replace(/^cipher:/, "")), refresh: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { integration: {
  findUnique: vi.fn(async () => ({ ...state.row })), updateMany: mocks.updateMany,
} } }));
vi.mock("@/lib/credential-vault", () => ({ decrypt: mocks.decrypt }));
vi.mock("@/lib/integrations/xero/client", () => ({ XeroClient: vi.fn().mockImplementation(function () { return { refreshAccessToken: mocks.refresh }; }) }));
import { getValidXeroAccessToken } from "../credentials";
beforeEach(() => {
  vi.clearAllMocks();
  state.row = { id: "int-1", userId: "owner", workspaceId: null, updatedAt: new Date("2026-10-01"), provider: "XERO", name: "Our company", icon: null, config: null, status: "CONNECTED", tenantId: "T1", accessToken: "cipher:fresh", refreshToken: "cipher:r", tokenExpiresAt: new Date("2099-01-01") };
  mocks.updateMany.mockImplementation(async ({ where, data }) => {
    if (!Object.entries(where).every(([key, value]) => value instanceof Date ? +state.row[key] === +value : state.row[key] === value)) return { count: 0 };
    Object.assign(state.row, data); return { count: 1 };
  });
  mocks.refresh.mockImplementation(async () => { state.row.accessToken = "cipher:refreshed"; });
});
describe("getValidXeroAccessToken", () => {
  it.each([
    { provider: "XERO", name: "OpenAI GPT", icon: "[ra:ai]" },
    { provider: "QUICKBOOKS", name: "Company accounts", icon: null },
  ])("rejects invalid identities before decrypt: $name", async identity => {
    Object.assign(state.row, identity);
    await expect(getValidXeroAccessToken("int-1")).resolves.toMatchObject({ ok: false, reason: "INVALID_INTEGRATION" });
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it.each([
    { expectedTenantId: "other" }, { expectedUserId: "other" }, { expectedWorkspaceId: "workspace" },
  ])("rejects changed context before decrypt: %j", async expected => {
    await expect(getValidXeroAccessToken("int-1", expected)).resolves.toMatchObject({ ok: false, reason: "BINDING_CHANGED" });
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("returns a fresh token for the exact personal binding", async () => {
    await expect(getValidXeroAccessToken("int-1", { expectedTenantId: "T1", expectedUserId: "owner", expectedWorkspaceId: null })).resolves.toEqual({ ok: true, data: "fresh" });
  });
  it("forces refresh after rejection of an unexpired token", async () => {
    await expect(getValidXeroAccessToken("int-1", { forceRefresh: true })).resolves.toEqual({ ok: true, data: "refreshed" });
    expect(mocks.refresh).toHaveBeenCalledWith({ expectedUserId: "owner", expectedWorkspaceId: null });
  });
  it.each([null, "DISCONNECTED"])("returns DISCONNECTED for missing credentials or pending status %s", async variant => {
    Object.assign(state.row, variant === null ? { accessToken: null } : { status: variant });
    await expect(getValidXeroAccessToken("int-1")).resolves.toMatchObject({ ok: false, reason: "DISCONNECTED" });
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it("returns RECONNECT_REQUIRED for an expired token without refresh", async () => {
    Object.assign(state.row, { tokenExpiresAt: new Date("2020-01-01"), refreshToken: null });
    await expect(getValidXeroAccessToken("int-1")).resolves.toMatchObject({ ok: false, reason: "RECONNECT_REQUIRED" });
    expect(state.row.status).toBe("ERROR");
  });
  it("refreshes before expiry inside the five-minute window", async () => {
    state.row.tokenExpiresAt = new Date(Date.now() + 60_000);
    await expect(getValidXeroAccessToken("int-1")).resolves.toEqual({ ok: true, data: "refreshed" });
  });
  it("reports refresh failure with a secret-free message and preserves its cause", async () => {
    const original = new Error("synthetic provider body"); mocks.refresh.mockRejectedValueOnce(original);
    const result = await getValidXeroAccessToken("int-1", { forceRefresh: true });
    expect(result).toMatchObject({ ok: false, reason: "REFRESH_FAILED", cause: original });
    if (!result.ok) expect(result.detail).not.toContain("provider body");
  });
  it("refuses a disconnected binding after refresh resolves", async () => {
    mocks.refresh.mockImplementationOnce(async () => { state.row.accessToken = null; });
    await expect(getValidXeroAccessToken("int-1", { forceRefresh: true })).resolves.toMatchObject({ ok: false, reason: "DISCONNECTED" });
  });
  it("refuses another tenant or workspace replacing the row during refresh", async () => {
    mocks.refresh.mockImplementationOnce(async () => { state.row.workspaceId = "other-workspace"; });
    await expect(getValidXeroAccessToken("int-1", { forceRefresh: true })).resolves.toMatchObject({ ok: false, reason: "BINDING_CHANGED" });
  });
});
