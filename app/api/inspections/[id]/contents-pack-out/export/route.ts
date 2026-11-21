/**
 * GET /api/inspections/[id]/contents-pack-out/export — RA-8501 (DRC S8)
 *
 * The job's contents inventory as an Excel file: a "Claim details" sheet and
 * an "Inventory" sheet (lib/contents/inventory-workbook.ts).
 *
 * Reach: a read (D-023), so `assertInspectionReadable`. The list GET's
 * `assertInspectionTenancy` is the WRITE scope, which would give a manager a
 * 404 on a colleague's job. Another business still gets 404.
 *
 * Money: the replacement value and restoration estimate columns are added only
 * for a caller whose role, read from the database, is ADMIN or MANAGER
 * (`assertFinancialWriter`, FINANCIAL_WRITER_ROLES). Anyone else, a technician
 * included, gets the same file without those columns. Fails closed: a missing
 * user row means no money. When RA-8494's `canSeeMoney` reaches main this
 * route moves onto it.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertFinancialWriter,
  assertInspectionReadable,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { buildContentsInventoryWorkbook } from "@/lib/contents/inventory-workbook";

/** Rows read per query. */
const PAGE_SIZE = 500;
/**
 * The most items one file carries. A job with more is refused with 413, never
 * cut short: a file that silently drops item 501 onward reads as the whole
 * inventory (RA-8501 review round 1).
 */
const EXPORT_ITEM_MAX = 5000;

const ITEM_SELECT_BASE = {
  id: true,
  itemDescription: true,
  make: true,
  model: true,
  serialNumber: true,
  packOutDecision: true,
  packOutTag: true,
  conditionPreLoss: true,
  conditionPostLoss: true,
  beforePhotoUrl: true,
  afterPhotoUrl: true,
  sketchRoom: { select: { name: true } },
} as const;

type ExportItem = {
  id: string;
  itemDescription: string;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  packOutDecision: string | null;
  packOutTag: string | null;
  conditionPreLoss: string | null;
  conditionPostLoss: string | null;
  beforePhotoUrl: string | null;
  afterPhotoUrl: string | null;
  sketchRoom: { name: string } | null;
  replacementValueAud?: { toString(): string } | null;
  restorationCostEstimate?: { toString(): string } | null;
};

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "job";
}

export async function GET(
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
    const { id } = await params;

    const reach = await assertInspectionReadable(session, id);
    if (!reach.ok) {
      return apiError(request, {
        code: reach.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
        message: reach.status === 401 ? "Unauthorized" : "Inspection not found",
        status: reach.status === 401 ? 401 : 404,
      });
    }

    const includeMoney = (await assertFinancialWriter(session)).ok;

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: {
        inspectionNumber: true,
        jobNumber: true,
        propertyAddress: true,
        propertyPostcode: true,
        claimNumber: true,
        policyNumber: true,
        clientType: true,
        insuredName: true,
        claimType: true,
        inspectionDate: true,
        technicianName: true,
        insurerProfile: { select: { name: true } },
      },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // Money is not even read for a caller who may not see it.
    const select = includeMoney
      ? {
          ...ITEM_SELECT_BASE,
          replacementValueAud: true,
          restorationCostEstimate: true,
        }
      : ITEM_SELECT_BASE;

    // Every item, page by page (keyset on id, in creation order). Reading one
    // page past the maximum is enough to know the job is too large for one file.
    const items: ExportItem[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: ExportItem[] = await prisma.contentsPackOutItem.findMany({
        where: { inspectionId: id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select,
      });
      items.push(...page);
      if (items.length > EXPORT_ITEM_MAX) {
        return apiError(request, {
          code: "VALIDATION",
          message: `This job has more than ${EXPORT_ITEM_MAX} contents items, too many for one file.`,
          status: 413,
        });
      }
      if (page.length < PAGE_SIZE) break;
      cursor = page[page.length - 1].id;
    }

    const buffer = await buildContentsInventoryWorkbook({
      includeMoney,
      claim: {
        jobNumber: inspection.jobNumber,
        inspectionNumber: inspection.inspectionNumber,
        propertyAddress: inspection.propertyAddress,
        propertyPostcode: inspection.propertyPostcode,
        claimNumber: inspection.claimNumber,
        policyNumber: inspection.policyNumber,
        insurerName: inspection.insurerProfile?.name ?? null,
        clientType: inspection.clientType,
        insuredName: inspection.insuredName,
        claimType: inspection.claimType,
        inspectionDate: inspection.inspectionDate,
        technicianName: inspection.technicianName,
      },
      items: items.map(({ id: _id, sketchRoom, ...item }) => ({
        ...item,
        roomName: sketchRoom?.name ?? null,
      })),
    });

    const filename = `contents-inventory-${safeFilePart(
      inspection.jobNumber ?? inspection.inspectionNumber,
    )}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return fromException(request, err, { stage: "contents-pack-out:export" });
  }
}
