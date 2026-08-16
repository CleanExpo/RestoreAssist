/**
 * RA-427: Admin Demo Seed Trigger
 *
 * POST /api/admin/seed-demo
 *   Creates a complete S500:2021 demo job — client, report, inspection, a
 *   3-day drying log and an S500-cited scope.
 *   Admin-only — requires session with role === "ADMIN".
 *   Idempotent: re-running is safe (skips if demo data already present).
 *
 * Every `data` payload below is written WITHOUT an `as any` cast on purpose.
 * The original version of this route cast all five creates to `any`, which hid
 * the fact that it addressed 31 columns that do not exist on Report, Inspection,
 * Client, MoistureReading or ScopeItem — so the route threw a Prisma validation
 * error on its first write and had never successfully seeded anything.
 *
 * Dropping the casts is necessary but NOT sufficient, and it would be a mistake
 * to rely on the compiler here. Measured against Prisma 7.9.1: omitting a
 * REQUIRED column is a compile error, but adding a column that does not exist,
 * alongside an otherwise complete payload, compiles clean — the create argument
 * is a generic `SelectSubset<T, …>` whose T is inferred from the literal itself,
 * so there is nothing for excess-property checking to flag it against. The
 * suite in `__tests__/route.test.ts` validates every payload against
 * prisma/schema.prisma at runtime and is the only guard for that class.
 *
 * Returns: { seeded: boolean; message: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { fromException } from "@/lib/api-errors";

/**
 * Demo identity is PER OWNER, not global.
 *
 * `Inspection.inspectionNumber` is `@unique` across the whole table, so a single
 * fixed demo number lets exactly one admin in the estate ever hold the demo
 * claim. Because the claim is seeded onto its owner (see below) and every
 * downstream write is scoped by session user, a second admin would then be
 * handed the FIRST admin's inspection id by the idempotency branch, be unable to
 * write to it, and have another user's row id disclosed to them. Suffixing the
 * number with the owner keeps the guarantee the idempotency branch is actually
 * trying to make: pressing the button twice is safe, and every admin gets their
 * own writable demo claim.
 *
 * The FULL user id goes in, not a truncation of it. An earlier version used
 * `userId.slice(-8)`, which did not remove the failure mode — it only reduced it
 * to a suffix-collision class, where two admins sharing the last 8 characters of
 * their id land on the same number and the second is handed the first's row all
 * over again. The lookup below is independently scoped by `userId` as well, so
 * even a hypothetical collision cannot return another owner's inspection; it
 * would fail loudly on the unique constraint instead of silently misbehaving.
 */
function demoInspectionNumber(userId: string) {
  return `NIR-2026-04-DEMO-${userId}`;
}
const DEMO_REPORT_NUMBER = "RA-DEMO-2026-0001";

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    // ── 1. Owner ─────────────────────────────────────────────────────────────
    //
    // The demo claim is seeded onto the ADMIN WHO PRESSED THE BUTTON, not onto
    // a separate demo persona. This is load-bearing, not a simplification for
    // its own sake: the write routes the demo walks through — moisture
    // readings, photo upload, portal link — all scope by
    // `findFirst({ where: { id, userId: session.user.id } })`. A claim owned by
    // some other user reads fine for an admin (assertInspectionTenancy has an
    // admin path) but every write against it 404s, so the live meter-photo step
    // could not be completed by the operator running the demo.
    //
    // It also means this route no longer creates a privileged user or mutates
    // the caller's organisation, which it previously did as a side effect.
    const userId = auth.user!.id;
    const inspectionNumber = demoInspectionNumber(userId);

    // Idempotency check — matched on BOTH the number and the owner, so this can
    // never hand the caller an inspection belonging to someone else.
    const existing = await prisma.inspection.findFirst({
      where: { inspectionNumber, userId },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({
        seeded: false,
        message: "Demo data already present — no changes made",
        inspectionId: existing.id,
      });
    }

    const now = new Date();
    const day1 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const day2 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const day3 = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    // Everything below is ONE transaction, and that is load-bearing for the
    // idempotency branch above.
    //
    // The branch treats the existence of the inspection as "the demo is
    // seeded". Written as a sequence of independent writes, a failure after the
    // inspection row landed — but before the drying log or the scope — would
    // leave a demo that can never repair itself: the retry finds the inspection,
    // returns `seeded: false`, and the operator walks into the meeting with an
    // empty Monitoring tab. Partial failures earlier would also pile up orphan
    // demo clients and reports, since none of those writes is idempotent.
    //
    // All-or-nothing makes the inspection's existence a truthful proxy for the
    // whole graph, which is exactly what the idempotency check assumes.
    const { inspection, report } = await prisma.$transaction(
      async (tx) => {
        // ── 2. Client ────────────────────────────────────────────────────────
        const client = await tx.client.create({
          data: {
            name: "Sarah Thompson",
            email: "sarah.thompson@example.com",
            phone: "0412 345 678",
            address: "42 Harbourside Drive, Manly NSW 2095",
            userId,
          },
        });

        // ── 3. Report ────────────────────────────────────────────────────────────
        const report = await tx.report.create({
          data: {
            title:
              "Water Damage Restoration Report — 42 Harbourside Drive, Manly",
            description:
              "Category 2 grey water damage from washing machine supply hose failure. 150 m² affected across living room, kitchen, and hallway. 3-day structural drying program completed.",
            status: "COMPLETED",
            clientName: "Sarah Thompson",
            clientId: client.id,
            propertyAddress: "42 Harbourside Drive, Manly NSW 2095",
            propertyPostcode: "2095",
            hazardType: "water",
            insuranceType: "home",
            reportNumber: DEMO_REPORT_NUMBER,
            userId,
            inspectionDate: day1,
            technicianName: "James Whitfield (IICRC WRT #AUS-0042)",
            technicianAttendanceDate: day1,
            waterCategory: "2",
            waterClass: "2",
            sourceOfWater:
              "Washing machine supply hose failure — grey water overflow from laundry into living areas",
            affectedArea: 150,
            totalCost: 8750.0,
            dryingPlan:
              "Structural drying per IICRC S500:2021 §5. 2× LGR dehumidifiers positioned centrally in the living room and kitchen; 3× air movers directed at the affected timber flooring and hallway slab. Daily moisture monitoring until every material meets its S500 dry standard.",
            airmoversCount: 3,
            dehumidificationCapacity: 160,
            estimatedDryingTime: 72,
            completionDate: day3,
          },
        });

        // ── 4. Inspection ────────────────────────────────────────────────────────
        const inspection = await tx.inspection.create({
          data: {
            inspectionNumber,
            propertyAddress: "42 Harbourside Drive, Manly NSW 2095",
            propertyPostcode: "2095",
            status: "COMPLETED",
            // Load-bearing for the demo, not decoration: the inspection detail page
            // gates the Moisture and Moisture Map tabs on
            // moistureReadingsRequired(claimType), which is `claimType === "WATER"`.
            // Seeded without it, the drying log and the meter-photo capture card
            // are unreachable in the UI even though the readings exist in the DB.
            claimType: "WATER",
            reportId: report.id,
            userId,
            technicianId: userId,
            technicianName: "James Whitfield",
            inspectionDate: day1,
            submittedAt: day1,
            processedAt: day3,
            completedAt: day3,
            lossDescription:
              "Washing machine hose failure caused a grey water release. Subfloor cavity affected — moisture readings confirm Category 2 classification. IICRC S500:2021 §6.3 applied.",
          },
        });

        // ── 5. Moisture readings (21 readings — 3 monitoring points × 7 visits) ──
        //
        // `surfaceType` deliberately uses the exact lowercase keys that
        // app/api/inspections/[id]/monitoring-report keys its IICRC_TARGETS table
        // on ("timber" 19%, "plasterboard" 1.5%, "concrete" 3.5%). Anything else
        // silently falls back to the generic 15% target and the drying log shows
        // the wrong dry standard. Each curve ends BELOW its target so the S500
        // monitoring report reads "goal achieved" for all three materials.
        const monitoringPoints = [
          {
            location: "Living Room — timber flooring, centre of room",
            surfaceType: "timber",
            depth: "Subsurface",
            curve: [31.2, 28.6, 25.1, 22.4, 20.8, 19.6, 18.4], // target 19%
          },
          {
            location: "Kitchen — plasterboard, north wall 150mm AFF",
            surfaceType: "plasterboard",
            depth: "Subsurface",
            curve: [4.8, 4.1, 3.4, 2.8, 2.2, 1.7, 1.3], // target 1.5%
          },
          {
            location: "Hallway — concrete slab, mid-span",
            surfaceType: "concrete",
            depth: "Surface",
            curve: [9.2, 8.1, 6.9, 5.8, 4.7, 3.9, 3.2], // target 3.5%
          },
        ];
        const readingDays = [day1, day1, day2, day2, day2, day3, day3];

        for (const [visitIdx, date] of readingDays.entries()) {
          for (const point of monitoringPoints) {
            await tx.moistureReading.create({
              data: {
                inspectionId: inspection.id,
                location: point.location,
                surfaceType: point.surfaceType,
                moistureLevel: point.curve[visitIdx],
                depth: point.depth,
                unit: "WME",
                source: "manual",
                isMonitoringPoint: true,
                recordedAt: date,
                notes:
                  visitIdx === 0
                    ? "Initial reading — pre-drying baseline for this monitoring point."
                    : visitIdx === readingDays.length - 1
                      ? "Drying goal achieved — reading is at or below the IICRC S500:2021 dry standard for this material."
                      : null,
              },
            });
          }
        }

        // ── 6. Scope items ────────────────────────────────────────────────────────
        //
        // The S500 citation belongs in `clauseRef` (RA-1142), not in the
        // justification prose — that is the field the inspection detail API selects
        // and the report's clause column reads.
        const scopeItems = [
          {
            itemType: "remove_skirting",
            description: "Remove and dispose of affected skirting boards",
            unit: "LM",
            quantity: 42,
            clauseRef: "IICRC S500:2021 §7.2",
            justification:
              "Category 2 water contact with porous timber skirting — contaminated porous material is removed rather than dried.",
            autoDetermined: true,
          },
          {
            itemType: "install_dehumidification",
            description:
              "Deploy 2× LGR dehumidifiers for the 3-day structural drying program",
            unit: "DAY",
            quantity: 3,
            clauseRef: "IICRC S500:2021 §8.1",
            justification:
              "Class 2 evaporation load across 150 m² requires a minimum 120 L/day LGR capacity; 2× 80 L/day units deployed.",
            autoDetermined: true,
          },
          {
            itemType: "install_air_movers",
            description: "Deploy 3× axial air movers for evaporative drying",
            unit: "DAY",
            quantity: 3,
            clauseRef: "IICRC S500:2021 §8.2",
            justification:
              "Airflow across affected timber flooring and hallway slab to maintain the evaporation rate for the Class 2 load.",
            autoDetermined: true,
          },
          {
            itemType: "sanitize_materials",
            description:
              "Apply antimicrobial treatment to affected areas post-extraction",
            unit: "M2",
            quantity: 150,
            clauseRef: "IICRC S500:2021 §10.3",
            justification:
              "Mandatory Category 2 sanitation of affected surfaces prior to reinstatement.",
            autoDetermined: true,
          },
          {
            itemType: "reinstate_skirting",
            description: "Supply and install replacement skirting boards",
            unit: "LM",
            quantity: 42,
            clauseRef: null,
            justification:
              "Reinstatement of materials removed under the demolition line above.",
            autoDetermined: false,
          },
        ];

        for (const item of scopeItems) {
          await tx.scopeItem.create({
            data: {
              ...item,
              inspectionId: inspection.id,
              isRequired: true,
              isSelected: true,
            },
          });
        }

        return { inspection, report };
      },
      // 29 statements; the 5s interactive-transaction default is tight on a cold
      // connection, and a timeout here would roll the whole demo back.
      { timeout: 20_000 },
    );

    return NextResponse.json({
      seeded: true,
      message: `Demo data created — inspection ${inspectionNumber}`,
      inspectionId: inspection.id,
      reportId: report.id,
    });
  } catch (error) {
    return fromException(_req, error, { stage: "seed-demo" });
  }
}
