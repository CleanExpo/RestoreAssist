/**
 * GET /api/progress/[reportId]/documents/[type] — RA-1705.
 *
 * Streams an auto-populated PDF for a claim. type ∈ {
 *   "stabilisation-certificate",
 *   "labour-hire-summary",
 *   "carrier-packet",
 *   "closeout-pack"
 * }. Pulls every field from the canonical schema graph — pilot users
 * never re-type claim details into a downstream document.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { assertReportTenancy } from "@/lib/auth/assert-tenancy";
import {
  generateCarrierPacketPdf,
  generateCloseoutPack,
  generateLabourHireSummary,
  generateStabilisationCertificate,
  loadClaimDataGraph,
} from "@/lib/progress/document-generators";
import { apiError } from "@/lib/api-errors";

const GENERATORS = {
  "stabilisation-certificate": {
    fn: generateStabilisationCertificate,
    filename: "stabilisation-certificate.pdf",
  },
  "labour-hire-summary": {
    fn: generateLabourHireSummary,
    filename: "labour-hire-summary.pdf",
  },
  "carrier-packet": {
    fn: generateCarrierPacketPdf,
    filename: "carrier-packet.pdf",
  },
  "closeout-pack": {
    fn: generateCloseoutPack,
    filename: "closeout-pack.pdf",
  },
} as const;

type DocType = keyof typeof GENERATORS;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string; type: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 30,
    windowMs: 60 * 1000,
    prefix: "progress:doc",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  const { reportId, type } = await params;

  if (!Object.prototype.hasOwnProperty.call(GENERATORS, type)) {
    return apiError(request, {
      code: "VALIDATION",
      message: `type must be one of ${Object.keys(GENERATORS).join(", ")}`,
      status: 400,
    });
  }
  const docType = type as DocType;

  // Tenancy gate (RA-7628): the report owner, an ADMIN — per the database —
  // of the owner's own organisation, or an allowlisted platform-support
  // operator. Being ADMIN is not enough on its own: every firm that
  // self-registers is ADMIN of its own account. 404 for "not yours" and
  // "doesn't exist" alike, so another tenant's report ids cannot be probed.
  const tenancy = await assertReportTenancy(session, reportId);
  if (!tenancy.ok) {
    return apiError(request, {
      code: tenancy.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
      message: tenancy.reason,
      status: tenancy.status,
    });
  }

  const loaded = await loadClaimDataGraph(reportId);
  if (!loaded.ok) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: loaded.error,
      status: 404,
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = await GENERATORS[docType].fn(loaded.data);
  } catch (err) {
    return apiError(request, {
      code: "INTERNAL",
      message: "PDF generation failed",
      status: 500,
      err,
      stage: `docs:${docType}`,
    });
  }

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${GENERATORS[docType].filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
