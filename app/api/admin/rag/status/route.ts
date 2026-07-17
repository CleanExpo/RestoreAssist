import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { fromException } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  try {
    const byTier = await prisma.$queryRaw<
      { kind: string; provenance: string; chunks: number }[]
    >`
      SELECT
        CASE
          WHEN standard LIKE 'S%' OR standard LIKE 'RIA%' THEN 'standard'
          ELSE 'knowledge'
        END AS kind,
        provenance::text AS provenance,
        count(*)::int AS chunks
      FROM "IicrcChunk"
      GROUP BY 1, 2
      ORDER BY 1, 2`;

    const total = byTier.reduce((sum, row) => sum + row.chunks, 0);
    return NextResponse.json({ total, byTier });
  } catch (error) {
    return fromException(request, error, { stage: "admin-rag-status" });
  }
}
