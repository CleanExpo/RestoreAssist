import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  session: vi.fn(),
  recordPulseOptOut: vi.fn(),
  recordPulseAddressLock: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: h.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { client: { findFirst: h.findFirst, update: h.update } },
}));
vi.mock("@/lib/pulse/opt-out", () => ({
  recordPulseOptOut: h.recordPulseOptOut,
  recordPulseAddressLock: h.recordPulseAddressLock,
}));
vi.mock("@/lib/integrations/zoho/queue", () => ({
  scheduleZohoCustomerPush: vi.fn(),
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { PUT } from "../route";

const put = (body: Record<string, unknown>) =>
  PUT(
    new NextRequest("https://app.example.test/api/clients/client_a", {
      method: "PUT",
      body: JSON.stringify({
        name: "Pat",
        email: "pat@example.test",
        status: "ACTIVE",
        ...body,
      }),
    }),
    { params: Promise.resolve({ id: "client_a" }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.session.mockResolvedValue({ user: { id: "owner_1" } });
  h.findFirst.mockResolvedValue({
    id: "client_a",
    email: "pat@example.test",
    pulseOptOut: false,
  });
  h.update.mockResolvedValue({ id: "client_a", _count: { reports: 0 } });
  h.recordPulseOptOut.mockResolvedValue({
    records: 1,
    organizationId: "org_1",
  });
  h.recordPulseAddressLock.mockResolvedValue({
    organizationId: "org_1",
    addressTag: "tag",
  });
});

const written = () => h.update.mock.calls[0][0].data;

describe("contractor control of the client's opt-out", () => {
  it("records a withdrawal the contractor was told about", async () => {
    const res = await put({ pulseOptOut: true });

    expect(res.status).toBe(200);
    expect(written().pulseOptOut).toBe(true);
    expect(h.recordPulseOptOut).toHaveBeenCalledWith({
      clientId: "client_a",
      ownerUserId: "owner_1",
      email: "pat@example.test",
      optOutNamedClient: true,
    });
  });

  it("cannot clear a withdrawal", async () => {
    h.findFirst.mockResolvedValue({
      id: "client_a",
      email: "pat@example.test",
      pulseOptOut: true,
    });

    const res = await put({ pulseOptOut: false });

    expect(res.status).toBe(200);
    expect(written()).not.toHaveProperty("pulseOptOut");
    expect(h.recordPulseOptOut).not.toHaveBeenCalled();
  });

  it("locks the old address when an opted-out client's email is replaced", async () => {
    h.findFirst.mockImplementation(async ({ where }: { where: { id?: string | { not: string } } }) => {
      if (where.id && typeof where.id === "object") return null;
      return {
        id: "client_a",
        email: "old@example.test",
        pulseOptOut: true,
      };
    });

    const res = await put({ email: "new@example.test" });

    expect(res.status).toBe(200);
    expect(h.recordPulseAddressLock).toHaveBeenCalledWith({
      ownerUserId: "owner_1",
      email: "old@example.test",
      sourceClientId: "client_a",
    });
    expect(written().email).toBe("new@example.test");
    expect(written()).not.toHaveProperty("pulseOptOut");
  });

  it("does not report success when the address lock cannot be written", async () => {
    h.recordPulseOptOut.mockRejectedValue(
      new Error("Pulse address lock could not be written"),
    );

    const res = await put({ pulseOptOut: true });

    expect(res.status).not.toBe(200);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("does not report success when replacing an opted-out email cannot lock the old address", async () => {
    h.findFirst.mockImplementation(async ({ where }: { where: { id?: string | { not: string } } }) => {
      if (where.id && typeof where.id === "object") return null;
      return {
        id: "client_a",
        email: "old@example.test",
        pulseOptOut: true,
      };
    });
    h.recordPulseAddressLock.mockRejectedValue(
      new Error("Pulse address lock could not be written"),
    );

    const res = await put({ email: "new@example.test" });

    expect(res.status).not.toBe(200);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("leaves it alone when the field is omitted", async () => {
    await put({});

    expect(written()).not.toHaveProperty("pulseOptOut");
  });

  it("does not treat a truthy string as a withdrawal", async () => {
    await put({ pulseOptOut: "true" });

    expect(written()).not.toHaveProperty("pulseOptOut");
  });
});
