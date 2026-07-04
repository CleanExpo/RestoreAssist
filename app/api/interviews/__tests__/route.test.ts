import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const interviewFindMany = vi.fn();
const interviewCount = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    interviewSession: {
      findMany: (...args: unknown[]) => interviewFindMany(...args),
      count: (...args: unknown[]) => interviewCount(...args),
    },
  },
}));

import { GET } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  interviewFindMany.mockReset();
  interviewCount.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  userFindUnique.mockResolvedValue({ id: "user_1" });
  interviewFindMany.mockResolvedValue([]);
  interviewCount.mockResolvedValue(0);
});

function listRequest(query = "") {
  return new NextRequest(`http://localhost/api/interviews${query}`);
}

describe("GET /api/interviews pagination clamp", () => {
  it("caps limit at 100 so ?limit=999999 cannot fetch unbounded rows", async () => {
    await GET(listRequest("?limit=999999"));

    const args = interviewFindMany.mock.calls[0][0];
    expect(args.take).toBe(100);
    expect(args.skip).toBe(0);
  });

  it("floors a non-numeric limit to the default and never yields NaN take", async () => {
    await GET(listRequest("?limit=abc"));

    const args = interviewFindMany.mock.calls[0][0];
    expect(args.take).toBe(20);
    expect(Number.isNaN(args.take)).toBe(false);
  });

  it("floors zero/negative page so skip is never negative (Prisma rejects negative skip)", async () => {
    await GET(listRequest("?page=-5&limit=10"));

    const args = interviewFindMany.mock.calls[0][0];
    expect(args.skip).toBe(0);
    expect(args.take).toBe(10);
  });

  it("honours valid page/limit within bounds", async () => {
    await GET(listRequest("?page=3&limit=25"));

    const args = interviewFindMany.mock.calls[0][0];
    expect(args.skip).toBe(50);
    expect(args.take).toBe(25);
  });
});
