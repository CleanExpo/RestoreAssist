import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const session = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
vi.mock("next-auth", () => ({ getServerSession: session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { client: { findFirst, create } } }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (request: NextRequest, _userId: string, handler: (body: string) => Promise<Response>) =>
    handler(await request.text()),
}));

import { POST } from "../route";

const request = (notes: string) => new NextRequest("http://localhost/api/clients", {
  method: "POST",
  body: JSON.stringify({ name: "Client One", email: "client@example.test", notes }),
});

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "owner-1" } });
  findFirst.mockResolvedValue(null);
  create.mockImplementation(async ({ data }: { data: { notes: string } }) => ({
    id: "client-1", ...data, _count: { reports: 0 },
  }));
});

describe("Client Notes creation contract", () => {
  it("preserves supported notes exactly", async () => {
    const notes = "x".repeat(4_997) + "A&B";
    const res = await POST(request(notes));
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0].data.notes).toBe(notes);
  });

  it("rejects oversized notes before creating a client", async () => {
    const res = await POST(request("x".repeat(5_001)));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields.notes).toContain("5,000");
    expect(create).not.toHaveBeenCalled();
  });
});
