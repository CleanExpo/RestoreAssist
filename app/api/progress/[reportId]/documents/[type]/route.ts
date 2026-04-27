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
import { prisma } from "@/lib/prisma";
import {
  generateCarrierPacketPdf,
  generateCloseoutPack,
  generateLabourHireSummary,
  generateStabilisationCertificate,
  loadClaimDataGraph,
} from "@/lib/progress/document-generators";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  if (!(type in GENERATORS)) {
    return NextResponse.json(
      {
        error: `type must be one of ${Object.keys(GENERATORS).join(", ")}`,
      },
      { status: 400 },
    );
  }
  const docType = type as DocType;

  // Tenancy: report owner OR admin only.
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true, userId: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  const role = (session.user as { role?: string }).role ?? "USER";
  if (report.userId !== userId && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const loaded = await loadClaimDataGraph(reportId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 404 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await GENERATORS[docType].fn(loaded.data);
  } catch (err) {
    console.error(`[progress.docs.${docType}] generation failed`, err);
    return NextResponse.json(
      { error: "PDF generation failed" },
      { status: 500 },
    );
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
