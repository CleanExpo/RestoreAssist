import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const {
  costLibraryFindFirst,
  costLibraryCreate,
  costItemFindFirst,
  costItemFindMany,
  costItemCreate,
  costItemUpdate,
} = vi.hoisted(() => ({
  costLibraryFindFirst: vi.fn(),
  costLibraryCreate: vi.fn(),
  costItemFindFirst: vi.fn(),
  costItemFindMany: vi.fn(),
  costItemCreate: vi.fn(),
  costItemUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    costLibrary: {
      findFirst: costLibraryFindFirst,
      create: costLibraryCreate,
    },
    costItem: {
      findFirst: costItemFindFirst,
      findMany: costItemFindMany,
      create: costItemCreate,
      update: costItemUpdate,
    },
  },
}));

import { getServerSession } from "next-auth";
import { POST as promotePOST } from "../promote/route";
import { GET as searchGET } from "../search/route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
});

describe("POST /api/cost-libraries/promote", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await promotePOST(
      new NextRequest("http://localhost/api/cost-libraries/promote", {
        method: "POST",
        body: JSON.stringify({
          category: "Labour",
          description: "Tech hour",
          rate: 65,
          unit: "hr",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 422 for invalid payload", async () => {
    const res = await promotePOST(
      new NextRequest("http://localhost/api/cost-libraries/promote", {
        method: "POST",
        body: JSON.stringify({ category: "", description: "x", rate: -1 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(422);
  });

  it("creates My Library when none exists, then creates item", async () => {
    costLibraryFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    costLibraryCreate.mockResolvedValue({ id: "lib_1" });
    costItemFindFirst.mockResolvedValue(null);
    costItemCreate.mockResolvedValue({
      id: "item_1",
      category: "Labour",
      description: "Tech hour",
      rate: 65,
      unit: "hr",
    });

    const res = await promotePOST(
      new NextRequest("http://localhost/api/cost-libraries/promote", {
        method: "POST",
        body: JSON.stringify({
          category: "Labour",
          description: "Tech hour",
          rate: 65,
          unit: "hr",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    expect(costLibraryCreate).toHaveBeenCalled();
    expect(costItemCreate).toHaveBeenCalled();
  });

  it("updates existing item instead of duplicating", async () => {
    costLibraryFindFirst.mockResolvedValue({ id: "lib_1" });
    costItemFindFirst.mockResolvedValue({ id: "item_1" });
    costItemUpdate.mockResolvedValue({
      id: "item_1",
      category: "Labour",
      description: "Tech hour",
      rate: 70,
      unit: "hr",
    });

    const res = await promotePOST(
      new NextRequest("http://localhost/api/cost-libraries/promote", {
        method: "POST",
        body: JSON.stringify({
          category: "Labour",
          description: "Tech hour",
          rate: 70,
          unit: "hr",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    expect(costItemUpdate).toHaveBeenCalled();
    expect(costItemCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/cost-libraries/search", () => {
  it("returns empty items when q shorter than 2 chars", async () => {
    const res = await searchGET(
      new NextRequest("http://localhost/api/cost-libraries/search?q=a"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
    expect(costItemFindMany).not.toHaveBeenCalled();
  });

  it("scopes search to the signed-in user's libraries", async () => {
    costItemFindMany.mockResolvedValue([
      {
        id: "item_1",
        category: "Labour",
        description: "Technician hour",
        rate: 65,
        unit: "hr",
        libraryId: "lib_1",
      },
    ]);
    const res = await searchGET(
      new NextRequest(
        "http://localhost/api/cost-libraries/search?q=tech&limit=10",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(costItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          library: { userId: "u_1" },
        }),
        take: 10,
      }),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await searchGET(
      new NextRequest("http://localhost/api/cost-libraries/search?q=ab"),
    );
    expect(res.status).toBe(401);
  });
});
