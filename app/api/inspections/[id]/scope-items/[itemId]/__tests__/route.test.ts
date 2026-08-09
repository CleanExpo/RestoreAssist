import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { inspectionFindFirst, scopeItemFindFirst, scopeItemUpdate } = vi.hoisted(
  () => ({
    inspectionFindFirst: vi.fn(),
    scopeItemFindFirst: vi.fn(),
    scopeItemUpdate: vi.fn(),
  }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: inspectionFindFirst },
    scopeItem: {
      findFirst: scopeItemFindFirst,
      update: scopeItemUpdate,
    },
  },
}));

import { getServerSession } from "next-auth";
import { PATCH } from "../route";

const mockSession = vi.mocked(getServerSession);
const context = {
  params: Promise.resolve({ id: "inspection-1", itemId: "scope-1" }),
};

function patchRequest(body?: string) {
  return new NextRequest(
    "http://localhost/api/inspections/inspection-1/scope-items/scope-1",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body } : {}),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "user-1" } } as never);
  inspectionFindFirst.mockResolvedValue({ id: "inspection-1" });
  scopeItemFindFirst.mockResolvedValue({ id: "scope-1" });
  scopeItemUpdate.mockResolvedValue({
    id: "scope-1",
    specification: "Place behind skirting",
  });
});

describe("PATCH inspection scope item", () => {
  it("persists specification inside the owned inspection", async () => {
    const response = await PATCH(
      patchRequest(JSON.stringify({ specification: "Place behind skirting" })),
      context,
    );

    expect(response.status).toBe(200);
    expect(inspectionFindFirst).toHaveBeenCalledWith({
      where: { id: "inspection-1", userId: "user-1" },
    });
    expect(scopeItemFindFirst).toHaveBeenCalledWith({
      where: { id: "scope-1", inspectionId: "inspection-1" },
      select: { id: true },
    });
    expect(scopeItemUpdate).toHaveBeenCalledWith({
      where: {
        id: "scope-1",
        inspectionId: "inspection-1",
        inspection: { userId: "user-1" },
      },
      data: { specification: "Place behind skirting" },
    });
  });

  it("allows specification to be cleared with null", async () => {
    const response = await PATCH(
      patchRequest(JSON.stringify({ specification: null })),
      context,
    );

    expect(response.status).toBe(200);
    expect(scopeItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { specification: null } }),
    );
  });

  it.each([
    ["invalid JSON", "{"],
    ["an empty body", undefined],
    ["an empty object", JSON.stringify({})],
  ])("returns 400 for %s", async (_label, body) => {
    const response = await PATCH(patchRequest(body), context);

    expect(response.status).toBe(400);
    expect(scopeItemUpdate).not.toHaveBeenCalled();
  });

  it.each([[42], ["x".repeat(2001)]])(
    "rejects invalid specification %p",
    async (specification) => {
      const response = await PATCH(
        patchRequest(JSON.stringify({ specification })),
        context,
      );

      expect(response.status).toBe(400);
      expect(scopeItemUpdate).not.toHaveBeenCalled();
    },
  );
});
