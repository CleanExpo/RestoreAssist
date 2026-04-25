/**
 * GET /api/claims/[inspectionId]/make-safe-report
 *
 * Generates a Claude-authored make-safe summary report for an inspection.
 * Combines MakeSafeAction completion status, IICRC S500 §3.1 language, and
 * inspection classifications to produce a field-ready handover document.
 *
 * P1-CLAIM5 — RA-1129
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";

const MODEL = "claude-haiku-4-5-20251001";

export async function GET(
  request: NextRequest,
  { params }: { params: { inspectionId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { inspectionId } = params;

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      userId: true,
      propertyAddress: true,
      inspectionNumber: true,
      propertyYearBuilt: true,
      classifications: { select: { category: true, class: true } },
      makeSafeActions: {
        select: {
          action: true,
          applicable: true,
          completed: true,
          completedAt: true,
          notes: true,
        },
      },
    },
  });

  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const applicable = inspection.makeSafeActions.filter((a) => a.applicable);
  const completed = applicable.filter((a) => a.completed);
  const outstanding = applicable.filter((a) => !a.completed);

  const classificationSummary = inspection.classifications
    .map((c) => [c.category, c.class].filter(Boolean).join("/"))
    .join(", ") || "Not classified";

  const actionLines = inspection.makeSafeActions
    .filter((a) => a.applicable)
    .map(
      (a) =>
        `- ${a.action.replace(/_/g, " ")}: ${a.completed ? `COMPLETE (${a.completedAt?.toISOString() ?? "n/a"})` : "OUTSTANDING"}${a.notes ? ` — ${a.notes}` : ""}`,
    )
    .join("\n");

  const prompt = `You are a licensed restoration supervisor writing a make-safe handover report compliant with IICRC S500 §3.1.

Property: ${inspection.propertyAddress ?? "N/A"}
Inspection number: ${inspection.inspectionNumber}
Damage classifications: ${classificationSummary}
Year built: ${inspection.propertyYearBuilt ?? "unknown"}

Make-safe action status:
${actionLines || "No actions recorded."}

Summary: ${completed.length} of ${applicable.length} applicable actions complete. ${outstanding.length} outstanding.

Write a concise make-safe report (max 200 words) suitable for insurer handover. Use professional restoration industry language. Reference IICRC S500 §3.1 where appropriate. Note any outstanding actions that must be completed before restoration proceeds.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const reportText =
    response.content[0].type === "text" ? response.content[0].text : "";

  return NextResponse.json({
    inspectionId,
    generatedAt: new Date().toISOString(),
    report: reportText,
    actionSummary: {
      total: applicable.length,
      completed: completed.length,
      outstanding: outstanding.length,
      allComplete: outstanding.length === 0 && applicable.length > 0,
    },
  });
}
