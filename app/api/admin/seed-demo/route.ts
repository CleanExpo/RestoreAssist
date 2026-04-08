/**
 * RA-427: Admin Demo Seed Trigger
 *
 * POST /api/admin/seed-demo
 *   Runs the seed-demo.ts logic to create a complete S500:2025 demo job.
 *   Admin-only — requires session with role === "ADMIN".
 *   Idempotent: re-running is safe (skips if demo data already present).
 *
 * Returns: { seeded: boolean; message: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEMO_EMAIL = "demo@restoreassist.com.au";
const DEMO_INSPECTION_NUMBER = "NIR-2026-04-DEMO";
const DEMO_REPORT_NUMBER = "RA-DEMO-2026-0001";

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 },
      );
    }

    // Idempotency check
    const existing = await prisma.inspection.findUnique({
      where: { inspectionNumber: DEMO_INSPECTION_NUMBER },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({
        seeded: false,
        message: "Demo data already present — no changes made",
        inspectionId: existing.id,
      });
    }

    // ── 1. Demo user ─────────────────────────────────────────────────────────
    const now = new Date();
    const day1 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const day2 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const day3 = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: DEMO_EMAIL,
          name: "James Whitfield",
          role: "ADMIN",
          subscriptionStatus: "ACTIVE",
          subscriptionPlan: "professional",
          lifetimeAccess: true,
          businessName: "Whitfield Restoration Services Pty Ltd",
          businessAddress: "Unit 4, 18 Industrial Ave, Brookvale NSW 2100",
          businessABN: "12 345 678 901",
          businessPhone: "02 9876 5432",
          businessEmail: DEMO_EMAIL,
          hasPremiumInspectionReports: true,
          firstRunChecklistDismissedAt: day1,
        } as any,
      });
    }

    // ── 2. Demo organization ─────────────────────────────────────────────────
    let org = await prisma.organization.findFirst({
      where: { ownerId: user.id },
    });

    if (!org) {
      org = await prisma.organization.create({
        data: { name: "RestoreAssist Demo Tenant", ownerId: user.id },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { organizationId: org.id },
      });
    }

    // ── 3. Report ────────────────────────────────────────────────────────────
    const report = await prisma.report.create({
      data: {
        title: "Water Damage Restoration Report — 42 Harbourside Drive, Manly",
        description:
          "Category 2 grey water damage from washing machine supply hose failure. 150 m² affected across living room, kitchen, and hallway. 3-day structural drying program completed.",
        status: "COMPLETED",
        clientName: "Sarah Thompson",
        clientEmail: "sarah.thompson@example.com",
        clientPhone: "0412 345 678",
        propertyAddress: "42 Harbourside Drive, Manly NSW 2095",
        reportNumber: DEMO_REPORT_NUMBER,
        userId: user.id,
        organizationId: org.id,
        waterDamageCategory: "CATEGORY_2",
        waterDamageClass: "CLASS_2",
        iicrcClassification: "CLASS_2_CATEGORY_2",
        totalAffectedArea: 150,
        totalEstimatedCost: 8750.0,
        currency: "AUD",
        isS500Compliant: true,
        completedAt: day3,
        createdAt: day1,
        updatedAt: day3,
      } as any,
    });

    // ── 4. Client ────────────────────────────────────────────────────────────
    await prisma.client.create({
      data: {
        name: "Sarah Thompson",
        email: "sarah.thompson@example.com",
        phone: "0412 345 678",
        address: "42 Harbourside Drive, Manly NSW 2095",
        userId: user.id,
        organizationId: org.id,
      } as any,
    });

    // ── 5. Inspection ────────────────────────────────────────────────────────
    const inspection = await prisma.inspection.create({
      data: {
        inspectionNumber: DEMO_INSPECTION_NUMBER,
        propertyAddress: "42 Harbourside Drive, Manly NSW 2095",
        propertyType: "RESIDENTIAL",
        damageType: "WATER",
        status: "COMPLETED",
        category: "CATEGORY_2",
        class: "CLASS_2",
        iicrcCompliant: true,
        affectedAreaM2: 150,
        reportId: report.id,
        userId: user.id,
        organizationId: org.id,
        inspectedAt: day1,
        completedAt: day3,
        createdAt: day1,
        updatedAt: day3,
        notes:
          "Washing machine hose failure caused grey water release. Subfloor cavity affected — moisture readings confirm Category 2 classification. IICRC S500:2025 §6.3 applied.",
      } as any,
    });

    // ── 6. Moisture readings (14 readings over 3 days) ───────────────────────
    const rooms = ["Living Room", "Kitchen", "Hallway"];
    const materials = ["Plasterboard", "Timber Flooring", "Concrete Slab"];
    const readingDays = [day1, day1, day2, day2, day2, day3, day3];
    const values = [
      [28, 31, 26],
      [25, 29, 24],
      [19, 22, 18],
      [17, 20, 16],
      [15, 18, 14],
      [12, 14, 11],
      [11, 13, 10],
    ];

    await prisma.$transaction(
      readingDays.flatMap((date, dayIdx) =>
        rooms.map((location, roomIdx) =>
          prisma.moistureReading.create({
            data: {
              inspectionId: inspection.id,
              location,
              material: materials[roomIdx],
              moistureContent: values[dayIdx][roomIdx],
              unit: "PERCENT_WME",
              readingType: "STRUCTURAL",
              readingDate: date,
              notes:
                dayIdx === 0
                  ? "Initial reading"
                  : dayIdx >= 5
                    ? "Drying goal achieved per S500:2025 §8.4"
                    : null,
            } as any,
          }),
        ),
      ),
    );

    // ── 7. Scope items ────────────────────────────────────────────────────────
    const scopeItems = [
      {
        category: "DEMOLITION",
        description: "Remove and dispose of affected skirting boards",
        unit: "LM",
        quantity: 42,
        unitRate: 18.5,
        iicrcReference: "IICRC S500:2025 §7.2",
      },
      {
        category: "STRUCTURAL_DRYING",
        description:
          "Deploy 2× LGR dehumidifiers for 3-day structural drying program",
        unit: "DAY",
        quantity: 3,
        unitRate: 285.0,
        iicrcReference: "IICRC S500:2025 §8.1",
      },
      {
        category: "STRUCTURAL_DRYING",
        description: "Deploy 3× air movers for evaporative drying",
        unit: "DAY",
        quantity: 3,
        unitRate: 65.0,
        iicrcReference: "IICRC S500:2025 §8.2",
      },
      {
        category: "ANTIMICROBIAL",
        description:
          "Apply EPA-registered antimicrobial treatment to affected areas",
        unit: "M2",
        quantity: 150,
        unitRate: 8.75,
        iicrcReference: "IICRC S500:2025 §10.3",
      },
      {
        category: "REINSTATEMENT",
        description: "Supply and install replacement skirting boards",
        unit: "LM",
        quantity: 42,
        unitRate: 32.0,
        iicrcReference: null,
      },
    ];

    await prisma.$transaction(
      scopeItems.map((item, idx) =>
        prisma.scopeItem.create({
          data: {
            ...item,
            reportId: report.id,
            inspectionId: inspection.id,
            sortOrder: idx + 1,
            totalCost: item.quantity * item.unitRate,
          } as any,
        }),
      ),
    );

    return NextResponse.json({
      seeded: true,
      message: `Demo data created — inspection ${DEMO_INSPECTION_NUMBER}`,
      inspectionId: inspection.id,
      reportId: report.id,
      demoEmail: DEMO_EMAIL,
    });
  } catch (error) {
    console.error("[POST /api/admin/seed-demo]", error);
    return NextResponse.json(
      { error: "Failed to seed demo data" },
      { status: 500 },
    );
  }
}
