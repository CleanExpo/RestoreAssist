import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-7577: submitting a review (POST) and listing "my reviews"
// (GET ?myReviews=true) were written for a portal-client sign-in that does
// not exist, so both crashed on every call and hid a cross-business
// ownership gap. Until the founder decides how portal clients sign in, those
// two paths are switched off with a plain "not available yet" answer and
// must not touch the database. The contractor's own listing
// (GET ?contractorSlug=...) is a working feature and stays on.

const getServerSession = vi.fn();
const clientUserFindUnique = vi.fn();
const profileFindUnique = vi.fn();
const reviewFindMany = vi.fn();
const reviewFindFirst = vi.fn();
const reviewCreate = vi.fn();
const reportFindFirst = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientUser: {
      findUnique: (...a: unknown[]) => clientUserFindUnique(...a),
    },
    contractorProfile: {
      findUnique: (...a: unknown[]) => profileFindUnique(...a),
    },
    contractorReview: {
      findMany: (...a: unknown[]) => reviewFindMany(...a),
      findFirst: (...a: unknown[]) => reviewFindFirst(...a),
      create: (...a: unknown[]) => reviewCreate(...a),
    },
    report: { findFirst: (...a: unknown[]) => reportFindFirst(...a) },
  },
}));

import { GET, POST } from "../route";

const BASE = "http://localhost/api/contractors/reviews";
const MESSAGE = "Contractor reviews are not available yet";

function postReq(body: unknown) {
  return new NextRequest(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectNoDatabase() {
  expect(clientUserFindUnique).not.toHaveBeenCalled();
  expect(profileFindUnique).not.toHaveBeenCalled();
  expect(reviewFindMany).not.toHaveBeenCalled();
  expect(reviewFindFirst).not.toHaveBeenCalled();
  expect(reviewCreate).not.toHaveBeenCalled();
  expect(reportFindFirst).not.toHaveBeenCalled();
}

async function expectNotAvailable(res: Response) {
  expect(res.status).toBe(503);
  const json = await res.json();
  expect(json.error.code).toBe("FEATURE_UNAVAILABLE");
  expect(json.error.message).toBe(MESSAGE);
}

beforeEach(() => {
  vi.clearAllMocks();
  // A real signed-in user, so the old code gets past its 401 and reaches
  // the database. Without this the no-database assertions would pass for
  // the wrong reason.
  getServerSession.mockResolvedValue({
    user: { id: "user-1", email: "owner@example.com" },
  });
  // Mirrors what Prisma does today: ClientUser has no userId field.
  clientUserFindUnique.mockRejectedValue(
    new Error("Unknown argument `userId`"),
  );
});

describe("POST /api/contractors/reviews (RA-7577: switched off)", () => {
  const valid = {
    contractorSlug: "acme-restoration",
    reportId: "report-of-another-business",
    overallRating: 5,
    reviewText: "Great job",
  };

  it.each([
    ["a valid-looking review", valid],
    ["overallRating 0", { ...valid, overallRating: 0 }],
    ["qualityRating 99", { ...valid, qualityRating: 99 }],
  ])(
    "answers not-available for %s without touching the database",
    async (_label, body) => {
      const res = await POST(postReq(body));
      await expectNotAvailable(res);
      expectNoDatabase();
    },
  );

  it("answers the same when nobody is signed in", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(postReq(valid));
    await expectNotAvailable(res);
    expectNoDatabase();
  });
});

describe("GET /api/contractors/reviews", () => {
  it("?myReviews=true answers not-available without touching the database", async () => {
    const res = await GET(new NextRequest(`${BASE}?myReviews=true`));
    await expectNotAvailable(res);
    expectNoDatabase();
  });

  it("?contractorSlug= still lists the contractor's published reviews", async () => {
    profileFindUnique.mockResolvedValue({ id: "profile-1" });
    reviewFindMany.mockResolvedValue([]);
    const res = await GET(new NextRequest(`${BASE}?contractorSlug=acme`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reviews: [] });
    expect(profileFindUnique).toHaveBeenCalledWith({
      where: { slug: "acme" },
      select: { id: true },
    });
    expect(clientUserFindUnique).not.toHaveBeenCalled();
  });
});
