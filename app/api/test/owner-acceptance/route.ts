/**
 * Local-only fixture for the owner lifecycle Playwright acceptance journey.
 *
 * This route never calls storage, email, AI, or payment providers. It exists
 * solely to persist synthetic browser uploads and to supply lifecycle evidence
 * that has no rendered control yet (estimate promotion and mock settlement).
 */
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { testHelpersBlocked } from "../_helpers";

const MOCK_PHOTO_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%231c2e47'/%3E%3Ctext x='24' y='96' fill='white' font-size='20'%3EMOCK E2E EVIDENCE%3C/text%3E%3C/svg%3E";
const MOCK_FLOOR_PLAN_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='320'%3E%3Crect width='480' height='320' fill='white' stroke='%231c2e47' stroke-width='8'/%3E%3Cpath d='M240 0v320M0 160h480' stroke='%238a6b4e' stroke-width='5'/%3E%3Ctext x='24' y='44' fill='%231c2e47' font-size='22'%3EMOCK FLOOR PLAN%3C/text%3E%3C/svg%3E";

type Action =
  | "mock-photo"
  | "mock-floor-plan"
  | "inspect-draft"
  | "prepare-review"
  | "mock-settlement";

interface FixtureBody {
  action?: Action;
  inspectionId?: string;
  clientEmail?: string;
  portalPassword?: string;
}

function blocked(request: NextRequest): boolean {
  const host = request.nextUrl.hostname;
  const localHost = host === "localhost" || host === "127.0.0.1";
  return (
    testHelpersBlocked() ||
    process.env.ALLOW_LOCAL_ACCEPTANCE_FIXTURES !== "true" ||
    !localHost
  );
}

export async function POST(request: NextRequest) {
  if (blocked(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as FixtureBody;
  if (!body.action || !body.inspectionId) {
    return NextResponse.json(
      { error: "action and inspectionId are required" },
      { status: 400 },
    );
  }

  const inspection = await prisma.inspection.findFirst({
    where: { id: body.inspectionId, userId: session.user.id },
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      propertyPostcode: true,
      reportId: true,
      moistureReadings: {
        select: {
          location: true,
          surfaceType: true,
          moistureLevel: true,
          depth: true,
        },
        take: 100,
      },
      affectedAreas: {
        select: {
          roomZoneId: true,
          affectedSquareFootage: true,
          waterSource: true,
        },
        take: 100,
      },
      _count: {
        select: {
          moistureReadings: true,
          affectedAreas: true,
          scopeItems: true,
          photos: true,
        },
      },
    },
  });

  if (!inspection) {
    return NextResponse.json(
      { error: "Inspection not found" },
      { status: 404 },
    );
  }

  if (body.action === "mock-photo") {
    const id = `${inspection.id}-mock-photo`;
    const photo = await prisma.inspectionPhoto.upsert({
      where: { id },
      create: {
        id,
        inspectionId: inspection.id,
        url: MOCK_PHOTO_URL,
        thumbnailUrl: MOCK_PHOTO_URL,
        location: "Master Bedroom",
        description: "Synthetic Playwright evidence; no provider upload",
        mimeType: "image/svg+xml",
        labelledBy: "HUMAN_TECH",
      },
      update: {
        url: MOCK_PHOTO_URL,
        thumbnailUrl: MOCK_PHOTO_URL,
      },
      select: { id: true, url: true },
    });
    return NextResponse.json({ photo });
  }

  if (body.action === "mock-floor-plan") {
    await prisma.inspection.update({
      where: { id: inspection.id },
      data: { floorPlanImageUrl: MOCK_FLOOR_PLAN_URL },
    });
    return NextResponse.json({ imageUrl: MOCK_FLOOR_PLAN_URL });
  }

  if (body.action === "inspect-draft") {
    const refreshed = await prisma.inspection.findUnique({
      where: { id: inspection.id },
      select: {
        floorPlanImageUrl: true,
        scopeItems: {
          select: {
            description: true,
            isSelected: true,
            specification: true,
          },
          orderBy: { createdAt: "asc" },
          take: 100,
        },
        _count: {
          select: {
            moistureReadings: true,
            affectedAreas: true,
            scopeItems: true,
            photos: true,
          },
        },
      },
    });
    return NextResponse.json({ inspection: refreshed });
  }

  const reportId = `${inspection.id}-acceptance-report`;
  const estimateId = `${inspection.id}-acceptance-estimate`;

  if (body.action === "prepare-review") {
    if (!body.clientEmail || !body.portalPassword) {
      return NextResponse.json(
        { error: "clientEmail and portalPassword are required" },
        { status: 400 },
      );
    }
    const client = await prisma.client.findFirst({
      where: { userId: session.user.id, email: body.clientEmail },
      select: { id: true, name: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const costEstimationDocument = [
      "SYNTHETIC LOCAL ACCEPTANCE FIXTURE — NOT A CUSTOMER ESTIMATE",
      "Mock water extraction and structural drying: $1,000.00 ex GST",
      "GST (10%): $100.00",
      "Total inc GST: $1,100.00",
    ].join("\n");
    const commercialParams = JSON.stringify({
      overheadsPercent: 0,
      profitPercent: 0,
      overheadsAppliedTo: ["labour", "equipment", "subs", "materials"],
      profitAppliedAfter: true,
      contingencyPercent: 0,
      contingencyRationale: "Synthetic acceptance fixture",
      escalationPercent: 0,
      escalationNote: "",
      gstPercent: 10,
      roundTo: 0,
    });
    await prisma.report.upsert({
      where: { id: reportId },
      create: {
        id: reportId,
        title: `Mock acceptance report ${inspection.inspectionNumber}`,
        clientName: client.name,
        clientId: client.id,
        propertyAddress: inspection.propertyAddress,
        propertyPostcode: inspection.propertyPostcode,
        hazardType: "WATER",
        insuranceType: "BUILDING",
        status: "COMPLETED",
        reportNumber: `MOCK-${inspection.inspectionNumber}`,
        waterCategory: "1",
        waterClass: "2",
        sourceOfWater: "Burst pipe (synthetic acceptance fixture)",
        totalCost: 1100,
        costEstimationDocument,
        inspectionDate: new Date(),
        moistureReadings: JSON.stringify(inspection.moistureReadings),
        scopeAreas: JSON.stringify(inspection.affectedAreas),
        equipmentSelection: JSON.stringify([]),
        userId: session.user.id,
      },
      update: {
        clientId: client.id,
        clientName: client.name,
        status: "COMPLETED",
        totalCost: 1100,
        costEstimationDocument,
        moistureReadings: JSON.stringify(inspection.moistureReadings),
        scopeAreas: JSON.stringify(inspection.affectedAreas),
      },
    });

    const passwordHash = await bcrypt.hash(body.portalPassword, 10);
    await prisma.clientUser.upsert({
      where: { email: body.clientEmail.toLowerCase() },
      create: {
        email: body.clientEmail.toLowerCase(),
        passwordHash,
        name: client.name,
        clientId: client.id,
        mustChangePassword: false,
      },
      update: {
        passwordHash,
        name: client.name,
        clientId: client.id,
        mustChangePassword: false,
      },
    });

    await prisma.inspection.update({
      where: { id: inspection.id },
      data: { reportId, status: "ESTIMATED" },
    });

    await prisma.estimate.upsert({
      where: { id: estimateId },
      create: {
        id: estimateId,
        reportId,
        status: "CLIENT_REVIEW",
        version: 1,
        subtotalExGST: 1000,
        gst: 100,
        totalIncGST: 1100,
        commercialParams,
        estimatedDuration: 3,
        createdBy: session.user.id,
        updatedBy: session.user.id,
        userId: session.user.id,
        lineItems: {
          create: {
            code: "LAB-MOCK",
            category: "Mitigation/Drying",
            description:
              "Mock technician water extraction and structural drying",
            qty: 1,
            unit: "item",
            rate: 1000,
            subtotal: 1000,
            createdBy: session.user.id,
          },
        },
      },
      update: {
        status: "CLIENT_REVIEW",
        subtotalExGST: 1000,
        gst: 100,
        totalIncGST: 1100,
        commercialParams,
        updatedBy: session.user.id,
      },
    });

    await prisma.claimProgress.upsert({
      where: { reportId },
      create: {
        reportId,
        inspectionId: inspection.id,
        currentState: "CLOSEOUT",
      },
      update: { inspectionId: inspection.id, currentState: "CLOSEOUT" },
    });

    return NextResponse.json({ reportId, estimateId });
  }

  if (body.action === "mock-settlement") {
    const invoice = await prisma.invoice.findFirst({
      where: {
        userId: session.user.id,
        reportId,
        source: `inspection:${inspection.id}`,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, totalIncGST: true },
    });
    if (!invoice) {
      return NextResponse.json(
        { error: "Generated invoice not found" },
        { status: 409 },
      );
    }

    const publicToken = `mock-owner-acceptance-${inspection.id}`;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "PAID",
          amountPaid: invoice.totalIncGST,
          amountDue: 0,
          paidDate: now,
          publicToken,
          publicTokenExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      await tx.invoicePayment.upsert({
        where: { stripePaymentIntentId: `mock_pi_${inspection.id}` },
        create: {
          amount: invoice.totalIncGST,
          paymentMethod: "STRIPE",
          reference: `MOCK-ONLY-${inspection.inspectionNumber}`,
          notes: "Synthetic Playwright provider receipt; no Stripe call",
          stripePaymentIntentId: `mock_pi_${inspection.id}`,
          stripeChargeId: `mock_ch_${inspection.id}`,
          reconciled: true,
          reconciledAt: now,
          reconciledBy: session.user.id,
          invoiceId: invoice.id,
          userId: session.user.id,
        },
        update: {
          reconciled: true,
          reconciledAt: now,
          reconciledBy: session.user.id,
          invoiceId: invoice.id,
        },
      });
      const delivery = await tx.auditLog.findFirst({
        where: {
          inspectionId: inspection.id,
          action: "REPORT_DELIVERED",
          entityType: "Report",
          entityId: reportId,
        },
        select: { id: true },
      });
      if (!delivery) {
        await tx.auditLog.create({
          data: {
            inspectionId: inspection.id,
            action: "REPORT_DELIVERED",
            entityType: "Report",
            entityId: reportId,
            userId: session.user.id,
            changes: JSON.stringify({ provider: "MOCK_E2E", delivered: true }),
          },
        });
      }
      await tx.inspection.update({
        where: { id: inspection.id },
        data: { status: "IN_BILLING" },
      });
      await tx.claimProgress.updateMany({
        where: { inspectionId: inspection.id },
        data: { previousState: "INVOICE_ISSUED", currentState: "INVOICE_PAID" },
      });
    });

    return NextResponse.json({ invoiceId: invoice.id, publicToken });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
