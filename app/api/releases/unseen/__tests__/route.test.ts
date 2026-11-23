/**
 * RA-8607 — the "What's New" popup must never show a release whose notes are
 * still the placeholder or whose notes job failed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { appRelease: { findFirst: (...a: unknown[]) => findFirst(...a) } },
}));

vi.mock("@/lib/auth/get-api-session", () => ({
  getApiSession: async () => ({ user: { id: "user_1" } }),
}));

vi.mock("@/lib/api-errors", () => ({
  apiError: () => new Response("{}", { status: 401 }),
  fromException: () => new Response("{}", { status: 500 }),
}));

import { GET } from "../route";
import {
  RELEASE_NOTES_FAILED,
  RELEASE_NOTES_PENDING,
} from "@/lib/releases/release-state";

beforeEach(() => {
  findFirst.mockReset();
  findFirst.mockResolvedValue(null);
});

describe("GET /api/releases/unseen (RA-8607)", () => {
  it("excludes releases whose notes are pending or failed", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/releases/unseen"),
    );
    expect(res.status).toBe(200);

    const where = findFirst.mock.calls[0][0].where;
    expect(where.seenBy).toEqual({ none: { userId: "user_1" } });
    expect(where.notes?.notIn).toEqual(
      expect.arrayContaining([RELEASE_NOTES_PENDING, RELEASE_NOTES_FAILED]),
    );
  });
});
