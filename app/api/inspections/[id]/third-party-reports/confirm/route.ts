/**
 * POST /api/inspections/[id]/third-party-reports/confirm
 * RA-7687 slice 1 - write ONLY the facts the technician accepted or edited.
 *
 * Body: { sha256, fileName, author?, reportDate?, decisions: [{ field, value,
 *   pageRef, quote, action: "accept" | "edit" | "dismiss" }] }
 *
 * A dismissed fact is never written. The write is one transaction that is
 * gated by the caller's inspection scope, and it leaves one AuditLog row
 * naming the document (SHA-256), each fact's page and what it replaced.
 * Whatever is written lands in the lab-result columns of the existing mould
 * assessment, never in a clearance or condition field.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  assertInspectionAssignedWrite,
  writeWithinInspectionScope,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import {
  confirmBodySchema,
  containsUnsupportedClaim,
  normaliseFactValue,
  type LabField,
} from "@/lib/third-party-report/schema";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const userId = session.user.id;
    const { id: inspectionId } = await params;

    const tenancy = await assertInspectionAssignedWrite(session, inspectionId);
    if (!tenancy.ok) {
      return NextResponse.json(
        { error: tenancy.reason },
        { status: tenancy.status },
      );
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Request too large",
        status: 400,
      });
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON",
        status: 400,
      });
    }
    const parsed = confirmBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    // Validate every decided value before anything is written. One bad value
    // refuses the whole request, so a half-applied review cannot happen.
    const accepted = new Map<
      LabField,
      { value: string | number; pageRef: number; edited: boolean }
    >();
    let dismissed = 0;
    for (const d of body.decisions) {
      if (d.action === "dismiss") {
        dismissed++;
        continue;
      }
      const value = normaliseFactValue(d.field, d.value);
      if (
        value === null ||
        (typeof value === "string" && containsUnsupportedClaim(value))
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Value for ${d.field} is not valid`,
          status: 400,
        });
      }
      if (accepted.has(d.field)) {
        return apiError(request, {
          code: "VALIDATION",
          message: `More than one value for ${d.field}`,
          status: 400,
        });
      }
      accepted.set(d.field, {
        value,
        pageRef: d.pageRef,
        edited: d.action === "edit",
      });
    }

    if (accepted.size === 0) {
      return NextResponse.json({ written: 0, dismissed });
    }

    const data: Record<string, string | number | Date> = {};
    for (const [field, { value }] of accepted) {
      data[field] =
        field === "samplingDate"
          ? new Date(`${value}T00:00:00.000Z`)
          : (value as string | number);
    }

    const result = await writeWithinInspectionScope(
      tenancy.data.inspectionManyWhere,
      { updatedAt: new Date() },
      async (tx) => {
        const before = await tx.mouldRemediationAssessment.findUnique({
          where: { inspectionId },
          select: {
            labName: true,
            labReportReference: true,
            samplingDate: true,
            sporeType: true,
            sporeCountPreRemediation: true,
            outdoorBaselineCount: true,
            sporeCountPostRemediation: true,
          },
        });
        const record = await tx.mouldRemediationAssessment.upsert({
          where: { inspectionId },
          create: { inspectionId, ...data },
          update: data,
          select: { id: true },
        });
        const previous: Record<string, unknown> = {};
        for (const field of accepted.keys()) previous[field] = before?.[field] ?? null;
        await tx.auditLog.create({
          data: {
            inspectionId,
            userId,
            action: "third_party_report_facts_accepted",
            entityType: "MouldRemediationAssessment",
            entityId: record.id,
            changes: JSON.stringify({
              source: {
                kind: "third_party_report",
                fileName: body.fileName,
                sha256: body.sha256,
                author: body.author ?? null,
                reportDate: body.reportDate ?? null,
              },
              facts: [...accepted].map(([field, v]) => ({
                field,
                pageRef: v.pageRef,
                edited: v.edited,
              })),
              dismissed,
            }),
            previousValue: JSON.stringify(previous),
            newValue: JSON.stringify(Object.fromEntries(
              [...accepted].map(([field, v]) => [field, v.value]),
            )),
          },
        });
        return record;
      },
    );

    // The scoped parent update claimed nothing: not this caller's job.
    if (!result) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }
    return NextResponse.json({ written: accepted.size, dismissed });
  } catch (err) {
    return fromException(request, err, {
      stage: "third-party-reports:confirm",
    });
  }
}
