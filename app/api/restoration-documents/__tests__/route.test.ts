import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { findMany, create } = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    restorationDocument: { findMany, create },
  },
}));

import { getServerSession } from "next-auth";
import { GET, POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
});

describe("GET /api/restoration-documents", () => {
  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest("http://localhost/api/restoration-documents"),
    );
    expect(res.status).toBe(401);
  });

  it("lists docs for the session user with take cap", async () => {
    findMany.mockResolvedValue([
      {
        id: "d1",
        documentType: "ESTIMATE",
        documentNumber: "QTE-1",
        title: "Quote",
        reportId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await GET(
      new NextRequest(
        "http://localhost/api/restoration-documents?documentType=ESTIMATE",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.documents).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u_1", documentType: "ESTIMATE" },
        take: 50,
      }),
    );
  });
});

describe("POST /api/restoration-documents", () => {
  it("422/400 when required fields missing", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/restoration-documents", {
        method: "POST",
        body: JSON.stringify({ documentType: "ESTIMATE" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates ESTIMATE document from quote payload", async () => {
    create.mockResolvedValue({
      id: "d_new",
      documentType: "ESTIMATE",
      documentNumber: "QTE-ABCD-1",
      title: "Water quote",
      data: { source: "quote_generator" },
    });
    const res = await POST(
      new NextRequest("http://localhost/api/restoration-documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "ESTIMATE",
          documentNumber: "QTE-ABCD-1",
          title: "Water quote",
          data: { source: "quote_generator", quote: { totalIncGST: 3025 } },
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u_1",
          documentType: "ESTIMATE",
        }),
      }),
    );
  });
});
