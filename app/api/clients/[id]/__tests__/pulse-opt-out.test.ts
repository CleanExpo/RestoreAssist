import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  session: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: h.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { client: { findFirst: h.findFirst, update: h.update } },
}));

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
});

const written = () => h.update.mock.calls[0][0].data;

describe("contractor control of the client's opt-out", () => {
  it("records a withdrawal the contractor was told about", async () => {
    const res = await put({ pulseOptOut: true });

    expect(res.status).toBe(200);
    expect(written().pulseOptOut).toBe(true);
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
