/**
 * POST /api/inspections/[id]/third-party-reports/confirm
 * RA-7687 slice 1 - write ONLY the facts the technician accepted or edited.
 *
 * Body: { proposalToken, decisions: [{ index, action: "accept" | "edit" |
 *   "dismiss", value? }] }
 *
 * The facts, pages and report hash come from the signed proposal the extract
 * route issued for this job and user, never from the client, so the audit row
 * cannot name a page or document the AI did not read. The client only decides:
 * `value` is read only for "edit". A dismissed fact is never written. The write
 * is one transaction gated by the caller's inspection scope and leaves one
 * AuditLog row naming the document (SHA-256), each fact's page and what it
 * replaced. Writes land in the lab-result columns of the existing mould
 * assessment through an allow-list, never in a condition or clearance field.
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
  LAB_FIELD_LABELS,
  normaliseFactValue,
  type LabField,
} from "@/lib/third-party-report/schema";
import { verifyProposal } from "@/lib/third-party-report/proposal-token";

const MAX_BODY_BYTES = 128 * 1024;

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

    const proposal = verifyProposal(body.proposalToken, {
      inspectionId,
      userId,
    });
    if (!proposal.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          proposal.reason === "expired"
            ? "This report read has expired. Read the report again."
            : "This report read is not valid for this job. Read the report again.",
        status: 400,
      });
    }
    const { facts, sha256, fileName, document } = proposal.payload;

    // Validate every decision before anything is written. One bad decision
    // refuses the whole request, so a half-applied review cannot happen.
    const accepted = new Map<
      LabField,
      { value: string | number; pageRef: number; edited: boolean }
    >();
    const decidedIndexes = new Set<number>();
    let dismissed = 0;
    for (const d of body.decisions) {
      const fact = facts[d.index];
      if (!fact || decidedIndexes.has(d.index)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "A decision does not match a fact in this report read",
          status: 400,
        });
      }
      decidedIndexes.add(d.index);
      if (d.action === "dismiss") {
        dismissed++;
        continue;
      }
      const value =
        d.action === "edit" ? normaliseFactValue(fact.field, d.value ?? "") : fact.value;
      if (value === null) {
        return apiError(request, {
          code: "VALIDATION",
          message: `The edited value for ${LAB_FIELD_LABELS[fact.field]} is not valid`,
          status: 400,
        });
      }
      if (accepted.has(fact.field)) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Choose one value for ${LAB_FIELD_LABELS[fact.field]}. The report gives more than one.`,
          status: 400,
        });
      }
      accepted.set(fact.field, {
        value,
        pageRef: fact.pageRef,
        edited: d.action === "edit",
      });
    }

    if (accepted.size === 0) {
      return NextResponse.json({ written: 0, dismissed, applied: {} });
    }

    const applied: Partial<Record<LabField, string | number>> = {};
    const data: Record<string, string | number | Date> = {};
    for (const [field, { value }] of accepted) {
      applied[field] = value;
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
                fileName,
                sha256,
                author: document.author,
                reportDate: document.reportDate,
              },
              facts: [...accepted].map(([field, v]) => ({
                field,
                pageRef: v.pageRef,
                edited: v.edited,
              })),
              dismissed,
            }),
            previousValue: JSON.stringify(previous),
            newValue: JSON.stringify(applied),
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
    return NextResponse.json({ written: accepted.size, dismissed, applied });
  } catch (err) {
    return fromException(request, err, {
      stage: "third-party-reports:confirm",
    });
  }
}
