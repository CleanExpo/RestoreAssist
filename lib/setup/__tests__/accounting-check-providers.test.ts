import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock every module checks.ts imports at top-level so importing accountingCheck
// pulls in no real DB client, credential vault, or provider SDK.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    integration: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/credential-vault", () => ({ decrypt: vi.fn() }));
vi.mock("@/lib/ai/model-router", () => ({ routeBasic: vi.fn() }));
vi.mock("@/lib/generate-iicrc-report-pdf", () => ({
  generateIICRCReportPDF: vi.fn(),
}));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
  listProviderConnections: vi.fn(),
  validateProviderKey: vi.fn(),
  OPERATING_PROVIDERS: ["ANTHROPIC", "OPENAI", "OPENROUTER"],
}));
vi.mock("@/lib/services/xero/credentials", () => ({
  getValidXeroAccessToken: vi.fn(),
}));
vi.mock("@/lib/services/quickbooks/credentials", () => ({
  getValidQuickBooksAccessToken: vi.fn(),
}));
vi.mock("@/lib/services/myob/credentials", () => ({
  getValidMYOBAccessToken: vi.fn(),
}));

import { accountingCheck } from "../checks";
import { prisma } from "@/lib/prisma";
import { getValidXeroAccessToken } from "@/lib/services/xero/credentials";
import { getValidQuickBooksAccessToken } from "@/lib/services/quickbooks/credentials";
import { getValidMYOBAccessToken } from "@/lib/services/myob/credentials";

const orgFindUnique = prisma.organization.findUnique as ReturnType<typeof vi.fn>;
const integrationFindFirst = prisma.integration.findFirst as ReturnType<
  typeof vi.fn
>;
const xeroToken = getValidXeroAccessToken as ReturnType<typeof vi.fn>;
const qboToken = getValidQuickBooksAccessToken as ReturnType<typeof vi.fn>;
const myobToken = getValidMYOBAccessToken as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  orgFindUnique.mockResolvedValue({ ownerId: "u1" });
});

describe("accountingCheck — multi-provider day-1 readiness", () => {
  it("yellow when no bookkeeping integration is connected", async () => {
    integrationFindFirst.mockResolvedValue(null);
    const r = await accountingCheck("o1");
    expect(r.status).toBe("yellow");
    // The query considers all three providers, not just Xero.
    expect(integrationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "CONNECTED",
          provider: { in: ["XERO", "QUICKBOOKS", "MYOB"] },
        }),
      }),
    );
  });

  it("green when QuickBooks is connected and its token is valid", async () => {
    integrationFindFirst.mockResolvedValue({ id: "int-qbo", provider: "QUICKBOOKS" });
    qboToken.mockResolvedValue({ ok: true, data: "qbo-token" });
    const r = await accountingCheck("o1");
    expect(r.status).toBe("green");
    expect(r.note).toMatch(/quickbooks connected/i);
    expect(qboToken).toHaveBeenCalledWith("int-qbo");
    // Wrong-provider helpers are never called.
    expect(xeroToken).not.toHaveBeenCalled();
    expect(myobToken).not.toHaveBeenCalled();
  });

  it("red when QuickBooks needs reconnect", async () => {
    integrationFindFirst.mockResolvedValue({ id: "int-qbo", provider: "QUICKBOOKS" });
    qboToken.mockResolvedValue({ ok: false, reason: "RECONNECT_REQUIRED" });
    const r = await accountingCheck("o1");
    expect(r.status).toBe("red");
    expect(r.note).toMatch(/quickbooks reconnect required/i);
  });

  it("green when MYOB is connected and its token is valid", async () => {
    integrationFindFirst.mockResolvedValue({ id: "int-myob", provider: "MYOB" });
    myobToken.mockResolvedValue({ ok: true, data: "myob-token" });
    const r = await accountingCheck("o1");
    expect(r.status).toBe("green");
    expect(r.note).toMatch(/myob connected/i);
  });

  it("green when Xero is connected, token valid, and /connections responds 200", async () => {
    integrationFindFirst.mockResolvedValue({ id: "int-xero", provider: "XERO" });
    xeroToken.mockResolvedValue({ ok: true, data: "xero-token" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const r = await accountingCheck("o1");
    expect(r.status).toBe("green");
    expect(r.note).toMatch(/xero connected/i);
  });

  it("red when the Xero token is rejected (401) by /connections", async () => {
    integrationFindFirst.mockResolvedValue({ id: "int-xero", provider: "XERO" });
    xeroToken.mockResolvedValue({ ok: true, data: "stale" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const r = await accountingCheck("o1");
    expect(r.status).toBe("red");
    expect(r.note).toMatch(/token rejected/i);
  });
});
