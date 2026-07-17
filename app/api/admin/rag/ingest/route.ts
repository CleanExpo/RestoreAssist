import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { apiError, fromException } from "@/lib/api-errors";
import { ragIngestBodySchema } from "@/lib/rag/ingest-body";
import { runStandardsIngest } from "@/lib/rag/run-standards-ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  try {
    const body = ragIngestBodySchema.safeParse(await request.json());
    if (!body.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: body.error.issues[0]?.message ?? "Invalid request",
        status: 400,
      });
    }

    const summary = await runStandardsIngest(body.data);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[admin-rag-ingest] failed:", error);
    return fromException(request, error, { stage: "admin-rag-ingest" });
  }
}
