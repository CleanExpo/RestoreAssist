import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const session = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
vi.mock("next-auth", () => ({ getServerSession: session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { client: { findFirst, update } },
}));

import { GET, PUT } from "../route";

const params = { params: Promise.resolve({ id: "client-1" }) };
const body = (notes: string) => ({
  name: "Client One",
  email: "client@example.test",
  phone: "",
  address: "",
  company: "",
  contactPerson: "",
  notes,
  status: "ACTIVE",
});
const put = (notes: string) => new NextRequest("http://localhost/api/clients/client-1", {
  method: "PUT",
  body: JSON.stringify(body(notes)),
});

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "owner-1" } });
  findFirst.mockResolvedValue({ ...body(""), id: "client-1", userId: "owner-1", reports: [], _count: { reports: 0 } });
  update.mockImplementation(async ({ data }: { data: { notes: string } }) => ({
    ...body(data.notes), id: "client-1", userId: "owner-1", _count: { reports: 0 },
  }));
});

describe("Client Notes persistence contract", () => {
  it("accepts exactly 5,000 characters without slicing or HTML entity encoding", async () => {
    const notes = "x".repeat(4_997) + "A&B";
    const res = await PUT(put(notes), params);

    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data.notes).toBe(notes);
    expect((await res.json()).notes).toBe(notes);
  });

  it("rejects 5,001 characters clearly before any write", async () => {
    const res = await PUT(put("x".repeat(5_001)), params);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({
      code: "VALIDATION",
      fields: { notes: expect.stringContaining("5,000") },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("returns the same ampersand through save, reload, and repeated save", async () => {
    const notes = "R&D &amp; the literal entity <b>is text</b>";
    const first = await PUT(put(notes), params);
    const saved = (await first.json()).notes as string;
    findFirst.mockResolvedValue({ ...body(saved), id: "client-1", userId: "owner-1", reports: [], _count: { reports: 0 } });

    const reloaded = await GET(new NextRequest("http://localhost/api/clients/client-1"), params);
    expect(reloaded.status).toBe(200);
    const second = await PUT(put((await reloaded.json()).notes), params);
    expect(second.status).toBe(200);
    expect(update.mock.calls[0][0].data.notes).toBe(notes);
    expect(update.mock.calls[1][0].data.notes).toBe(notes);
  });
});
