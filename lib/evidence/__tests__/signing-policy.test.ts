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
  exemptFromSigningPolicy,
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
  it("POLICY OFF: allows with no downgrade reason when the user has no registered key", async () => {
    process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
    mFindFirst.mockResolvedValueOnce(null);
    const result = await evaluateUnsignedSubmission("u1");
    expect(result).toEqual({ ok: true, downgradeReason: null });
  });

  it("POLICY OFF: allows but RECORDS the downgrade when the user holds a live key", async () => {
    process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
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

  // POSITIVE CONTROL #1 (fail-closed core): the old code ACCEPTED an unsigned
  // submission from a no-key caller even under a required-signing policy — the
  // control was bypassable by simply never registering a key. It must REJECT.
  it("FAIL-CLOSED: REFUSES when the policy is ON and the user has NO key", async () => {
    process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
    mFindFirst.mockResolvedValueOnce(null);
    const result = await evaluateUnsignedSubmission("u1");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 400, code: "VALIDATION" });
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
    process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "false";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mFindFirst.mockRejectedValueOnce(new Error("db down"));
    const result = await evaluateUnsignedSubmission("u1");
    expect(result).toEqual({ ok: true, downgradeReason: null });
  });

  // Round 4: an exact === "true" check silently left the whole enforcement
  // switch OFF for "TRUE" or "1" — the worst failure mode for a security
  // control, because the operator believes it is on.
  describe("EVIDENCE_REQUIRE_SIGNED_MANIFEST parsing", () => {
    it.each(["true", "TRUE", "True", "1", "yes", "on", "enabled", " true "])(
      "treats %j as ON",
      async (value) => {
        process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = value;
        mFindFirst.mockResolvedValueOnce({ id: "dk1" });
        const result = await evaluateUnsignedSubmission("u1");
        expect(result.ok).toBe(false);
      },
    );

    it.each(["false", "FALSE", "0", "no", "off", "disabled"])(
      "treats %j as OFF",
      async (value) => {
        process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = value;
        mFindFirst.mockResolvedValueOnce({ id: "dk1" });
        const result = await evaluateUnsignedSubmission("u1");
        expect(result.ok).toBe(true);
      },
    );

    // POSITIVE CONTROL #1 (fail-closed default): an UNSET, EMPTY or
    // UNRECOGNISED config must leave the policy ON — the previous default was
    // OFF, the worst failure mode for a security control the operator believes
    // is on.
    it.each([undefined, "", "  ", "maybe", "1yes", "trueish"])(
      "FAIL-CLOSED: treats %j as ON (unset/empty/unknown ⇒ enforced)",
      async (value) => {
        if (value === undefined) {
          delete process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
        } else {
          process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = value;
        }
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        mFindFirst.mockResolvedValueOnce({ id: "dk1" });
        const result = await evaluateUnsignedSubmission("u1");
        expect(result.ok).toBe(false);
      },
    );

    it("logs LOUDLY when an unrecognised value is treated as ON", async () => {
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "maybe";
      mFindFirst.mockResolvedValueOnce({ id: "dk1" });

      const result = await evaluateUnsignedSubmission("u1");
      expect(result.ok).toBe(false);

      const warned = errorSpy.mock.calls.find(([msg]) =>
        String(msg).includes("unrecognised value"),
      );
      expect(warned).toBeDefined();
      expect((warned![1] as { value: string }).value).toBe("maybe");
    });
  });
});

// Round 3: an exemption must be a NAMED call, visible at the call site and
// assertable here — three consecutive review rounds found writers reaching
// the dangerous state simply by not calling the shared control.
describe("exemptFromSigningPolicy", () => {
  it("returns the client-portal reason without probing for a key", () => {
    const result = exemptFromSigningPolicy("CLIENT_PORTAL_PROMOTION");
    expect(result).toEqual({
      ok: true,
      downgradeReason: "CLIENT_PORTAL_PROMOTION_UNSIGNED_BY_DESIGN",
    });
    expect(mFindFirst).not.toHaveBeenCalled();
  });

  it("holds the exemption even with the policy ON", () => {
    process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
    expect(exemptFromSigningPolicy("CLIENT_PORTAL_PROMOTION").ok).toBe(true);
  });

  it("always records a reason — an exemption is never silent", () => {
    expect(
      exemptFromSigningPolicy("CLIENT_PORTAL_PROMOTION").downgradeReason,
    ).toBeTruthy();
  });
});
