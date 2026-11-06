import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  send: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("next-auth", () => ({ getServerSession: h.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/entitlements", () => ({
  requireAddonForResource: async () => ({ allowed: true }),
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/organization-credits", () => ({
  getResourceTenant: vi.fn(async () => ({
    ownerId: "owner_1",
    organizationId: "org_sent",
  })),
}));
vi.mock("@/lib/email", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/email")>()),
  sendPulseUpdateEmail: h.send,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: h.findFirst,
      findUnique: h.findUnique,
      updateMany: h.updateMany,
    },
    reportApproval: { findMany: async () => [] },
    client: { findFirst: async () => null, findMany: async () => [] },
    user: { findMany: async () => [] },
    organization: { findUnique: async () => null, findMany: async () => [] },
    pulseOrgAddressOptOut: {
      findUnique: async () => null,
      findFirst: async () => null,
    },
    auditLog: { create: async () => ({}) },
    clientCommsLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `log_${h.rows.length + 1}` };
        h.rows.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = h.rows.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
    },
  },
}));

import { POST } from "../route";

const accept = () =>
  POST(
    new NextRequest("https://app.example.test/api/inspections/insp_1/accept", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "insp_1" }) },
  );

/** The hook is fire-and-forget, so wait for the row it settles on. */
const settled = () =>
  vi.waitFor(() => {
    expect(h.rows[0]?.status).toMatch(/SENT|SUPPRESSED/);
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.rows.length = 0;
  process.env.MAILTRAP_API_KEY = "sink-not-a-real-key";
  process.env.SENDER_EMAIL = "updates@example.test";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.PORTAL_SECRET = "test-secret";
  h.session.mockResolvedValue({ user: { id: "owner_1" } });
  h.findFirst.mockResolvedValue({ status: "DRAFT" });
  h.updateMany.mockResolvedValue({ count: 1 });
  h.findUnique.mockResolvedValue({
    id: "insp_1",
    userId: "owner_1",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    status: "PROCESSING",
    pulseEnabled: true,
    report: {
      id: "rep_1",
      status: "DRAFT",
      client: {
        id: "client_a",
        email: "homeowner@example.test",
        pulseOptOut: false,
        portalAccounts: [],
      },
    },
    client: null,
  });
});

describe("a real route changing status", () => {
  it("emails the client once after the change", async () => {
    h.send.mockResolvedValue("msg_1");

    const res = await accept();
    await settled();

    expect(res.status).toBe(200);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0][0].to).toBe("homeowner@example.test");
  });

  it("keeps the status change when the send fails", async () => {
    h.send.mockRejectedValue(new Error("mailtrap down"));

    const res = await accept();
    await settled();

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("PROCESSING");
    expect(h.updateMany).toHaveBeenCalledTimes(1);
    expect(h.rows[0].suppressionReason).toBe("SEND_FAILED");
  });

  it("keeps the status change when the email check itself blows up", async () => {
    h.findUnique.mockRejectedValue(new Error("db blip"));

    const res = await accept();

    expect(res.status).toBe(200);
    expect(h.updateMany).toHaveBeenCalledTimes(1);
    expect(h.send).not.toHaveBeenCalled();
  });
});
