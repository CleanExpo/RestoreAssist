import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDisputePack } from "@/lib/dispute-pack";
import { withIdempotency } from "@/lib/idempotency";

/**
 * POST /api/inspections/[id]/dispute-pack
 *
 * Generates a Dispute Defence Pack PDF for a completed inspection.
 * The PDF contains all evidence, moisture readings, scope of works,
 * and IICRC S500:2025 citations for insurance dispute resolution.
 *
 * Auth: getServerSession (CLAUDE.md Rule 1)
 * Response: PDF stream with Content-Disposition attachment header.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: dispute-pack PDF generation is expensive (evidence
  // aggregation + pdf-lib rendering). Pending-slot guard blocks
  // double-runs; the binary PDF body bypasses cache via the 1MB cap
  // (same pattern as generate-detailed).
  return withIdempotency(request, userId, async () => {
    try {
      const inspection = await prisma.inspection.findUnique({
        where: { id },
        select: {
          id: true,
          inspectionNumber: true,
          status: true,
          userId: true,
        },
      });

      if (!inspection) {
        return NextResponse.json(
          { error: "Inspection not found" },
          { status: 404 },
        );
      }

      if (inspection.userId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const allowedStatuses = ["SUBMITTED", "COMPLETED"];
      if (!allowedStatuses.includes(inspection.status)) {
        return NextResponse.json(
          {
            error: `Dispute pack can only be generated for inspections with status SUBMITTED or COMPLETED. Current status: ${inspection.status}`,
          },
          { status: 400 },
        );
      }

      const pdfBytes = await generateDisputePack(id, userId, prisma);

      const filename = `dispute-pack-${inspection.inspectionNumber}.pdf`;

      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(pdfBytes.length),
        },
      });
    } catch (error: unknown) {
      console.error("Error generating dispute pack:", error);
      return NextResponse.json(
        { error: "Failed to generate dispute pack" },
        { status: 500 },
      );
    }
  });
}
