import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hasAnyOAuthIntegration, selectOAuthIntegrationForRequest } from "../select-oauth-request";

const xero = { id: "row_a", userId: "owner", workspaceId: null, provider: "XERO", name: "Xero", icon: null, tenantId: "org", realmId: null, companyId: null, tokenExpiresAt: null, status: "CONNECTED", config: null };
function db(rows: unknown[]) {
  return { integration: { findMany: vi.fn().mockResolvedValue(rows), findFirst: vi.fn().mockResolvedValue({ id: "row_a" }) } };
}
const req = (query = "") => new NextRequest(`http://localhost/api/integrations/oauth/xero/sync${query}`, { method: "POST", body: "{}" });

describe("selectOAuthIntegrationForRequest (RA-8439)", () => {
  it("passes the query id to the selection, still scoped to the user and workspace", async () => {
    const prisma = db([xero]);
    const result = await selectOAuthIntegrationForRequest(req("?integrationId=row_a"), { prisma: prisma as never, userId: "owner", provider: "XERO", workspaceId: null });
    expect(result).toEqual({ integration: xero });
    expect(prisma.integration.findMany.mock.calls[0][0].where).toMatchObject({ id: "row_a", userId: "owner", provider: "XERO", workspaceId: null });
  });

  it("leaves the request body unread so the route can still parse it", async () => {
    const request = req();
    await selectOAuthIntegrationForRequest(request, { prisma: db([xero]) as never, userId: "owner", provider: "XERO" });
    expect(request.bodyUsed).toBe(false);
  });

  it("names the field in the ambiguity 409", async () => {
    const result = await selectOAuthIntegrationForRequest(req(), { prisma: db([xero, { ...xero, id: "row_b" }]) as never, userId: "owner", provider: "XERO" });
    expect(result.response?.status).toBe(409);
    const body = await result.response!.json();
    expect(body.error.message).toContain("integrationId");
    expect(body.error.fields).toHaveProperty("integrationId");
  });

  it("returns null when nothing exists and no id was named, but 404 for a named id that is not found", async () => {
    expect(await selectOAuthIntegrationForRequest(req(), { prisma: db([]) as never, userId: "owner", provider: "XERO" })).toEqual({ integration: null });
    const named = await selectOAuthIntegrationForRequest(req("?integrationId=missing"), { prisma: db([]) as never, userId: "owner", provider: "XERO" });
    expect(named.response?.status).toBe(404);
  });

  it("rejects a malformed id before any database read", async () => {
    const prisma = db([xero]);
    const result = await selectOAuthIntegrationForRequest(req("?integrationId=a%20b"), { prisma: prisma as never, userId: "owner", provider: "XERO" });
    expect(result.response?.status).toBe(400);
    expect(prisma.integration.findMany).not.toHaveBeenCalled();
  });

  it("reports any existing row, including an ambiguous pair", async () => {
    expect(await hasAnyOAuthIntegration({ prisma: db([]) as never, userId: "owner", provider: "XERO" })).toBe(false);
    expect(await hasAnyOAuthIntegration({ prisma: db([xero, { ...xero, id: "row_b" }]) as never, userId: "owner", provider: "XERO" })).toBe(true);
  });
});
