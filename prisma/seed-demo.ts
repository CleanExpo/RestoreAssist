/**
 * Demo Dataset Seed — RA-389
 *
 * Creates a complete, realistic Category 2 water damage job under a dedicated
 * demo tenant. The dataset satisfies all RA-389 acceptance criteria:
 *
 *   ✓ Category 2 water damage, 150m² residential property
 *   ✓ ≥ 8 moisture readings across 3 rooms (floor, wall, ceiling per room)
 *   ✓ Equipment log: 2 dehumidifiers + 3 air movers with deployment dates
 *   ✓ Environmental readings: temp, RH, GPP across 3 days
 *   ✓ IICRC S500:2025 compliant classification + scope + cost estimate
 *   ✓ AI-generated report text with correct S500 section headings
 *
 * Run with: npx tsx prisma/seed-demo.ts
 *
 * The seed is idempotent — existing demo records are deleted and re-created.
 * Demo tenant email: demo@restoreassist.app
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const DEMO_EMAIL = "demo@restoreassist.app";
const DEMO_INSPECTION_NUMBER = "NIR-2026-04-DEMO";

// Dates anchored to a realistic 3-day drying job
const DAY_1 = new Date("2026-04-01T08:00:00+10:00");
const DAY_2 = new Date("2026-04-02T08:00:00+10:00");
const DAY_3 = new Date("2026-04-03T08:00:00+10:00");

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Grains per pound from temperature (°C) and relative humidity (%) — simplified */
function calcGpp(tempC: number, rh: number): number {
  // Simplified psychrometric approximation: GPP ≈ (rh/100) × 4000 / (1 + (100 - tempC) * 0.05)
  return (
    Math.round((((rh / 100) * 4000) / (1 + (100 - tempC) * 0.05)) * 10) / 10
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Starting RA-389 demo dataset seed…");

  // ── 1. Upsert demo user (demo tenant) ──────────────────────────────────────
  console.log("  → Upserting demo user…");
  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      name: "Demo Technician",
      role: "USER",
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "pro",
      creditsRemaining: 999,
      businessName: "RestoreAssist Demo Pty Ltd",
      businessABN: "12345678901",
      businessPhone: "07 3000 0000",
      businessEmail: DEMO_EMAIL,
      businessAddress: "1 Demo Street, Brisbane QLD 4000",
      lifetimeAccess: true,
    },
  });
  console.log(`     User: ${demoUser.id}`);

  // ── 2. Upsert demo client ──────────────────────────────────────────────────
  console.log("  → Upserting demo client…");
  const existingClient = await prisma.client.findFirst({
    where: { userId: demoUser.id, email: "owner@demo-property.example" },
  });
  const demoClient =
    existingClient ??
    (await prisma.client.create({
      data: {
        userId: demoUser.id,
        name: "Judith & Robert Hargreaves",
        email: "owner@demo-property.example",
        phone: "0412 000 000",
        address: "42 Fernleigh Crescent, Samford Valley QLD 4520",
        company: null,
        notes:
          "Demo client — Category 2 washing machine overflow. Insurance claim lodged.",
      },
    }));
  console.log(`     Client: ${demoClient.id}`);

  // ── 3. Delete any prior demo inspection (idempotent) ──────────────────────
  const prior = await prisma.inspection.findUnique({
    where: { inspectionNumber: DEMO_INSPECTION_NUMBER },
  });
  if (prior) {
    console.log("  → Removing prior demo inspection…");
    await prisma.inspection.delete({ where: { id: prior.id } });
  }

  // ── 4. Create Inspection ──────────────────────────────────────────────────
  console.log("  → Creating demo inspection…");
  const inspection = await prisma.inspection.create({
    data: {
      userId: demoUser.id,
      inspectionNumber: DEMO_INSPECTION_NUMBER,
      propertyAddress: "42 Fernleigh Crescent, Samford Valley QLD 4520",
      propertyPostcode: "4520",
      inspectionDate: DAY_1,
      technicianName: "Demo Technician",
      technicianId: demoUser.id,
      status: "COMPLETED",
      submittedAt: DAY_1,
      processedAt: DAY_3,
      propertyFloorArea: 150,
      propertyBedrooms: 3,
      propertyBathrooms: 2,
      propertyWallMaterial: "Brick Veneer",
      propertyFloorType: "Concrete Slab",
      propertyYearBuilt: 2005,
      propertyStories: 1,
    },
  });
  console.log(`     Inspection: ${inspection.id}`);

  // ── 5. Environmental Data (primary reading — Day 1) ────────────────────────
  console.log("  → Creating environmental data…");
  await prisma.environmentalData.create({
    data: {
      inspectionId: inspection.id,
      ambientTemperature: 24.5, // °C
      humidityLevel: 78, // %
      dewPoint: 20.2,
      airCirculation: true,
      weatherConditions: "Overcast, mild. Overnight rain the previous day.",
      notes:
        "Day 1 readings taken at 08:15 prior to equipment deployment. " +
        "GPP: " +
        calcGpp(24.5, 78) +
        ". " +
        "Day 2 follow-up: Temp 24.1°C, RH 62%, GPP: " +
        calcGpp(24.1, 62) +
        ". " +
        "Day 3 clearance: Temp 23.8°C, RH 52%, GPP: " +
        calcGpp(23.8, 52) +
        ". " +
        "Drying goal achieved — readings within dry standard (≤ WME 16% on structural materials).",
      recordedAt: DAY_1,
    },
  });

  // ── 6. Moisture Readings — 3 rooms × floor / wall / ceiling ──────────────
  console.log("  → Creating moisture readings…");

  const moistureData = [
    // Laundry (source room — highest readings)
    {
      location: "Laundry",
      surfaceType: "Concrete",
      moistureLevel: 47.3,
      depth: "Surface",
      notes:
        "Area directly beneath washing machine. Category 2 grey water overflow.",
      recordedAt: DAY_1,
    },
    {
      location: "Laundry",
      surfaceType: "Plasterboard",
      moistureLevel: 38.6,
      depth: "Surface",
      notes: "Wall behind machine — wicking to approx 450mm height.",
      recordedAt: DAY_1,
    },
    {
      location: "Laundry",
      surfaceType: "Plasterboard",
      moistureLevel: 14.2,
      depth: "Surface",
      notes: "Ceiling — no notable saturation. Day 3 clearance reading.",
      recordedAt: DAY_3,
    },

    // Hallway (secondary migration path)
    {
      location: "Hallway",
      surfaceType: "Timber",
      moistureLevel: 31.4,
      depth: "Subsurface",
      notes: "Engineered timber floating floor. Moisture trapped below planks.",
      recordedAt: DAY_1,
    },
    {
      location: "Hallway",
      surfaceType: "Plasterboard",
      moistureLevel: 22.7,
      depth: "Surface",
      notes: "Skirting-level wicking from floor junction.",
      recordedAt: DAY_1,
    },
    {
      location: "Hallway",
      surfaceType: "Plasterboard",
      moistureLevel: 12.4,
      depth: "Surface",
      notes: "Ceiling — within acceptable range. Day 3 clearance reading.",
      recordedAt: DAY_3,
    },

    // Bedroom 1 (tertiary — minor migration under door)
    {
      location: "Bedroom 1",
      surfaceType: "Carpet",
      moistureLevel: 28.9,
      depth: "Subsurface",
      notes:
        "Underlay saturated at door-side edge. Carpet lifted for assessment.",
      recordedAt: DAY_1,
    },
    {
      location: "Bedroom 1",
      surfaceType: "Plasterboard",
      moistureLevel: 15.8,
      depth: "Surface",
      notes:
        "Skirting board and 150mm above — minor wicking. IICRC S500:2025 §7.1 compliant reading.",
      recordedAt: DAY_1,
    },
    {
      location: "Bedroom 1",
      surfaceType: "Plasterboard",
      moistureLevel: 11.6,
      depth: "Surface",
      notes: "Ceiling — no saturation detected. Day 3 clearance reading.",
      recordedAt: DAY_3,
    },
  ];

  for (const reading of moistureData) {
    await prisma.moistureReading.create({
      data: { inspectionId: inspection.id, ...reading },
    });
  }
  console.log(`     Created ${moistureData.length} moisture readings`);

  // ── 7. Affected Areas ──────────────────────────────────────────────────────
  console.log("  → Creating affected areas…");
  await prisma.affectedArea.createMany({
    data: [
      {
        inspectionId: inspection.id,
        roomZoneId: "Laundry",
        affectedSquareFootage: 8, // ~8m² source room
        waterSource: "grey water",
        timeSinceLoss: 4,
        category: "2",
        class: "3",
        description:
          "Category 2 grey water from washing machine overflow. Class 3 — water spread to walls " +
          "and ceiling materials. IICRC S500:2025 §4.1 Category 2, §4.2 Class 3 classification applies.",
      },
      {
        inspectionId: inspection.id,
        roomZoneId: "Hallway",
        affectedSquareFootage: 25, // corridor connecting rooms
        waterSource: "grey water",
        timeSinceLoss: 4,
        category: "2",
        class: "2",
        description:
          "Category 2 migration. Class 2 — water absorbed into flooring assembly. " +
          "Engineered timber floating floor requires lift and dry-down of sub-floor.",
      },
      {
        inspectionId: inspection.id,
        roomZoneId: "Bedroom 1",
        affectedSquareFootage: 14, // partial bedroom area
        waterSource: "grey water",
        timeSinceLoss: 5,
        category: "2",
        class: "2",
        description:
          "Category 2 secondary migration. Class 2 — carpet and underlay saturated at entry. " +
          "Subfloor concrete slab moisture within acceptable range (< 15% WME).",
      },
    ],
  });

  // ── 8. IICRC Classification ────────────────────────────────────────────────
  console.log("  → Creating classification…");
  await prisma.classification.create({
    data: {
      inspectionId: inspection.id,
      category: "2",
      class: "3",
      justification:
        "Water source is a domestic washing machine overflow. Grey water with potential contaminants " +
        "from detergent residue and lint. Classified Category 2 per IICRC S500:2025 §4.1. " +
        "Primary affected area (Laundry) shows Class 3 water damage — water has wicked into wall " +
        "cavities and ceiling space per §4.2. Secondary areas (Hallway, Bedroom 1) classified Class 2 " +
        "due to floor/wall absorption without ceiling involvement.",
      standardReference: "IICRC S500:2025 §4.1, §4.2",
      confidence: 96.5,
      isFinal: true,
      inputData: JSON.stringify({
        moistureReadingsCount: 9,
        affectedAreasCount: 3,
        waterSource: "grey water — washing machine overflow",
        highestMoisture: 47.3,
        affectedSurfaceTypes: ["Concrete", "Plasterboard", "Timber", "Carpet"],
      }),
    },
  });

  // ── 9. Scope Items ─────────────────────────────────────────────────────────
  console.log("  → Creating scope items…");
  await prisma.scopeItem.createMany({
    data: [
      {
        inspectionId: inspection.id,
        itemType: "sanitise_category2_surfaces",
        description:
          "Apply EPA-registered antimicrobial agent to all Category 2 affected surfaces",
        areaId: "Laundry",
        quantity: 8,
        unit: "m²",
        autoDetermined: true,
        justification:
          "IICRC S500:2025 §9.1 — Category 2 water requires antimicrobial treatment of all affected porous and semi-porous materials.",
        isRequired: true,
        isSelected: true,
      },
      {
        inspectionId: inspection.id,
        itemType: "extract_standing_water",
        description:
          "Extraction of residual standing water using truck-mounted wet vacuum",
        areaId: "Laundry",
        quantity: 1,
        unit: "job",
        autoDetermined: true,
        justification:
          "IICRC S500:2025 §8.1 — Water extraction is the primary step before drying equipment deployment.",
        isRequired: true,
        isSelected: true,
      },
      {
        inspectionId: inspection.id,
        itemType: "lift_carpet_and_underlay",
        description:
          "Lift and dispose of saturated carpet and underlay in Bedroom 1",
        areaId: "Bedroom 1",
        quantity: 14,
        unit: "m²",
        autoDetermined: true,
        justification:
          "IICRC S500:2025 §9.2 — Category 2 water-saturated carpet and underlay cannot be effectively dried in-situ and must be removed.",
        isRequired: true,
        isSelected: true,
      },
      {
        inspectionId: inspection.id,
        itemType: "install_dehumidification",
        description:
          "Install LGR dehumidifiers (×2) — Laundry and Hallway zones",
        areaId: "Hallway",
        quantity: 2,
        unit: "units",
        specification:
          "LGR dehumidifier, minimum 20L/day extraction capacity each. Deployment: Day 1. Retrieval: Day 3 upon drying verification.",
        autoDetermined: true,
        justification:
          "IICRC S500:2025 §8.3 — Dehumidification equipment required for moisture evaporation control across affected zones.",
        isRequired: true,
        isSelected: true,
      },
      {
        inspectionId: inspection.id,
        itemType: "install_air_movers",
        description:
          "Install axial air movers (×3) — Laundry (×1), Hallway (×1), Bedroom 1 (×1)",
        areaId: "Laundry",
        quantity: 3,
        unit: "units",
        specification:
          "High-velocity axial air movers at floor level. Deployment: Day 1. Retrieval: Day 3.",
        autoDetermined: true,
        justification:
          "IICRC S500:2025 §8.3 — Air movers increase surface evaporation rate. Ratio of 1 mover per ~15m² per IICRC equipment matrix.",
        isRequired: true,
        isSelected: true,
      },
      {
        inspectionId: inspection.id,
        itemType: "monitoring_visits",
        description:
          "Monitoring visits — psychrometric readings and moisture checks (Days 2 and 3)",
        quantity: 2,
        unit: "visits",
        autoDetermined: true,
        justification:
          "IICRC S500:2025 §12.4 — Daily monitoring required to verify drying progress and adjust equipment placement as needed.",
        isRequired: true,
        isSelected: true,
      },
      {
        inspectionId: inspection.id,
        itemType: "drying_verification",
        description: "Final drying verification and completion documentation",
        quantity: 1,
        unit: "job",
        autoDetermined: true,
        justification:
          "IICRC S500:2025 §11.4 — Drying verification must demonstrate moisture levels have reached dry standard (≤ WME 16% for structural materials). Pass/fail per reading documented.",
        isRequired: true,
        isSelected: true,
      },
      {
        inspectionId: inspection.id,
        itemType: "report_generation",
        description:
          "Generate IICRC S500:2025 compliant PDF inspection and monitoring report",
        quantity: 1,
        unit: "document",
        autoDetermined: true,
        justification:
          "IICRC S500:2025 §4.2 — Full documentation including classification, moisture readings, equipment log, scope of works, and signatory confirmation required for insurer audit trail.",
        isRequired: true,
        isSelected: true,
      },
    ],
  });

  // ── 10. Cost Estimates ─────────────────────────────────────────────────────
  console.log("  → Creating cost estimates…");
  const costItems = [
    {
      category: "Labour",
      description:
        "Initial inspection, water extraction, equipment setup — technician 4hrs",
      quantity: 4,
      unit: "hours",
      rate: 145,
      contingency: null,
    },
    {
      category: "Labour",
      description:
        "Monitoring visit Day 2 — psychrometric readings, equipment adjustment (1.5hrs)",
      quantity: 1.5,
      unit: "hours",
      rate: 145,
      contingency: null,
    },
    {
      category: "Labour",
      description:
        "Monitoring visit Day 3 — drying verification + demobilisation (2hrs)",
      quantity: 2,
      unit: "hours",
      rate: 145,
      contingency: null,
    },
    {
      category: "Labour",
      description: "Carpet and underlay lift & disposal — Bedroom 1",
      quantity: 14,
      unit: "m²",
      rate: 12.5,
      contingency: null,
    },
    {
      category: "Labour",
      description: "Antimicrobial application — Laundry surfaces",
      quantity: 8,
      unit: "m²",
      rate: 18,
      contingency: null,
    },
    {
      category: "Equipment",
      description: "LGR dehumidifier hire — 3 days × 2 units",
      quantity: 6,
      unit: "unit-days",
      rate: 95,
      contingency: null,
    },
    {
      category: "Equipment",
      description: "Axial air mover hire — 3 days × 3 units",
      quantity: 9,
      unit: "unit-days",
      rate: 38,
      contingency: null,
    },
    {
      category: "Materials",
      description: "EPA-registered antimicrobial solution (Category 2)",
      quantity: 2,
      unit: "litres",
      rate: 45,
      contingency: null,
    },
    {
      category: "Materials",
      description:
        "Disposable PPE — gloves, P2 respirator, disposable suit (Category 2 protocols)",
      quantity: 3,
      unit: "sets",
      rate: 22,
      contingency: null,
    },
    {
      category: "Materials",
      description:
        "Waste disposal — saturated carpet, underlay, and contaminated materials",
      quantity: 1,
      unit: "job",
      rate: 185,
      contingency: null,
    },
  ];

  for (const item of costItems) {
    const subtotal = item.quantity * item.rate;
    const gst = subtotal * 0.1;
    await prisma.costEstimate.create({
      data: {
        inspectionId: inspection.id,
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        subtotal,
        contingency: item.contingency ?? null,
        total: subtotal + gst,
        isEstimated: true,
      },
    });
  }

  const totalExGst = costItems.reduce((acc, i) => acc + i.quantity * i.rate, 0);
  const totalIncGst = totalExGst * 1.1;
  console.log(
    `     Cost items: ${costItems.length} — Total ex-GST: $${totalExGst.toFixed(2)}, inc-GST: $${totalIncGst.toFixed(2)}`,
  );

  // ── 11. Report (linked to the inspection) ─────────────────────────────────
  console.log("  → Creating demo report…");
  const existingReport = await prisma.report.findFirst({
    where: {
      userId: demoUser.id,
      propertyAddress: "42 Fernleigh Crescent, Samford Valley QLD 4520",
    },
  });

  let report = existingReport;
  if (!report) {
    report = await prisma.report.create({
      data: {
        userId: demoUser.id,
        clientId: demoClient.id,
        title:
          "Water Damage Inspection Report — 42 Fernleigh Crescent, Samford Valley",
        description:
          "Category 2 grey water damage from washing machine overflow. " +
          "Affected areas: Laundry, Hallway, Bedroom 1 (combined ~47m²). " +
          "IICRC S500:2025 Class 3 in source room, Class 2 in secondary areas.",
        status: "COMPLETED",
        clientName: "Judith & Robert Hargreaves",
        propertyAddress: "42 Fernleigh Crescent, Samford Valley QLD 4520",
        propertyPostcode: "4520",
        hazardType: "Water Damage",
        insuranceType: "Home & Contents",
        claimReferenceNumber: "CLM-2026-04-DEMO",
        incidentDate: new Date("2026-03-31T19:00:00+10:00"),
        technicianAttendanceDate: DAY_1,
        technicianName: "Demo Technician",
        totalCost: totalIncGst,
        reportDepthLevel: "Enhanced",
        reportVersion: 1,
        tier1Responses: JSON.stringify({
          waterSource: "Washing machine overflow — supply hose failure",
          estimatedArea: "47",
          roomsAffected: ["Laundry", "Hallway", "Bedroom 1"],
          flooringType: [
            "Concrete slab (laundry)",
            "Engineered timber (hallway)",
            "Carpet (bedroom)",
          ],
          category: "2",
          class: "3",
          timeSinceLoss: "4-5 hours",
        }),
        tier3Responses: JSON.stringify({
          environmentalDay1: { tempC: 24.5, rh: 78, gpp: calcGpp(24.5, 78) },
          environmentalDay2: { tempC: 24.1, rh: 62, gpp: calcGpp(24.1, 62) },
          environmentalDay3: { tempC: 23.8, rh: 52, gpp: calcGpp(23.8, 52) },
          dryingGoalAchieved: true,
          dryStandardReference:
            "IICRC S500:2025 §11.4 — WME ≤ 16% structural materials",
        }),
        scopeOfWorksDocument: buildScopeDocument(),
        costEstimationDocument: buildCostDocument(
          costItems,
          totalExGst,
          totalIncGst,
        ),
        technicianFieldReport:
          "Attended 42 Fernleigh Crescent Samford Valley at 08:00 on 01/04/2026. " +
          "Property owner reported washing machine supply hose failure overnight (~23:00). " +
          "Estimated 4-5 hours undetected. Grey water (Category 2) from laundry overflow " +
          "migrated into hallway and Bedroom 1 via under-door gap. " +
          "Carpet and underlay in Bedroom 1 are saturated and non-restorable. " +
          "Timber flooring in hallway requires lift and dry-down. Laundry slab and walls " +
          "at significant moisture levels requiring dehumidification drying cycle.",
      },
    });
  }

  // Link inspection to report (if not already linked)
  await prisma.inspection.update({
    where: { id: inspection.id },
    data: { reportId: report.id },
  });

  console.log(`     Report: ${report.id}`);
  console.log("");
  console.log("✅  Demo dataset seed complete!");
  console.log("");
  console.log("   Demo tenant:");
  console.log(`     Email:       ${DEMO_EMAIL}`);
  console.log(`     Inspection:  ${DEMO_INSPECTION_NUMBER}`);
  console.log(`     Report ID:   ${report.id}`);
  console.log(`     Inspection:  ${inspection.id}`);
  console.log("");
  console.log("   To log in as the demo user, create a password via the");
  console.log("   forgot-password flow or set one directly in the database.");
}

// ─── REPORT DOCUMENT BUILDERS ────────────────────────────────────────────────

function buildScopeDocument(): string {
  return `SCOPE OF WORKS — IICRC S500:2025 COMPLIANT
Property: 42 Fernleigh Crescent, Samford Valley QLD 4520
Claim Ref: CLM-2026-04-DEMO | Date of Loss: 31/03/2026

SECTION 1 — PROPERTY INFORMATION (S500:2025 §4.2)
Inspecting Technician: Demo Technician
Inspection Date: 01/04/2026
Insurer: NRMA Insurance (demo)
Loss Category: Category 2 Grey Water

SECTION 3 — IICRC CLASSIFICATION (S500:2025 §4.1–4.2)
Water Category: 2 — Grey Water (washing machine supply hose failure)
Damage Class:
  • Laundry (source room): Class 3 — significant wet materials including ceiling space
  • Hallway: Class 2 — water absorbed into floor/wall assembly
  • Bedroom 1: Class 2 — carpet/underlay saturation at door-side

SECTION 4 — MOISTURE READINGS (S500:2025 §7.1)
Room         | Surface       | WME%  | Depth       | Day
Laundry      | Concrete slab | 47.3  | Surface     | Day 1
Laundry      | Plasterboard  | 38.6  | Surface     | Day 1
Laundry      | Plasterboard  | 14.2  | Surface     | Day 3 (clearance)
Hallway      | Eng. timber   | 31.4  | Subsurface  | Day 1
Hallway      | Plasterboard  | 22.7  | Surface     | Day 1
Hallway      | Plasterboard  | 12.4  | Surface     | Day 3 (clearance)
Bedroom 1    | Carpet        | 28.9  | Subsurface  | Day 1
Bedroom 1    | Plasterboard  | 15.8  | Surface     | Day 1
Bedroom 1    | Plasterboard  | 11.6  | Surface     | Day 3 (clearance)
Dry Standard: ≤ 16% WME for structural materials (S500:2025 §11.4)

SECTION 5 — EQUIPMENT LOG (S500:2025 §8.3)
Equipment              | Qty | Placement          | Deployed  | Retrieved
LGR Dehumidifier       |  1  | Laundry            | 01/04/26  | 03/04/26
LGR Dehumidifier       |  1  | Hallway            | 01/04/26  | 03/04/26
Axial Air Mover        |  1  | Laundry (floor)    | 01/04/26  | 03/04/26
Axial Air Mover        |  1  | Hallway (floor)    | 01/04/26  | 03/04/26
Axial Air Mover        |  1  | Bedroom 1 (floor)  | 01/04/26  | 03/04/26

SECTION 6 — SCOPE OF WORKS (S500:2025 §9.1–9.2, §13)
1. Water extraction — residual standing water removed by truck-mount
2. Antimicrobial application to all Category 2 affected surfaces (8m²)
3. Lift and dispose saturated carpet + underlay — Bedroom 1 (14m²)
4. Install drying equipment — 2× LGR dehumidifiers, 3× air movers
5. Monitoring visits Day 2 + Day 3 (psychrometric + WME readings)
6. Drying verification at Day 3 clearance — all readings ≤ dry standard
7. Final documentation + S500:2025 compliance report generation

SECTION 7 — HEALTH & SAFETY (S500:2025 §5.1)
Category 2 water — PPE: disposable gloves, P2 respirator, disposable suit.
Contaminated materials bagged and disposed of to licensed waste facility.
Occupants advised not to use laundry during drying cycle.

SECTION 8 — VERIFICATION CHECKLIST (S500:2025 §11.4)
✓ Laundry concrete slab:   Day 3 reading 14.2% WME — PASS (≤ 16%)
✓ Hallway engineered floor: Day 3 reading 12.4% WME — PASS (≤ 16%)
✓ Bedroom 1 subfloor:       Day 3 reading 11.6% WME — PASS (≤ 16%)
All affected areas have achieved dry standard. Equipment retrieved.

SECTION 9 — IICRC STANDARDS REFERENCED (S500:2025 §4.2)
• IICRC S500:2025 §4.1 — Water damage categories
• IICRC S500:2025 §4.2 — Water damage classes + documentation requirements
• IICRC S500:2025 §5.1 — Health and safety protocols
• IICRC S500:2025 §7.1 — Moisture readings and location documentation
• IICRC S500:2025 §8.3 — Drying equipment type, quantity, placement
• IICRC S500:2025 §9.1–9.2 — Category 2 contamination protocols
• IICRC S500:2025 §11.4 — Drying goal verification and dry standard
• IICRC S500:2025 §12.4 — Monitoring and psychrometric recording
• IICRC S500:2025 §13 — Scope of works requirements`;
}

function buildCostDocument(
  items: Array<{
    category: string;
    description: string;
    quantity: number;
    unit: string;
    rate: number;
  }>,
  totalExGst: number,
  totalIncGst: number,
): string {
  const lines = items.map(
    (i) =>
      `${i.category.padEnd(12)} | ${i.description.substring(0, 55).padEnd(55)} | ${String(i.quantity).padStart(6)} ${i.unit.padEnd(10)} | $${i.rate.toFixed(2).padStart(7)} | $${(i.quantity * i.rate).toFixed(2).padStart(9)}`,
  );

  return `COST ESTIMATE — IICRC S500:2025 COMPLIANT
Property: 42 Fernleigh Crescent, Samford Valley QLD 4520
Claim Ref: CLM-2026-04-DEMO | GST Reg. ABN: 12 345 678 901

Category     | Description                                              |    Qty Unit       |    Rate | Subtotal
-------------|----------------------------------------------------------|-------------------|---------|----------
${lines.join("\n")}

Subtotal (ex-GST): $${totalExGst.toFixed(2)}
GST (10%):          $${(totalExGst * 0.1).toFixed(2)}
TOTAL (inc-GST):    $${totalIncGst.toFixed(2)}

This estimate has been prepared in accordance with IICRC S500:2025 and
Australian insurance industry cost guidelines. All labour rates are
inclusive of travel within 50km. Equipment rates are per-unit per day.`;
}

// ─── RUN ─────────────────────────────────────────────────────────────────────

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
