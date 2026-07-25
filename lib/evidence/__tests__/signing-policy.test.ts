/**
 * RA-7090 slice 2 review round 2 (MUST-FIX 2): the shared unsigned-submission
 * policy. Round 1 put this logic in the multipart writer only, leaving the
 * JSON and batch writers policy-exempt — the same defect class as round-1
 * MUST-FIX 1, inside the control added to fix it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { deviceSigningKey: { findFirst: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import {
  evaluateUnsignedSubmission,
  DOWNGRADE_REASON_REGISTERED_KEY_UNSIGNED,
} from "../signing-policy";

const mFindFirst = prisma.deviceSigningKey.findFirst as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
});

afterEach(() => {
  delete process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
  vi.restoreAllMocks();
});

describe("evaluateUnsignedSubmission", () => {
  it("allows with no downgrade reason when the user has no registered key", async () => {
    mFindFirst.mockResolvedValueOnce(null);
    const result = await evaluateUnsignedSubmission("u1");
    expect(result).toEqual({ ok: true, downgradeReason: null });
  });

  it("allows but RECORDS the downgrade when the user holds a live key", async () => {
    mFindFirst.mockResolvedValueOnce({ id: "dk1" });
    const result = await evaluateUnsignedSubmission("u1");
    expect(result).toEqual({
      ok: true,
      downgradeReason: DOWNGRADE_REASON_REGISTERED_KEY_UNSIGNED,
    });
  });

  it("only counts NON-revoked keys as live", async () => {
    mFindFirst.mockResolvedValueOnce(null);
    await evaluateUnsignedSubmission("u1");
    expect(mFindFirst).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      select: { id: true },
    });
  });

  it("REFUSES when the policy is ON and the user holds a live key", async () => {
    process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
    mFindFirst.mockResolvedValueOnce({ id: "dk1" });
    const result = await evaluateUnsignedSubmission("u1");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 400, code: "VALIDATION" });
  });

  it("allows under the policy when the user has NO key (nothing to downgrade from)", async () => {
    process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
    mFindFirst.mockResolvedValueOnce(null);
    const result = await evaluateUnsignedSubmission("u1");
    expect(result).toEqual({ ok: true, downgradeReason: null });
  });

  it("fails CLOSED on a probe error when the policy is ON", async () => {
    process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mFindFirst.mockRejectedValueOnce(new Error("db down"));
    const result = await evaluateUnsignedSubmission("u1");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 500, code: "INTERNAL" });
  });

  it("fails OPEN on a probe error when the policy is OFF (telemetry never blocks capture)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mFindFirst.mockRejectedValueOnce(new Error("db down"));
    const result = await evaluateUnsignedSubmission("u1");
    expect(result).toEqual({ ok: true, downgradeReason: null });
  });

  it("treats any value other than the exact string 'true' as OFF", async () => {
    mFindFirst.mockResolvedValue({ id: "dk1" });
    for (const value of ["false", "1", "TRUE", "yes", ""]) {
      process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = value;
      const result = await evaluateUnsignedSubmission("u1");
      expect(result.ok).toBe(true);
    }
  });
});
