import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-8456: a contractor disputing a review must not hide it. The public
// contractor queries (app/api/contractors/[slug]/route.ts and the list in
// app/api/contractors/reviews/route.ts) require status PUBLISHED and only
// exclude disputes that are UNDER_INVESTIGATION or RESOLVED_REMOVED, so a
// PENDING_REVIEW dispute has to leave the review PUBLISHED.

const session = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
vi.mock("next-auth", () => ({ getServerSession: session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { contractorReview: { findUnique, update } },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _userId: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));

import { POST } from "../route";

const published = {
  id: "review-1",
  status: "PUBLISHED",
  disputeStatus: "NONE",
  profile: { userId: "contractor-a" },
};

// The same predicate the public contractor query applies to each review.
const isPubliclyVisible = (r: { status: string; disputeStatus: string }) =>
  r.status === "PUBLISHED" &&
  !["UNDER_INVESTIGATION", "RESOLVED_REMOVED"].includes(r.disputeStatus);

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/contractors/reviews/review-1/dispute", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "review-1" }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "contractor-a" } });
  findUnique.mockResolvedValue(published);
  update.mockImplementation(async ({ data }: { data: object }) => ({
    ...published,
    ...data,
  }));
});

describe("POST /api/contractors/reviews/[id]/dispute", () => {
  it("records the dispute without touching the review's published status", async () => {
    const res = await call({ disputeReason: "Not our job" });
    expect(res.status).toBe(200);

    const data = update.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual([
      "disputeReason",
      "disputeStatus",
      "disputeSubmittedAt",
    ]);
    expect(data.disputeStatus).toBe("PENDING_REVIEW");
  });

  it("leaves a disputed review visible to the public contractor query", async () => {
    const res = await call({ disputeReason: "Not our job" });
    const { review } = await res.json();
    expect(review.disputeStatus).toBe("PENDING_REVIEW");
    expect(isPubliclyVisible(review)).toBe(true);
  });

  it("still refuses a contractor who does not own the review", async () => {
    session.mockResolvedValue({ user: { id: "contractor-b" } });
    const res = await call({ disputeReason: "x" });
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
});
