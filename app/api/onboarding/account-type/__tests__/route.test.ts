import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/analytics/track", () => ({ track: vi.fn(async () => {}) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/organization/ensure-owner-organization", () => ({
  ensureOwnerOrganization: vi.fn(async () => "org1"),
  OwnerOrganizationRefused: class extends Error {},
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ensureOwnerOrganization } from "@/lib/organization/ensure-owner-organization";
import { track } from "@/lib/analytics/track";

const VALID_ABN = "51824753556";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/onboarding/account-type", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("POST /api/onboarding/account-type", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: "ADMIN",
      pendingInviteIdentity: false,
    } as never);
  });

  it("gives a Google owner an organisation named for the business, with terms and the flip in the same call", async () => {
    const res = await post({ businessName: "Coastal", acceptedTerms: true });
    expect(res.status).toBe(200);
    expect(ensureOwnerOrganization).toHaveBeenCalledTimes(1);
    const [userId, opts] = vi.mocked(ensureOwnerOrganization).mock.calls[0];
    expect(userId).toBe("u1");
    expect(opts?.name).toBe("Coastal");
    expect(opts?.userData).toMatchObject({
      businessName: "Coastal",
      needsOnboarding: false,
    });
    expect(opts?.userData?.acceptedTermsAt).toBeInstanceOf(Date);
    expect(track).toHaveBeenCalledWith("u1", "terms_accepted", expect.anything());
  });

  it("a New Zealand owner passes with no ABN and no state, and neither field is overwritten", async () => {
    const res = await post({ businessName: "Kiwi Dry", acceptedTerms: true });
    expect(res.status).toBe(200);
    const opts = vi.mocked(ensureOwnerOrganization).mock.calls[0][1];
    expect(opts?.userData).not.toHaveProperty("businessABN");
    expect(opts?.userData).not.toHaveProperty("businessState");
  });

  it("a cached bundle's full form still saves its details", async () => {
    const res = await post({
      businessName: "Coastal",
      abn: VALID_ABN,
      state: "qld",
      acceptedTerms: true,
    });
    expect(res.status).toBe(200);
    expect(
      vi.mocked(ensureOwnerOrganization).mock.calls[0][1]?.userData,
    ).toMatchObject({ businessABN: VALID_ABN, businessState: "QLD" });
  });

  it.each([
    ["no terms", { businessName: "C" }],
    ["no name", { acceptedTerms: true }],
    ["a bad ABN", { businessName: "C", acceptedTerms: true, abn: "12345678901" }],
    ["a bad state", { businessName: "C", acceptedTerms: true, state: "ZZ" }],
  ])("refuses %s and creates nothing", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(ensureOwnerOrganization).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ["an invited identity", { role: "ADMIN", pendingInviteIdentity: true }],
    ["a removed technician", { role: "USER", pendingInviteIdentity: false }],
    ["a manager", { role: "MANAGER", pendingInviteIdentity: false }],
  ])("%s accepts terms but gets no organisation", async (_label, dbUser) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser as never);
    const res = await post({ businessName: "C", acceptedTerms: true });
    expect(res.status).toBe(200);
    expect(ensureOwnerOrganization).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });
});
