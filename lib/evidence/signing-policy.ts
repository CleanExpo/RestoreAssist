/**
 * RA-7090 slice 2 review round 2 (MUST-FIX 2): THE single place that decides
 * what happens to an UNSIGNED evidence submission.
 *
 * Round 1 added the EVIDENCE_REQUIRE_SIGNED_MANIFEST policy to the multipart
 * writer only. Review then proved the control was exempt on the other two
 * writers: with the policy ON and the user holding a live key, a JSON POST
 * returned 201 with no downgrade reason, and the batch route — which uploads
 * real bytes and persists hashSha256 — contained no reference to the flag at
 * all, so 20 files to /evidence/batch produced 20 unsigned policy-exempt
 * rows.
 *
 * That is the same defect class as round-1 MUST-FIX 1, sitting inside the
 * control added to fix it, and it contradicted the doctrine written at
 * lib/evidence/structured-data.ts. So the probe, the policy decision and the
 * downgrade-reason string all live here, and every writer calls this.
 */

import { prisma } from "@/lib/prisma";

/** Recorded on the EvidenceItem when a key-holder submits unsigned. */
export const DOWNGRADE_REASON_REGISTERED_KEY_UNSIGNED =
  "REGISTERED_KEY_BUT_UNSIGNED_SUBMISSION";

export type UnsignedSubmissionPolicy =
  | { ok: true; downgradeReason: string | null }
  | {
      ok: false;
      status: number;
      code: "VALIDATION" | "INTERNAL";
      message: string;
    };

function requireSignedManifest(): boolean {
  return process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST === "true";
}

/**
 * Decide how to treat an unsigned submission from `userId`.
 *
 * - No registered live key: nothing to report, submission proceeds.
 * - Live key present: record the downgrade reason so the fail-open is
 *   VISIBLE on the record; refuse outright when the policy is ON.
 * - Probe failure: never blocks a capture while the policy is OFF
 *   (telemetry must not break field work), but fails CLOSED when it is ON.
 *
 * Callers MUST invoke this only when no manifest verified.
 */
export async function evaluateUnsignedSubmission(
  userId: string,
): Promise<UnsignedSubmissionPolicy> {
  const requireSigned = requireSignedManifest();

  let hasLiveKey: boolean;
  try {
    hasLiveKey =
      (await prisma.deviceSigningKey.findFirst({
        where: { userId, revokedAt: null },
        select: { id: true },
      })) !== null;
  } catch (probeErr) {
    console.error("[evidence] signing-key downgrade probe failed", probeErr);
    if (requireSigned) {
      return {
        ok: false,
        status: 500,
        code: "INTERNAL",
        message: "Unable to verify signing policy for this submission",
      };
    }
    return { ok: true, downgradeReason: null };
  }

  if (!hasLiveKey) return { ok: true, downgradeReason: null };

  if (requireSigned) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION",
      message:
        "This account has a registered signing key — evidence must be submitted with a signed manifest",
    };
  }

  return {
    ok: true,
    downgradeReason: DOWNGRADE_REASON_REGISTERED_KEY_UNSIGNED,
  };
}
