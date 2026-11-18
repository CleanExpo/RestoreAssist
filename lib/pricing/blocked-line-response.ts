/**
 * RA-8281 (B2): the one HTTP answer for a blocked pricing result.
 *
 * A route whose engine returned blocked lines answers with this. Nothing is
 * saved for a blocked result, so the status is 422, not 2xx: a caller that
 * does not know about blocked lines reads it as "not created" and can never
 * mistake it for a saved estimate. A caller that does know reads `blocked`
 * and shows every line, with "Rate not set" on the
 * blocked ones and "Total not available: rate not set" for the total.
 */
import { NextResponse } from "next/server";
import type { BlockedPricing } from "@/lib/pricing/blocked-line";

export const RATE_NOT_SET_CODE = "RATE_NOT_SET";

export interface BlockedPricingBody {
  error: { code: typeof RATE_NOT_SET_CODE; message: string };
  blocked: BlockedPricing;
}

export function blockedPricingResponse(
  blocked: BlockedPricing,
): NextResponse<BlockedPricingBody> {
  const notes = blocked.missing.map((m) => m.note).join(" ");
  return NextResponse.json(
    {
      error: {
        code: RATE_NOT_SET_CODE,
        message: notes ? `${blocked.totalNote}. ${notes}` : blocked.totalNote,
      },
      blocked,
    },
    { status: 422 },
  );
}
