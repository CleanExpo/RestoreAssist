import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ClaimState, InspectionStatus, type Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { canTransition } from "@/lib/lifecycle/inspection-state-machine";
import { writeLifecycleTransition } from "@/lib/audit/lifecycle-event";
import { onNextAction } from "@/lib/lifecycle/subscribers/next-action";
import { resolveUserGstTreatment } from "@/lib/gst/resolve-user-gst";

const toCents = (amount: number | null) => Math.round((amount ?? 0) * 100);

const gstRateForTaxType = (taxType: string, tenantRate: number) =>
  taxType === "EXEMPT" || taxType === "EXEMPTOUTPUT" || taxType === "NONE"
    ? 0
    : tenantRate;

const ISSUE_INVOICE_CONTEXT = {
  invoiceStatus: null,
  invoiceHasUnreconciledPayment: false,
  reportStatus: null,
  reportDeliveredAt: null,
  handoverCompletedAt: null,
} as const;

class BillingTransitionConflict extends Error {}

const existingInvoiceSelect = {
  id: true,
  invoiceNumber: true,
  totalIncGST: true,
  lineItems: {
    orderBy: { sortOrder: "asc" as const },
    take: 500,
    select: { id: true },
  },
} satisfies Prisma.InvoiceSelect;

function invoiceResponse(
  invoice: {
    id: string;
    invoiceNumber: string;
    totalIncGST: number;
    lineItems: { id: string }[];
  },
  reused: boolean,
) {
  return NextResponse.json(
    {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalIncGST: invoice.totalIncGST,
      lineItemCount: invoice.lineItems.length,
      reused,
    },
    { status: reused ? 200 : 201 },
  );
}

async function advanceInspectionToBilling(
  tx: Prisma.TransactionClient,
  args: {
    inspectionId: string;
    userId: string;
    actorName: string;
    actorRole: string;
  },
): Promise<"transitioned" | "already-in-billing"> {
  const cas = await tx.inspection.updateMany({
    where: {
      id: args.inspectionId,
      userId: args.userId,
      status: InspectionStatus.SUBMITTED,
      signedAt: { not: null },
    },
    data: { status: InspectionStatus.IN_BILLING },
  });

  if (cas.count === 0) {
    const current = await tx.inspection.findFirst({
      where: { id: args.inspectionId, userId: args.userId },
      select: { status: true, signedAt: true },
    });
    if (current?.status === InspectionStatus.IN_BILLING && current.signedAt) {
      return "already-in-billing";
    }
    throw new BillingTransitionConflict();
  }

  await writeLifecycleTransition({
    inspectionId: args.inspectionId,
    fromState: ClaimState.CLOSEOUT,
    toState: ClaimState.INVOICE_ISSUED,
    transitionKey: "issue_invoice",
    actorUserId: args.userId,
    actorRole: args.actorRole,
    actorName: args.actorName,
    guardSnapshot: {
      previousInspectionStatus: InspectionStatus.SUBMITTED,
      newInspectionStatus: InspectionStatus.IN_BILLING,
      signed: true,
    } as Prisma.InputJsonValue,
    auditAction: "INVOICE_ISSUED",
    prismaTx: tx,
  });

  await tx.claimProgress.updateMany({
    where: { inspectionId: args.inspectionId },
    data: {
      previousState: ClaimState.CLOSEOUT,
      currentState: ClaimState.INVOICE_ISSUED,
    },
  });

  return "transitioned";
}

// GET — return existing invoice generated from this inspection (if any)
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

    // Verify ownership
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, inspectionNumber: true },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // Prefer durable source key `inspection:{id}`; fall back to legacy notes match
    const invoice = await prisma.invoice.findFirst({
      where: {
        userId: session.user.id,
        OR: [
          { source: `inspection:${inspection.id}` },
          {
            source: "inspection",
            notes: { contains: inspection.inspectionNumber },
          },
          { notes: { contains: inspection.inspectionNumber } },
        ],
      },
      include: {
        lineItems: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            description: true,
            category: true,
            quantity: true,
            unitPrice: true,
            xeroAccountCode: true,
            subtotal: true,
            gstRate: true,
            gstAmount: true,
            total: true,
            discountAmount: true,
            sortOrder: true,
            invoiceId: true,
            estimateLineItemId: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!invoice) {
      return NextResponse.json({ invoice: null });
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    return fromException(request, error, {
      stage: "inspection-generate-invoice-get",
    });
  }
}

// POST — generate an Invoice from the inspection's latest approved Estimate
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
  const { id } = await params;

  // RA-1266: CRITICAL — generates an Invoice from an approved estimate. Retry
  // without idempotency would create two invoices for the same job.
  return withIdempotency(request, userId, async () => {
    try {
      const gstTreatment = await resolveUserGstTreatment(userId);
      // Resolve the inspection, report and client in one tenant-scoped query.
      const inspection = await prisma.inspection.findFirst({
        where: { id, userId },
        select: {
          id: true,
          status: true,
          signedAt: true,
          reportId: true,
          inspectionNumber: true,
          propertyAddress: true,
          report: {
            select: {
              id: true,
              userId: true,
              title: true,
              propertyAddress: true,
              clientId: true,
              client: {
                select: {
                  id: true,
                  userId: true,
                  name: true,
                  email: true,
                  phone: true,
                  address: true,
                },
              },
            },
          },
        },
      });

      if (!inspection) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Inspection not found",
          status: 404,
        });
      }

      if (
        !inspection.reportId ||
        !inspection.report ||
        inspection.report.userId !== userId
      ) {
        return apiError(request, {
          code: "CONFLICT",
          message: "A linked report is required before generating an invoice.",
          status: 409,
        });
      }

      const report = inspection.report;
      const client = report.client;
      if (!report.clientId || !client || client.userId !== userId) {
        return apiError(request, {
          code: "CONFLICT",
          message:
            "A client linked to the report is required before generating an invoice.",
          status: 409,
        });
      }

      if (!inspection.signedAt) {
        return apiError(request, {
          code: "CONFLICT",
          message:
            "Inspection sign-off is required before generating an invoice.",
          status: 409,
        });
      }

      const currentStatus = inspection.status as InspectionStatus;
      if (currentStatus !== InspectionStatus.IN_BILLING) {
        const gate = canTransition(
          currentStatus,
          InspectionStatus.IN_BILLING,
          ISSUE_INVOICE_CONTEXT,
        );
        if (!gate.ok) {
          return NextResponse.json(
            {
              error: {
                code: "CONFLICT",
                message: `Inspection cannot enter billing from ${inspection.status}.`,
              },
              missing: gate.missing,
            },
            { status: 409 },
          );
        }
      }

      const billingActor = {
        inspectionId: inspection.id,
        userId,
        actorName: session.user.name ?? "User",
        actorRole: session.user.role ?? "USER",
      };

      // A durable source + report + estimate link is the business-level
      // idempotency fallback. It protects replays after the 24-hour
      // Idempotency-Key cache expires and callers that accidentally send a
      // fresh key for the same inspection.
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          userId,
          reportId: report.id,
          estimateId: { not: null },
          source: `inspection:${inspection.id}`,
        },
        select: existingInvoiceSelect,
        orderBy: { createdAt: "desc" },
      });

      if (existingInvoice) {
        if (currentStatus !== InspectionStatus.IN_BILLING) {
          const billingResult = await prisma.$transaction((tx) =>
            advanceInspectionToBilling(tx, billingActor),
          );
          if (billingResult === "transitioned") {
            void onNextAction(inspection.id, InspectionStatus.IN_BILLING).catch(
              (error) =>
                console.error("[next-action] IN_BILLING nudge failed:", error),
            );
          }
        }
        return invoiceResponse(existingInvoice, true);
      }

      const estimate = await prisma.estimate.findFirst({
        where: {
          reportId: inspection.reportId,
          userId,
          status: "APPROVED",
        },
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          overheads: true,
          profit: true,
          contingency: true,
          escalation: true,
          totalIncGST: true,
          lineItems: {
            orderBy: { displayOrder: "asc" },
            take: 500,
            select: {
              id: true,
              code: true,
              category: true,
              description: true,
              qty: true,
              unit: true,
              rate: true,
              subtotal: true,
              isPassThrough: true,
              taxType: true,
              xeroAccountCode: true,
            },
          },
        },
      });

      if (!estimate || estimate.lineItems.length === 0) {
        return apiError(request, {
          code: "CONFLICT",
          message:
            "An approved estimate with line items is required before generating an invoice.",
          status: 409,
        });
      }

      // Due date: 14 days from now
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);

      // Build line items
      let subtotalExGST = 0;
      let gstAmount = 0;

      const lineItemsData: Prisma.InvoiceLineItemCreateWithoutInvoiceInput[] =
        estimate.lineItems.map((item, index) => {
          const unitPrice = toCents(item.rate);
          const subtotal = toCents(item.subtotal);
          const gstRate = gstRateForTaxType(
            item.taxType,
            gstTreatment.ratePercent,
          );
          const itemGst = Math.round(subtotal * (gstRate / 100));
          const total = subtotal + itemGst;

          subtotalExGST += subtotal;
          gstAmount += itemGst;

          return {
            description: item.description,
            category: item.category,
            quantity: item.qty,
            unitPrice,
            subtotal,
            gstRate,
            gstAmount: itemGst,
            total,
            sortOrder: index,
            estimateLineItemId: item.id,
            code: item.code,
            unit: item.unit,
            isPassThrough: item.isPassThrough,
            taxType:
              gstRate === 0 ? item.taxType : gstTreatment.xeroTaxType,
            xeroAccountCode: item.xeroAccountCode,
          };
        });

      const commercialAdjustments = [
        ["Overheads", estimate.overheads],
        ["Profit", estimate.profit],
        ["Contingency", estimate.contingency],
        ["Escalation", estimate.escalation],
      ] as const;

      for (const [description, amount] of commercialAdjustments) {
        const subtotal = toCents(amount);
        if (subtotal === 0) continue;

        const itemGst = Math.round(subtotal * gstTreatment.rate);
        subtotalExGST += subtotal;
        gstAmount += itemGst;
        lineItemsData.push({
          description,
          category: "Commercial adjustment",
          quantity: 1,
          unitPrice: subtotal,
          subtotal,
          gstRate: gstTreatment.ratePercent,
          gstAmount: itemGst,
          total: subtotal + itemGst,
          sortOrder: lineItemsData.length,
          estimateLineItemId: null,
          code: null,
          unit: "item",
          isPassThrough: false,
          taxType: gstTreatment.xeroTaxType,
          xeroAccountCode: null,
        });
      }

      const calculatedTotalIncGST = subtotalExGST + gstAmount;
      const totalIncGST =
        estimate.totalIncGST !== null && Number.isFinite(estimate.totalIncGST)
          ? toCents(estimate.totalIncGST)
          : calculatedTotalIncGST;
      const adjustmentAmount = totalIncGST - calculatedTotalIncGST;
      const notes = `Generated from approved estimate ${estimate.id} (version ${estimate.version}) for inspection ${inspection.inspectionNumber}`;

      // Use the invoice sequence to generate a number, within a transaction
      const year = new Date().getFullYear();

      const runCreate = async () =>
        prisma.$transaction(async (tx) => {
          // Re-check inside the transaction so different idempotency keys or
          // concurrent callers cannot consume a second sequence number.
          const existingInvoice = await tx.invoice.findFirst({
            where: {
              userId,
              reportId: report.id,
              estimateId: estimate.id,
              source: `inspection:${inspection.id}`,
            },
            select: existingInvoiceSelect,
            orderBy: { createdAt: "desc" },
          });
          if (existingInvoice) {
            const billingResult = await advanceInspectionToBilling(
              tx,
              billingActor,
            );
            return {
              kind: "existing" as const,
              invoice: existingInvoice,
              billingResult,
            };
          }

          // APPROVED -> LOCKED is an existing lifecycle transition. Keeping
          // this compare-and-set in the invoice transaction means a failed
          // create leaves the approved estimate available for a safe retry.
          const locked = await tx.estimate.updateMany({
            where: { id: estimate.id, userId, status: "APPROVED" },
            data: { status: "LOCKED", updatedBy: userId },
          });
          if (locked.count === 0) {
            // A concurrent transaction may have created the invoice and
            // locked the estimate while this request was waiting.
            const racedInvoice = await tx.invoice.findFirst({
              where: {
                userId,
                reportId: report.id,
                estimateId: estimate.id,
                source: `inspection:${inspection.id}`,
              },
              select: existingInvoiceSelect,
              orderBy: { createdAt: "desc" },
            });
            if (!racedInvoice) {
              return { kind: "estimate-unavailable" as const };
            }
            const billingResult = await advanceInspectionToBilling(
              tx,
              billingActor,
            );
            return {
              kind: "existing" as const,
              invoice: racedInvoice,
              billingResult,
            };
          }

          const billingResult = await advanceInspectionToBilling(
            tx,
            billingActor,
          );

          const sequence = await tx.invoiceSequence.upsert({
            where: { userId_year: { userId: userId, year } },
            update: { lastNumber: { increment: 1 } },
            create: {
              userId: userId,
              year,
              prefix: "RA",
              lastNumber: 1,
            },
          });
          const invoiceNumber = `${sequence.prefix}-${year}-${String(sequence.lastNumber).padStart(4, "0")}`;

          const invoice = await tx.invoice.create({
            data: {
              invoiceNumber,
              status: "DRAFT",
              userId,
              reportId: report.id,
              estimateId: estimate.id,
              clientId: client.id,
              customerName: client.name,
              customerEmail: client.email,
              customerPhone: client.phone,
              customerAddress: client.address ?? report.propertyAddress,
              reportTitleSnapshot: report.title,
              reportAddressSnapshot: report.propertyAddress,
              estimateRefSnapshot: `Estimate-${estimate.id.slice(0, 8)}-v${estimate.version}`,
              clientNameSnapshot: client.name,
              invoiceDate: new Date(),
              dueDate,
              subtotalExGST,
              gstAmount,
              totalIncGST,
              amountDue: totalIncGST,
              currency: gstTreatment.currency,
              adjustmentAmount,
              adjustmentNote:
                adjustmentAmount === 0
                  ? null
                  : "Approved estimate total rounding adjustment",
              notes,
              source: `inspection:${inspection.id}`,
              lineItems: {
                create: lineItemsData,
              },
            },
            include: {
              // Only `lineItems.length` is read in the response (line below);
              // selecting `id` keeps the relation contract explicit.
              lineItems: {
                orderBy: { sortOrder: "asc" },
                select: { id: true },
              },
            },
          });

          await tx.invoiceAuditLog.create({
            data: {
              invoiceId: invoice.id,
              userId: userId,
              action: "created",
              description: `Invoice ${invoiceNumber} generated from inspection ${inspection.inspectionNumber}`,
            },
          });

          await tx.auditLog.create({
            data: {
              inspectionId: inspection.id,
              action: "ESTIMATE_LOCKED_FOR_INVOICE",
              entityType: "Estimate",
              entityId: estimate.id,
              userId,
              changes: JSON.stringify({
                from: "APPROVED",
                to: "LOCKED",
                invoiceId: invoice.id,
                invoiceNumber,
              }),
              previousValue: "APPROVED",
              newValue: "LOCKED",
            },
          });

          return { kind: "created" as const, invoice, billingResult };
        });

      let result;
      try {
        result = await runCreate();
      } catch (firstError: any) {
        if (firstError?.code === "P2002") {
          // Sequence conflict — sync and retry
          const prefix = "RA";
          const latestInvoice = await prisma.invoice.findFirst({
            where: {
              userId: userId,
              invoiceNumber: { startsWith: `${prefix}-${year}-` },
            },
            select: { invoiceNumber: true },
            orderBy: { invoiceNumber: "desc" },
          });
          const latestNumber = latestInvoice
            ? parseInt(
                latestInvoice.invoiceNumber.replace(`${prefix}-${year}-`, ""),
                10,
              )
            : 0;
          const maxNum = Number.isNaN(latestNumber) ? 0 : latestNumber;
          await prisma.invoiceSequence.upsert({
            where: { userId_year: { userId: userId, year } },
            update: { lastNumber: maxNum },
            create: {
              userId: userId,
              year,
              prefix: "RA",
              lastNumber: maxNum,
            },
          });
          result = await runCreate();
        } else {
          throw firstError;
        }
      }

      if (result.kind === "estimate-unavailable") {
        return apiError(request, {
          code: "CONFLICT",
          message:
            "The approved estimate is no longer available for invoice generation.",
          status: 409,
        });
      }

      if (result.billingResult === "transitioned") {
        void onNextAction(inspection.id, InspectionStatus.IN_BILLING).catch(
          (error) =>
            console.error("[next-action] IN_BILLING nudge failed:", error),
        );
      }

      return invoiceResponse(result.invoice, result.kind === "existing");
    } catch (error) {
      if (error instanceof BillingTransitionConflict) {
        return apiError(request, {
          code: "CONFLICT",
          message:
            "Inspection status changed before billing could begin. Refresh and try again.",
          status: 409,
        });
      }
      return fromException(request, error, {
        stage: "inspection-generate-invoice-post",
      });
    }
  });
}
