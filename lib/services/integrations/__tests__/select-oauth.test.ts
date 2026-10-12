import { describe, expect, it, vi } from "vitest";
import { selectOAuthIntegration } from "../select-oauth";

const xero = { id: "real", userId: "owner", workspaceId: null, provider: "XERO", name: "Our accounts", icon: null, tenantId: "org", status: "CONNECTED", config: null };
const ai = { ...xero, id: "ai", name: "OpenAI GPT", icon: "[ra:ai]", tenantId: null };
function db(rows: unknown[], credential = true) {
  return { integration: { findMany: vi.fn().mockResolvedValue(rows), findFirst: vi.fn().mockResolvedValue(credential ? { id: "real" } : null) } };
}
describe("owned OAuth selection", () => {
  it("rejects an AI-only legacy XERO row without credential reads", async () => {
    const prisma = db([ai]);
    expect(await selectOAuthIntegration({ prisma: prisma as never, userId: "owner", provider: "XERO", requireReady: true })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(prisma.integration.findFirst).not.toHaveBeenCalled();
  });
  it("selects the genuine provider among both AI vendors without mutating them", async () => {
    const prisma = db([ai, { ...ai, name: "Anthropic Claude" }, xero]);
    const result = await selectOAuthIntegration({ prisma: prisma as never, userId: "owner", provider: "XERO", requireReady: true, workspaceId: null });
    expect(result).toEqual({ ok: true, data: xero });
    expect(prisma.integration.findMany.mock.calls[0][0].where).toMatchObject({ userId: "owner", provider: "XERO", workspaceId: null });
    expect(prisma.integration.findFirst.mock.calls[0][0].select).toEqual({ id: true });
  });
  it.each([[[xero, { ...xero, id: "other", workspaceId: "other-workspace" }]], [Array.from({ length: 101 }, () => ai)]])("refuses ambiguous or truncated candidate sets", async rows => {
    expect(await selectOAuthIntegration({ prisma: db(rows) as never, userId: "owner", provider: "XERO" })).toEqual({ ok: false, reason: "AMBIGUOUS" });
  });
  it("requires organisation and credentials before sync", async () => {
    expect(await selectOAuthIntegration({ prisma: db([{ ...xero, name: "Xero", tenantId: null }]) as never, userId: "owner", provider: "XERO", requireReady: true })).toMatchObject({ reason: "NOT_READY", detail: "ORGANISATION_REQUIRED" });
    expect(await selectOAuthIntegration({ prisma: db([xero], false) as never, userId: "owner", provider: "XERO", requireReady: true })).toMatchObject({ reason: "NOT_READY", detail: "CREDENTIALS_REQUIRED" });
  });
  it("connects pending canonical records and refuses generic Ascora", async () => {
    const pending = { ...xero, name: "Xero", tenantId: null, status: "DISCONNECTED" };
    expect(await selectOAuthIntegration({ prisma: db([pending]) as never, userId: "owner", provider: "XERO" })).toEqual({ ok: true, data: pending });
    const prisma = db([]);
    expect(await selectOAuthIntegration({ prisma: prisma as never, userId: "owner", provider: "ASCORA" })).toEqual({ ok: false, reason: "INVALID_PROVIDER" });
    expect(prisma.integration.findMany).not.toHaveBeenCalled();
  });
});
