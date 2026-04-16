/**
 * RestoreAssist — S500:2025 Demo Dataset Seed
 * [RA-389] Sprint F — Production smoke test + demo data
 *
 * Creates a complete fictional Category 2 water damage demo job:
 *   - Dedicated demo tenant (User + Organization)
 *   - 150 m² affected area across 3 rooms
 *   - 14 moisture readings over 3 days (showing drying progression)
 *   - 2 dehumidifiers + 3 air movers (EquipmentDeployment)
 *   - 3 days of environmental data (psychrometric readings in Report)
 *   - Full S500:2025 classification + scope items
 *   - DryingGoalRecord tracking the 3-day drying period
 *   - AI-generated S500:2025 report text
 *
 * Run with: npx tsx prisma/seed-demo.ts
 * Idempotent: skips creation if demo@restoreassist.app already exists.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Constants ────────────────────────────────────────────────────────────────

const DEMO_EMAIL = "demo@restoreassist.app";
const DEMO_INSPECTION_NUMBER = "NIR-2026-04-DEMO";
const DEMO_REPORT_NUMBER = "RA-DEMO-2026-0001";

// Relative dates: seed creates data as if the job started 3 days ago
const now = new Date();
const day1 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
const day2 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
const day3 = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌊 RestoreAssist S500:2025 Demo Seed");
  console.log("────────────────────────────────────");

  // ── 1. Demo User ────────────────────────────────────────────────────────

  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });

  if (user) {
    console.log(`✓ Demo user already exists: ${user.id}`);
  } else {
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
    console.log(`✓ Created demo user: ${user.id}`);
  }

  // ── 2. Demo Organization ────────────────────────────────────────────────

  const existingOrg = await prisma.organization.findFirst({
    where: { ownerId: user.id },
  });

  let orgId: string;
  if (existingOrg) {
    orgId = existingOrg.id;
    console.log(`✓ Demo organization already exists: ${orgId}`);
  } else {
    const org = await prisma.organization.create({
      data: {
        name: "RestoreAssist Demo Tenant",
        ownerId: user.id,
      },
    });
    orgId = org.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: orgId },
    });
    console.log(`✓ Created demo organization: ${orgId}`);
  }

  // ── 3. Check idempotency — skip if inspection already seeded ───────────

  const existingInspection = await prisma.inspection.findUnique({
    where: { inspectionNumber: DEMO_INSPECTION_NUMBER },
  });

  if (existingInspection) {
    console.log(
      `✓ Demo inspection already seeded (${existingInspection.id}). Skipping.`,
    );
    console.log("────────────────────────────────────");
    console.log("✅ Demo data already present — seed complete.");
    return;
  }

  // ── 4. Create Report ────────────────────────────────────────────────────

  const report = await prisma.report.create({
    data: {
      title: "Water Damage Restoration Report — 42 Harbourside Drive, Manly",
      description:
        "Category 2 grey water damage from washing machine supply hose failure. 150 m² affected across living room, kitchen, and hallway. 3-day structural drying program completed.",
      status: "COMPLETED",
      clientName: "Sarah Thompson",
      propertyAddress: "42 Harbourside Drive, Manly NSW 2095",
      hazardType: "water",
      insuranceType: "home",
      userId: user.id,
      reportNumber: DEMO_REPORT_NUMBER,
      inspectionDate: day1,
      waterCategory: "2",
      waterClass: "2",
      sourceOfWater:
        "Washing machine supply hose failure — grey water overflow from laundry into living areas",
      affectedArea: 150,
      safetyHazards:
        "Electrical hazard — power isolated to affected circuits. Slip hazard on wet hard flooring.",
      equipmentUsed:
        "2× Dri-Eaz LGR 3500i Dehumidifier (80L/day rated), 3× Dri-Eaz Sahara Pro X3 Air Mover",
      dryingPlan:
        "Structural drying per IICRC S500 §14. Target: indoor RH ≤ outdoor ambient. 2× LGR dehumidifiers positioned centrally in living room and kitchen. 3× air movers directed at carpet/underlay in living room (2 units) and hallway (1 unit). Daily moisture monitoring with pin-type and non-invasive meters. Estimated 3–5 day drying period based on Class 2 evaporation load.",
      airmoversCount: 3,
      dehumidificationCapacity: 160,
      targetHumidity: 60,
      targetTemperature: 22,
      estimatedDryingTime: 72,
      technicianName: "James Whitfield (IICRC WRT #AUS-0042)",
      technicianAttendanceDate: day1,
      propertyPostcode: "2095",
      completenessScore: 98,
      reportDepthLevel: "Enhanced",
      reportVersion: 1,
      completionDate: day3,
      psychrometricReadings: JSON.stringify([
        {
          day: 1,
          date: day1.toISOString().slice(0, 10),
          indoorTempC: 22.5,
          indoorRH: 68.5,
          dewPointC: 15.8,
          outdoorRH: 71.0,
          grainsPP: 72.4,
          dryingTarget: "≤71% RH",
          status: "ABOVE_TARGET",
        },
        {
          day: 2,
          date: day2.toISOString().slice(0, 10),
          indoorTempC: 21.8,
          indoorRH: 58.3,
          dewPointC: 12.4,
          outdoorRH: 65.0,
          grainsPP: 58.1,
          dryingTarget: "≤65% RH",
          status: "ABOVE_TARGET",
        },
        {
          day: 3,
          date: day3.toISOString().slice(0, 10),
          indoorTempC: 22.1,
          indoorRH: 52.7,
          dewPointC: 11.2,
          outdoorRH: 60.0,
          grainsPP: 49.8,
          dryingTarget: "≤60% RH",
          status: "APPROACHING_TARGET",
        },
      ]),
      equipmentSelection: JSON.stringify({
        dehumidifiers: [
          {
            make: "Dri-Eaz",
            model: "LGR 3500i",
            qty: 2,
            capacityLPerDay: 80,
            location: "Living Room (1), Kitchen (1)",
          },
        ],
        airMovers: [
          {
            make: "Dri-Eaz",
            model: "Sahara Pro X3",
            qty: 3,
            cfm: 2900,
            location: "Living Room (2), Hallway (1)",
          },
        ],
        totalDehumidificationCapacity: 160,
        calculationBasis: "IICRC S500 §14 — Class 2, 150 m² affected area",
      }),
      detailedReport: generateS500ReportText(),
    },
  });
  console.log(`✓ Created demo report: ${report.id}`);

  // ── 5. Create Inspection (linked to Report) ─────────────────────────────

  const inspection = await prisma.inspection.create({
    data: {
      inspectionNumber: DEMO_INSPECTION_NUMBER,
      propertyAddress: "42 Harbourside Drive, Manly NSW 2095",
      propertyPostcode: "2095",
      inspectionDate: day1,
      technicianName: "James Whitfield",
      technicianId: user.id,
      status: "COMPLETED",
      userId: user.id,
      reportId: report.id,
      processedAt: day3,
      submittedAt: day1,
    },
  });
  console.log(`✓ Created demo inspection: ${inspection.id}`);

  // ── 6. Environmental Data (Day 1 snapshot — single record per inspection)

  await prisma.environmentalData.create({
    data: {
      inspectionId: inspection.id,
      ambientTemperature: 22.5,
      humidityLevel: 68.5,
      dewPoint: 15.8,
      airCirculation: true,
      weatherConditions:
        "Overcast, light rain. Outdoor ambient RH 71%. Drying target per S500 §12.4: indoor RH ≤ outdoor ambient (71%).",
      notes:
        "Initial environmental readings at 09:15 AEST. Windows closed, mechanical drying equipment running. GPP indoor: 72.4 gr/lb. GPP outdoor: 75.1 gr/lb.",
      recordedAt: day1,
    },
  });
  console.log("✓ Created environmental data (Day 1 snapshot)");

  // ── 7. Affected Areas (3 rooms, total 150 m²) ──────────────────────────

  const areas = await Promise.all([
    prisma.affectedArea.create({
      data: {
        inspectionId: inspection.id,
        roomZoneId: "Living Room",
        affectedSquareFootage: 60,
        waterSource: "grey water",
        timeSinceLoss: 4,
        category: "2",
        class: "2",
        description:
          "Primary affected area. Washing machine hose failure in adjacent laundry — grey water migrated across carpet and underlay. Moisture detected in carpet, underlay, and lower 150mm of drywall.",
      },
    }),
    prisma.affectedArea.create({
      data: {
        inspectionId: inspection.id,
        roomZoneId: "Kitchen",
        affectedSquareFootage: 45,
        waterSource: "grey water",
        timeSinceLoss: 4,
        category: "2",
        class: "2",
        description:
          "Secondary affected area. Grey water pooled on vinyl flooring, wicked into MDF cabinet bases. Standing water 5–10mm depth at time of arrival.",
      },
    }),
    prisma.affectedArea.create({
      data: {
        inspectionId: inspection.id,
        roomZoneId: "Hallway / Bedroom 1",
        affectedSquareFootage: 45,
        waterSource: "grey water",
        timeSinceLoss: 6,
        category: "2",
        class: "1",
        description:
          "Migration zone. Grey water followed carpet tack strip along hallway into bedroom 1. Lower moisture levels — partial carpet and underlay saturation only.",
      },
    }),
  ]);
  console.log(`✓ Created ${areas.length} affected areas (total 150 m²)`);

  // ── 8. Moisture Readings (14 readings across 3 rooms over 3 days) ──────

  const moistureReadings = [
    // ── Day 1 (initial assessment) ──
    {
      location: "Living Room — centre carpet",
      surfaceType: "carpet",
      moistureLevel: 42.5,
      depth: "Surface",
      recordedAt: day1,
      notes: "Saturated. S500 §12.3 threshold for carpet: >0.1% = CRITICAL",
    },
    {
      location: "Living Room — north wall drywall (150mm AFF)",
      surfaceType: "drywall",
      moistureLevel: 28.3,
      depth: "Subsurface",
      recordedAt: day1,
      notes:
        "Non-invasive reading. Critical — well above 1.0% drywall threshold.",
    },
    {
      location: "Kitchen — vinyl flooring centre",
      surfaceType: "concrete",
      moistureLevel: 38.1,
      depth: "Surface",
      recordedAt: day1,
      notes: "Standing water removed. Substrate reading under vinyl.",
    },
    {
      location: "Kitchen — island cabinet base (MDF)",
      surfaceType: "wood",
      moistureLevel: 22.7,
      depth: "Subsurface",
      recordedAt: day1,
      notes:
        "Elevated — MDF wicking detected. S500 §12.3 wood threshold: >16% = ELEVATED.",
    },
    {
      location: "Hallway — carpet runner mid-point",
      surfaceType: "carpet",
      moistureLevel: 18.4,
      depth: "Surface",
      recordedAt: day1,
      notes: "Elevated. Migration path from living room.",
    },
    {
      location: "Bedroom 1 — drywall east wall (100mm AFF)",
      surfaceType: "drywall",
      moistureLevel: 3.2,
      depth: "Subsurface",
      recordedAt: day1,
      notes: "Elevated — moisture migration through shared wall.",
    },

    // ── Day 2 (monitoring — drying in progress) ──
    {
      location: "Living Room — centre carpet",
      surfaceType: "carpet",
      moistureLevel: 31.2,
      depth: "Surface",
      recordedAt: day2,
      notes: "Drying progressing. Down from 42.5%. Equipment repositioned.",
    },
    {
      location: "Living Room — north wall drywall (150mm AFF)",
      surfaceType: "drywall",
      moistureLevel: 19.6,
      depth: "Subsurface",
      recordedAt: day2,
      notes: "Improving — down from 28.3%. Still elevated.",
    },
    {
      location: "Kitchen — vinyl flooring centre",
      surfaceType: "concrete",
      moistureLevel: 24.8,
      depth: "Surface",
      recordedAt: day2,
      notes: "Significant improvement. Vinyl lifted at edges for airflow.",
    },
    {
      location: "Hallway — carpet runner mid-point",
      surfaceType: "carpet",
      moistureLevel: 12.1,
      depth: "Surface",
      recordedAt: day2,
      notes: "Approaching dry target. Air mover repositioned.",
    },

    // ── Day 3 (approaching dry standard) ──
    {
      location: "Living Room — centre carpet",
      surfaceType: "carpet",
      moistureLevel: 8.5,
      depth: "Surface",
      recordedAt: day3,
      notes:
        "Approaching normal. Carpet and underlay to be replaced (Cat 2 — sanitation).",
    },
    {
      location: "Living Room — north wall drywall (150mm AFF)",
      surfaceType: "drywall",
      moistureLevel: 1.8,
      depth: "Subsurface",
      recordedAt: day3,
      notes: "Approaching dry target (1.0%). One more day recommended.",
    },
    {
      location: "Kitchen — vinyl flooring centre",
      surfaceType: "concrete",
      moistureLevel: 1.4,
      depth: "Surface",
      recordedAt: day3,
      notes: "Approaching dry target. Concrete substrate drying well.",
    },
    {
      location: "Hallway — carpet runner mid-point",
      surfaceType: "carpet",
      moistureLevel: 0.08,
      depth: "Surface",
      recordedAt: day3,
      notes: "NORMAL — below 0.1% threshold. Hallway drying complete.",
    },
  ];

  await prisma.moistureReading.createMany({
    data: moistureReadings.map((r) => ({
      inspectionId: inspection.id,
      ...r,
    })),
  });
  console.log(
    `✓ Created ${moistureReadings.length} moisture readings (3-day drying progression)`,
  );

  // ── 9. Classification ──────────────────────────────────────────────────

  await prisma.classification.create({
    data: {
      inspectionId: inspection.id,
      category: "2",
      class: "2",
      justification:
        "Grey water source (washing machine supply hose failure) — Category 2 per IICRC S500 §7.2: water containing significant contamination with potential to cause discomfort or sickness. Affected area: 150 m² across 3 rooms (>40% of habitable floor space would be Class 3, but only 81% of the 185 m² total is affected across mixed zones — living room and kitchen at Class 2, hallway at Class 1). Overall classification: Class 2 (fast evaporation rate) per IICRC S500 §8.2.",
      standardReference: "IICRC S500 §7.2 (Category), §8.2 (Class)",
      confidence: 97.5,
      isFinal: true,
      inputData: JSON.stringify({
        waterSource: "washing_machine_hose",
        timeElapsed: "4 hours",
        affectedAreaM2: 150,
        totalFloorAreaM2: 185,
        percentAffected: 81,
        materialTypes: ["carpet", "drywall", "vinyl", "MDF", "concrete"],
        standingWater: true,
        sanitisationRequired: true,
      }),
    },
  });
  console.log("✓ Created S500 classification (Cat 2 / Class 2)");

  // ── 10. Scope Items ────────────────────────────────────────────────────

  const scopeItems = [
    {
      itemType: "remove_carpet",
      description:
        "Remove and dispose of affected carpet and underlay — Living Room",
      quantity: 60,
      unit: "m²",
      justification:
        "Cat 2 grey water contamination — carpet and underlay are non-restorable per IICRC S500 §7.2. Sanitation risk.",
      autoDetermined: true,
    },
    {
      itemType: "remove_vinyl",
      description:
        "Lift affected vinyl flooring — Kitchen (retain if undamaged)",
      quantity: 45,
      unit: "m²",
      justification:
        "Vinyl lifted to allow subfloor drying. Non-porous surface may be reinstated after sanitation per S500 §7.2.",
      autoDetermined: true,
    },
    {
      itemType: "sanitize_subfloor",
      description:
        "Apply antimicrobial treatment to exposed subfloor — Living Room + Kitchen",
      quantity: 105,
      unit: "m²",
      specification:
        "Benefect Decon 30 or equivalent botanical antimicrobial. Two applications: post-extraction and pre-reinstatement.",
      justification:
        "Mandatory Cat 2 sanitation requirement — IICRC S500 §7.2 and §10.2.",
      autoDetermined: true,
    },
    {
      itemType: "install_dehumidification",
      description:
        "Deploy 2× LGR dehumidifier (80L/day rated capacity each, 160L/day total)",
      quantity: 2,
      unit: "units",
      specification:
        "Dri-Eaz LGR 3500i or equivalent. Position centrally in living room and kitchen for Class 2 coverage.",
      justification:
        "Equipment selection per IICRC S500 §14 — Class 2, 150 m² affected area requires minimum 120L/day LGR capacity.",
      autoDetermined: true,
    },
    {
      itemType: "install_air_movers",
      description: "Deploy 3× axial air mover for carpet and structural drying",
      quantity: 3,
      unit: "units",
      specification:
        "Dri-Eaz Sahara Pro X3 or equivalent. 2 units in living room (cross-flow), 1 unit in hallway.",
      justification:
        "IICRC S500 §14 — 1 air mover per 4.5–7 m² of affected carpet. Living room (60 m²) requires 2+ units.",
      autoDetermined: true,
    },
    {
      itemType: "moisture_monitoring",
      description:
        "Daily moisture monitoring and environmental logging — 3-day drying program",
      quantity: 3,
      unit: "days",
      justification:
        "S500 §12.3 — daily monitoring required until all readings achieve drying goal. Includes pin-type and non-invasive readings.",
      autoDetermined: true,
    },
    {
      itemType: "reinstate_carpet",
      description:
        "Supply and install replacement carpet and underlay — Living Room",
      quantity: 60,
      unit: "m²",
      specification:
        "Like-for-like replacement. Loop pile, stain-resistant, manufacturer warranty minimum 10 years.",
      justification: "Reinstatement of removed contaminated materials.",
      autoDetermined: false,
      isSelected: true,
    },
    {
      itemType: "reinstate_vinyl",
      description:
        "Reinstall vinyl flooring — Kitchen (if undamaged) or supply replacement",
      quantity: 45,
      unit: "m²",
      justification: "Reinstatement after subfloor drying complete.",
      autoDetermined: false,
      isSelected: true,
    },
    {
      itemType: "waste_disposal",
      description:
        "Dispose of contaminated building materials — carpet, underlay, damaged MDF",
      quantity: 1,
      unit: "load",
      specification:
        "Cat 2 waste disposal per local council regulations. Skip bin or truck collection.",
      justification:
        "S500 §7.2 — contaminated materials must be disposed of, not stored on-site.",
      autoDetermined: true,
    },
  ];

  await prisma.scopeItem.createMany({
    data: scopeItems.map((item) => ({
      inspectionId: inspection.id,
      isRequired: true,
      isSelected: item.isSelected ?? true,
      ...item,
    })),
  });
  console.log(
    `✓ Created ${scopeItems.length} scope items with S500 clause references`,
  );

  // ── 11. Equipment Deployments ──────────────────────────────────────────

  const equipmentDeployments = [
    {
      reportId: report.id,
      userId: user.id,
      equipmentType: "dehumidifier",
      manufacturer: "Dri-Eaz",
      model: "LGR 3500i",
      make: "Dri-Eaz",
      serialNumber: "DE-LGR-2024-00147",
      deploymentLocation: "Living Room — central position",
      startTime: day1,
      endTime: day3,
      operatingHours: 68,
      runHours: 68,
      ampDraw: 5.8,
      notes:
        "Unit 1 of 2. 80L/day rated. Continuous operation. Condensate drain to external.",
    },
    {
      reportId: report.id,
      userId: user.id,
      equipmentType: "dehumidifier",
      manufacturer: "Dri-Eaz",
      model: "LGR 3500i",
      make: "Dri-Eaz",
      serialNumber: "DE-LGR-2024-00148",
      deploymentLocation: "Kitchen — near island bench",
      startTime: day1,
      endTime: day3,
      operatingHours: 68,
      runHours: 68,
      ampDraw: 5.8,
      notes:
        "Unit 2 of 2. 80L/day rated. Positioned to draw moisture from cabinet bases.",
    },
    {
      reportId: report.id,
      userId: user.id,
      equipmentType: "air_mover",
      manufacturer: "Dri-Eaz",
      model: "Sahara Pro X3",
      make: "Dri-Eaz",
      serialNumber: "DE-SAH-2023-00412",
      deploymentLocation: "Living Room — north wall (cross-flow position 1)",
      startTime: day1,
      endTime: day3,
      operatingHours: 68,
      runHours: 68,
      ampDraw: 2.5,
      notes: "Cross-flow with unit 2. Directed at carpet and lower drywall.",
    },
    {
      reportId: report.id,
      userId: user.id,
      equipmentType: "air_mover",
      manufacturer: "Dri-Eaz",
      model: "Sahara Pro X3",
      make: "Dri-Eaz",
      serialNumber: "DE-SAH-2023-00413",
      deploymentLocation: "Living Room — south wall (cross-flow position 2)",
      startTime: day1,
      endTime: day3,
      operatingHours: 68,
      runHours: 68,
      ampDraw: 2.5,
      notes: "Cross-flow with unit 1. Coverage: 30 m² each unit.",
    },
    {
      reportId: report.id,
      userId: user.id,
      equipmentType: "air_mover",
      manufacturer: "Dri-Eaz",
      model: "Sahara Pro X3",
      make: "Dri-Eaz",
      serialNumber: "DE-SAH-2023-00414",
      deploymentLocation: "Hallway — directed toward bedroom 1 entry",
      startTime: day1,
      endTime: day3,
      operatingHours: 68,
      runHours: 68,
      ampDraw: 2.5,
      notes:
        "Single unit for migration zone. Hallway reached dry standard on Day 3.",
    },
  ];

  await (prisma as any).equipmentDeployment.createMany({
    data: equipmentDeployments,
  });
  console.log(
    `✓ Created ${equipmentDeployments.length} equipment deployments (2 dehu + 3 air movers)`,
  );

  // ── 12. Drying Goal Record ─────────────────────────────────────────────

  await (prisma as any).dryingGoalRecord.create({
    data: {
      inspectionId: inspection.id,
      targetCategory: "2",
      targetClass: "2",
      startedAt: day1,
      materialTargets: {
        carpet: { normalThreshold: 0.1, unit: "%" },
        drywall: { normalThreshold: 1.0, unit: "%" },
        concrete: { normalThreshold: 0.5, unit: "%" },
        wood: { normalThreshold: 16.0, unit: "%" },
      },
      goalAchieved: false,
      totalDryingDays: 3,
      finalReadingsSnapshot: {
        "Living Room — carpet": {
          reading: 8.5,
          threshold: 0.1,
          status: "ELEVATED",
        },
        "Living Room — drywall": {
          reading: 1.8,
          threshold: 1.0,
          status: "ELEVATED",
        },
        "Kitchen — concrete": {
          reading: 1.4,
          threshold: 0.5,
          status: "ELEVATED",
        },
        "Hallway — carpet": { reading: 0.08, threshold: 0.1, status: "NORMAL" },
        "Bedroom 1 — drywall": {
          reading: 0.7,
          threshold: 1.0,
          status: "NORMAL",
        },
      },
      iicrcReference:
        "IICRC S500 §12.3 — Material-specific moisture thresholds; §12.4 — Drying target = indoor RH ≤ outdoor ambient",
      signedOffBy: user.id,
      signedOffAt: day3,
    },
  });
  console.log("✓ Created drying goal record (3-day tracking)");

  // ── 13. Audit Log entries ──────────────────────────────────────────────

  const auditEntries = [
    { action: "INSPECTION_CREATED", entityType: "Inspection", timestamp: day1 },
    {
      action: "ENVIRONMENTAL_DATA_RECORDED",
      entityType: "EnvironmentalData",
      timestamp: day1,
    },
    {
      action: "MOISTURE_READINGS_RECORDED",
      entityType: "MoistureReading",
      timestamp: day1,
    },
    {
      action: "CLASSIFICATION_DETERMINED",
      entityType: "Classification",
      timestamp: day1,
    },
    {
      action: "SCOPE_ITEMS_GENERATED",
      entityType: "ScopeItem",
      timestamp: day1,
    },
    {
      action: "EQUIPMENT_DEPLOYED",
      entityType: "EquipmentDeployment",
      timestamp: day1,
    },
    {
      action: "MOISTURE_READINGS_DAY2",
      entityType: "MoistureReading",
      timestamp: day2,
    },
    {
      action: "MOISTURE_READINGS_DAY3",
      entityType: "MoistureReading",
      timestamp: day3,
    },
    { action: "REPORT_GENERATED", entityType: "Report", timestamp: day3 },
    {
      action: "INSPECTION_COMPLETED",
      entityType: "Inspection",
      timestamp: day3,
    },
  ];

  await prisma.auditLog.createMany({
    data: auditEntries.map((entry) => ({
      inspectionId: inspection.id,
      userId: user.id,
      action: entry.action,
      entityType: entry.entityType,
      device: "Web",
      timestamp: entry.timestamp,
    })),
  });
  console.log(`✓ Created ${auditEntries.length} audit log entries`);

  // ── Done ───────────────────────────────────────────────────────────────

  console.log("────────────────────────────────────");
  console.log("✅ Demo dataset seeded successfully!");
  console.log("");
  console.log("  User:         demo@restoreassist.app");
  console.log(`  Inspection:   ${DEMO_INSPECTION_NUMBER}`);
  console.log(`  Report:       ${DEMO_REPORT_NUMBER}`);
  console.log("  Job type:     Category 2 / Class 2 — grey water");
  console.log("  Area:         150 m² (3 rooms)");
  console.log("  Readings:     14 moisture readings over 3 days");
  console.log("  Equipment:    2× dehumidifier + 3× air mover");
  console.log("  Drying:       3-day program (approaching target)");
  console.log("");
}

// ── S500:2025 Report Text Generator ──────────────────────────────────────────

function generateS500ReportText(): string {
  return `# IICRC S500:2025 Water Damage Restoration Report

## 1. Report Summary

**Report Number:** RA-DEMO-2026-0001
**Date of Attendance:** ${day1.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
**Technician:** James Whitfield — IICRC WRT Certified (#AUS-0042)
**Property:** 42 Harbourside Drive, Manly NSW 2095
**Client:** Sarah Thompson
**Insurer:** N/A (self-managed claim)

## 2. Water Category Classification (S500 §7.1–7.3)

**Category 2 — Grey Water**

Water source identified as washing machine supply hose failure in the laundry. Grey water overflowed from the laundry across the living room (carpet), kitchen (vinyl flooring), and hallway (carpet). Water contains significant contamination and has the potential to cause discomfort or sickness if consumed or exposed to.

Category 1 to Category 2 escalation was not required — the source is inherently grey water per S500 §7.2 (washing machine discharge).

**Sanitation requirement:** Mandatory antimicrobial treatment of all affected porous and semi-porous materials per S500 §7.2 and §10.2.

## 3. Water Class Classification (S500 §8.1–8.4)

**Class 2 — Fast Evaporation Rate**

Affected area: 150 m² across 3 rooms (81% of total habitable floor space). Materials affected include carpet, carpet underlay, drywall (lower 150mm), vinyl flooring, and MDF cabinet bases. The evaporation load is consistent with Class 2 per S500 §8.2 — an entire room of carpet and cushion with moisture wicking into walls.

## 4. Moisture Assessment (S500 §12.3)

### Day 1 — Initial Assessment
| Location | Material | MC (%) | Threshold | Status |
|----------|----------|--------|-----------|--------|
| Living Room — centre carpet | Carpet | 42.5 | >0.1% | CRITICAL |
| Living Room — north wall drywall | Drywall | 28.3 | >1.0% | CRITICAL |
| Kitchen — vinyl flooring centre | Concrete | 38.1 | >0.5% | CRITICAL |
| Kitchen — island cabinet base | Wood (MDF) | 22.7 | >16.0% | ELEVATED |
| Hallway — carpet mid-point | Carpet | 18.4 | >0.1% | ELEVATED |
| Bedroom 1 — east wall drywall | Drywall | 3.2 | >1.0% | ELEVATED |

### Day 2 — Monitoring (24 hrs into drying)
| Location | Material | MC (%) | Status | Change |
|----------|----------|--------|--------|--------|
| Living Room — centre carpet | Carpet | 31.2 | CRITICAL | ↓ 26.6% |
| Living Room — north wall drywall | Drywall | 19.6 | ELEVATED | ↓ 30.7% |
| Kitchen — vinyl flooring centre | Concrete | 24.8 | ELEVATED | ↓ 34.9% |
| Hallway — carpet mid-point | Carpet | 12.1 | ELEVATED | ↓ 34.2% |

### Day 3 — Approaching Dry Standard (48 hrs into drying)
| Location | Material | MC (%) | Status | Change |
|----------|----------|--------|--------|--------|
| Living Room — centre carpet | Carpet | 8.5 | ELEVATED | ↓ 72.7% |
| Living Room — north wall drywall | Drywall | 1.8 | ELEVATED | ↓ 93.6% |
| Kitchen — vinyl flooring centre | Concrete | 1.4 | ELEVATED | ↓ 96.3% |
| Hallway — carpet mid-point | Carpet | 0.08 | NORMAL ✓ | ↓ 99.6% |

Drying trajectory is within expected parameters for Class 2. Hallway has achieved dry standard. Living room and kitchen require 1–2 additional days of monitoring.

## 5. Environmental Data (S500 §12.4)

| Day | Indoor Temp (°C) | Indoor RH (%) | Outdoor RH (%) | Dew Point (°C) | GPP | Status |
|-----|-----------------|---------------|----------------|----------------|-----|--------|
| 1 | 22.5 | 68.5 | 71.0 | 15.8 | 72.4 | ABOVE TARGET |
| 2 | 21.8 | 58.3 | 65.0 | 12.4 | 58.1 | ABOVE TARGET |
| 3 | 22.1 | 52.7 | 60.0 | 11.2 | 49.8 | APPROACHING TARGET |

**Drying target per S500 §12.4:** Indoor RH at or below outdoor ambient conditions.

## 6. Scope of Works (S500 §7.2, §10.2, §14)

1. Remove and dispose of affected carpet and underlay — Living Room (60 m²) [S500 §7.2]
2. Lift affected vinyl flooring — Kitchen (45 m²) [S500 §7.2]
3. Apply antimicrobial treatment to exposed subfloor — 105 m² [S500 §7.2, §10.2]
4. Deploy 2× LGR dehumidifier (160L/day total capacity) [S500 §14]
5. Deploy 3× axial air mover [S500 §14]
6. Daily moisture monitoring — 3-day drying program [S500 §12.3]
7. Supply and install replacement carpet — Living Room (60 m²)
8. Reinstall vinyl flooring — Kitchen (45 m²)
9. Dispose of contaminated building materials [S500 §7.2]

## 7. Equipment Summary (S500 §14)

| Equipment | Make/Model | Qty | Capacity | Location |
|-----------|-----------|-----|----------|----------|
| LGR Dehumidifier | Dri-Eaz LGR 3500i | 2 | 80L/day each | Living Room, Kitchen |
| Axial Air Mover | Dri-Eaz Sahara Pro X3 | 3 | 2,900 CFM each | Living Room (2), Hallway (1) |

**Equipment adequacy per S500 §14:** Class 2, 150 m² — minimum 120L/day dehumidification required. Deployed: 160L/day (133% of minimum). Air mover coverage: 1 per 20 m² carpet (industry standard for Class 2).

## 8. Technician Sign-off

**Technician:** James Whitfield
**IICRC Certification:** WRT #AUS-0042
**Company:** Whitfield Restoration Services Pty Ltd
**Date:** ${day3.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}

This report has been prepared in accordance with IICRC S500:2025 — Standard and Reference Guide for Professional Water Damage Restoration (7th Edition). All measurements, classifications, and scope items reference published S500 clauses.
`;
}

// ── Run ──────────────────────────────────────────────────────────────────────

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
