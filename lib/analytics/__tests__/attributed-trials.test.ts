import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { activationEvent: { findMany: h.findMany } },
}));

import {
  countSynthexTrials,
  isInternalOrTestEmail,
  isSynthexAttributed,
} from "../attributed-trials";

const NOW = new Date("2026-10-19T06:00:00.000Z");

function signup(
  userId: string,
  email: string | null,
  attribution: Record<string, unknown> | null,
  subscriptionStatus = "TRIAL",
) {
  return {
    userId,
    properties: attribution ? { attribution } : { hasOrganization: true },
    user: email === null ? null : { email, subscriptionStatus },
  };
}

describe("isInternalOrTestEmail", () => {
  it.each([
    "founder@restoreassist.app",
    "ops@mail.unite-group.in",
    "someone@example.com",
    "a@firm.test",
    "e2e-tenant-b@gmail.com",
    "qa.lead@restorepro.com.au",
    "playstore-review@x.com",
    "tester1@gmail.com",
    "",
    "no-at-sign",
  ])("excludes %s", (email) => {
    expect(isInternalOrTestEmail(email)).toBe(true);
  });

  it.each([
    "owner@coastalrestoration.com.au",
    "jason.contest@gmail.com",
    "admin@protestdryers.co.nz",
    "manager@firm.com",
  ])("keeps real firm address %s", (email) => {
    expect(isInternalOrTestEmail(email)).toBe(false);
  });
});

describe("isSynthexAttributed", () => {
  it("matches utm_source=synthex in any case", () => {
    expect(isSynthexAttributed({ attribution: { source: "Synthex" } })).toBe(true);
  });

  it("matches a Synthex Studio campaign tag whatever the platform source", () => {
    expect(
      isSynthexAttributed({
        attribution: { source: "linkedin", campaign: "studio-restoreassist" },
      }),
    ).toBe(true);
  });

  it("rejects other sources, missing attribution and malformed values", () => {
    expect(isSynthexAttributed({ attribution: { source: "google" } })).toBe(false);
    expect(isSynthexAttributed({ attribution: null })).toBe(false);
    expect(isSynthexAttributed({ hasOrganization: true })).toBe(false);
    expect(isSynthexAttributed(null)).toBe(false);
    expect(isSynthexAttributed({ attribution: { source: 42 } })).toBe(false);
    expect(
      isSynthexAttributed({ attribution: { campaign: "not-studio-x" } }),
    ).toBe(false);
  });
});

describe("countSynthexTrials", () => {
  beforeEach(() => {
    h.findMany.mockReset();
  });

  it("counts distinct external Synthex signups, activation and paid status", async () => {
    h.findMany
      .mockResolvedValueOnce([
        signup("u1", "owner@coastal.com.au", { source: "synthex" }, "ACTIVE"),
        signup("u2", "ops@dryright.co.nz", { campaign: "studio-ra", source: "linkedin" }),
        signup("u2", "ops@dryright.co.nz", { source: "synthex" }), // duplicate user
        signup("u3", "founder@restoreassist.app", { source: "synthex" }), // internal
        signup("u4", "boss@firm.com.au", { source: "google" }), // other source
        signup("u5", "x@firm.com.au", null), // no attribution
        signup("u6", null, { source: "synthex" }), // orphaned event
      ])
      .mockResolvedValueOnce([{ userId: "u2" }]);

    const counts = await countSynthexTrials("7d", NOW);

    expect(counts).toEqual({
      source: "synthex",
      attributionKey: "utm_source=synthex OR utm_campaign=studio-*",
      window: "7d",
      from: "2026-10-12T06:00:00.000Z",
      to: "2026-10-19T06:00:00.000Z",
      signups: 2,
      first_report_saved: 1,
      active_paid: 1,
      excluded_internal: 2,
      truncated: false,
    });

    const signupQuery = h.findMany.mock.calls[0][0];
    expect(signupQuery.where).toEqual({
      eventName: "signup_completed",
      createdAt: { gte: new Date("2026-10-12T06:00:00.000Z"), lte: NOW },
    });
    expect(signupQuery.take).toBe(5000);
    const activationQuery = h.findMany.mock.calls[1][0];
    expect(activationQuery.where).toEqual({
      eventName: "first_report_saved",
      userId: { in: ["u1", "u2"] },
    });
  });

  it("returns zeros without a second query when nothing is attributed", async () => {
    h.findMany.mockResolvedValueOnce([
      signup("u4", "boss@firm.com.au", { source: "google" }),
    ]);
    const counts = await countSynthexTrials("30d", NOW);
    expect(counts.signups).toBe(0);
    expect(counts.first_report_saved).toBe(0);
    expect(counts.from).toBe("2026-09-19T06:00:00.000Z");
    expect(h.findMany).toHaveBeenCalledTimes(1);
  });

  it("propagates a database failure instead of reporting zero", async () => {
    h.findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(countSynthexTrials("7d", NOW)).rejects.toThrow("db down");
  });
});
