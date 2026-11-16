/**
 * RA-8404 — editing any client field must not rewrite the client's email.
 * Before the fix a name-only edit stored `o&#x27;connor@...`, which no longer
 * matched the address the client was created with.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), session: vi.fn() }));

vi.mock("next-auth", () => ({ getServerSession: h.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    client: { findFirst: h.findFirst, update: h.update },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ client: { findFirst: h.findFirst, update: h.update } }),
  },
}));
vi.mock("@/lib/pulse/opt-out", () => ({
  recordPulseOptOut: vi.fn(),
  recordPulseAddressLock: vi.fn(),
}));
vi.mock("@/lib/integrations/zoho/queue", () => ({ scheduleZohoCustomerPush: vi.fn() }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { PUT } from "../route";

const STORED = "o'connor@acme-restoration.com.au";
const existing = {
  id: "client-1",
  userId: "owner-1",
  name: "Old Name",
  email: STORED,
  phone: "",
  address: "",
  company: "",
  contactPerson: "",
  notes: "",
  status: "ACTIVE",
  pulseOptOut: false,
  _count: { reports: 0 },
};

const put = (email: string) =>
  PUT(
    new NextRequest("http://localhost/api/clients/client-1", {
      method: "PUT",
      body: JSON.stringify({ ...existing, name: "New Name", email }),
    }),
    { params: Promise.resolve({ id: "client-1" }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.session.mockResolvedValue({ user: { id: "owner-1" } });
  h.findFirst.mockImplementation(async ({ where }: { where: { id?: string } }) =>
    where.id === "client-1" ? existing : null,
  );
  h.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...existing,
    ...data,
  }));
});

describe("RA-8404 client edit keeps the email as created", () => {
  it("a name-only edit leaves o'connor@... unchanged", async () => {
    const res = await put(STORED);
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0][0].data.email).toBe(STORED);
    expect(h.update.mock.calls[0][0].data.name).toBe("New Name");
  });

  it("refuses markup in the email with 400 and writes nothing", async () => {
    const res = await put("<b>x</b>@acme-restoration.com.au");
    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });
});
