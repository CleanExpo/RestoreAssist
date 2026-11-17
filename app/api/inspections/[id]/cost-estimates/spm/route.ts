import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertEstimateWriter } from "@/lib/auth/assert-estimate-writer";
import { addSpmRow, removeSpmRow, SpmCountryError } from "@/lib/billing/spm-estimate-rows";
import { apiError, fromException } from "@/lib/api-errors";

type Context = { params: Promise<{ id: string }> };
async function act(request: NextRequest, context: Context, add: boolean) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    const { id } = await context.params;
    if (!await assertEstimateWriter(session, id)) return apiError(request, { code: "NOT_FOUND", message: "Inspection not found", status: 404 });
    // The request body is deliberately unused. Price and country are server-owned.
    const result = await prisma.$transaction(tx => (add ? addSpmRow : removeSpmRow)(tx, id, session.user.id));
    return NextResponse.json(result, { status: result.outcome === "added" ? 201 : 200 });
  } catch (error) {
    if (error instanceof SpmCountryError) return apiError(request, { code: "VALIDATION", message: "SPM is available for Australian properties only", status: 400 });
    return fromException(request, error, { stage: "cost-estimates-spm" });
  }
}
export function POST(request: NextRequest, context: Context) { return act(request, context, true); }
export function DELETE(request: NextRequest, context: Context) { return act(request, context, false); }
