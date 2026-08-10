import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetServerSession = vi.fn();
const mockFindFirst = vi.fn();
const mockTransaction = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => mockGetServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));

import { GET, POST } from "../route";

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost:3001/api/inspections/i1/classification", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("classification route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
  });

  it("GET returns null classification when none exist", async () => {
    mockFindFirst.mockResolvedValue({
      id: "i1",
      status: "DRAFT",
      inspectionNumber: "NIR-1",
      classifications: [],
      affectedAreas: [],
      waterDamageClassification: null,
    });
    const res = await GET(req("GET"), {
      params: Promise.resolve({ id: "i1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.classification).toBeNull();
  });

  it("POST persists category/class and upserts water damage gates", async () => {
    mockFindFirst.mockResolvedValue({
      id: "i1",
      claimType: null,
      photos: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
    });

    const created = {
      id: "c1",
      category: "2",
      class: "3",
      justification: "Grey water from dishwasher",
      standardReference: "IICRC S500:2021 §7.1 (technician recorded)",
      confidence: 100,
      isFinal: true,
    };

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        classification: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue(created),
        },
        waterDamageClassification: {
          upsert: vi.fn().mockResolvedValue({}),
        },
        inspection: {
          update: vi.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });

    const res = await POST(
      req("POST", {
        category: "2",
        class: "3",
        justification: "Grey water from dishwasher",
      }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.classification.category).toBe("2");
    expect(json.classification.class).toBe("3");
  });
});
