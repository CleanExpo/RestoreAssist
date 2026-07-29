import { NextResponse } from "next/server";

/**
 * POST /api/portal/auth/reset-password — DISABLED.
 *
 * This endpoint previously implemented a two-step homeowner reset in which
 * knowing the account email was sufficient to set a new password and receive a
 * signed 30-day portal JWT. That is an account-takeover path: any party who
 * knew a homeowner's email address could take the account and read the claim
 * and property data behind it. Step 1 also disclosed whether an account existed
 * for a given address, which made the addresses cheap to find.
 *
 * The surface is closed while the replacement — a single-use, expiring, hashed
 * token delivered by email — goes through review. Both steps return 503: step 2
 * is the takeover, step 1 is the enumeration oracle that made it targetable, so
 * neither can stay up on its own.
 *
 * Homeowners who need access in the meantime go through their restoration
 * contractor, who can re-issue a portal invitation via
 * app/api/portal/invitations.
 *
 * Reversal: this commit is a clean revert, but reverting alone restores the
 * takeover. Do not revert without the replacement flow in the same deploy.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Password reset is temporarily unavailable. Please contact your restoration contractor, who can send you a new portal invitation.",
    },
    { status: 503, headers: { "Retry-After": "86400" } },
  );
}
