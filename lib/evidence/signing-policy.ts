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

/**
 * Recorded on rows promoted out of the client portal. Round 3 review found a
 * FOURTH writer — app/api/inspections/[id]/evidence/promote-client/route.ts —
 * reaching EvidenceItem without either shared control.
 */
export const DOWNGRADE_REASON_CLIENT_PORTAL_PROMOTION =
  "CLIENT_PORTAL_PROMOTION_UNSIGNED_BY_DESIGN";

/**
 * Writers EXEMPT from EVIDENCE_REQUIRE_SIGNED_MANIFEST, stated explicitly in
 * code rather than left implicit by omission.
 *
 * CLIENT_PORTAL_PROMOTION — a homeowner uploads through a tokenised portal
 * link from their own phone. They have no registered device signing key and
 * never will, and the technician who later promotes the submission did not
 * capture those bytes, so their key cannot honestly vouch for them.
 * Enforcing the policy here would block staff from accepting legitimate
 * client evidence while proving nothing about its origin. These rows are
 * instead stamped unsigned with a reason naming exactly why, so the record
 * is honest about what it is: third-party evidence, staff-verified at
 * promotion, never device-signed.
 */
export type SigningPolicyExemption = "CLIENT_PORTAL_PROMOTION";

const EXEMPTION_REASONS: Record<SigningPolicyExemption, string> = {
  CLIENT_PORTAL_PROMOTION: DOWNGRADE_REASON_CLIENT_PORTAL_PROMOTION,
};

/**
 * Declare a writer exempt from the signing policy. Deliberately a separate
 * NAMED call rather than "just don't call evaluateUnsignedSubmission":
 * three consecutive review rounds found writers that reached the dangerous
 * state simply by not calling the shared control, so an exemption has to be
 * visible at the call site and assertable in a test.
 */
export function exemptFromSigningPolicy(exemption: SigningPolicyExemption): {
  ok: true;
  downgradeReason: string;
} {
  return { ok: true, downgradeReason: EXEMPTION_REASONS[exemption] };
}

export type UnsignedSubmissionPolicy =
  | { ok: true; downgradeReason: string | null }
  | {
      ok: false;
      status: number;
      code: "VALIDATION" | "INTERNAL";
      message: string;
    };

/**
 * Round 4: an exact `=== "true"` check meant EVIDENCE_REQUIRE_SIGNED_MANIFEST
 * set to "TRUE" or "1" silently left the entire enforcement switch OFF — the
 * worst possible failure mode for a security control, because the operator
 * believes it is on. Accept the common truthy spellings, and log LOUDLY on
 * anything unrecognised rather than quietly treating it as off.
 */
const TRUTHY = new Set(["true", "1", "yes", "on", "enabled"]);
const FALSY = new Set(["false", "0", "no", "off", "disabled", ""]);

function requireSignedManifest(): boolean {
  const raw = process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
  if (raw === undefined) return false;
  const normalised = raw.trim().toLowerCase();
  if (TRUTHY.has(normalised)) return true;
  if (FALSY.has(normalised)) return false;
  console.error(
    "[evidence] EVIDENCE_REQUIRE_SIGNED_MANIFEST has an unrecognised value — " +
      "treating it as OFF. Use one of: " +
      `${[...TRUTHY].join(", ")} (on) or ${[...FALSY].filter(Boolean).join(", ")} (off).`,
    { value: raw },
  );
  return false;
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
