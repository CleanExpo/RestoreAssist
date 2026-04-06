/**
 * RestoreAssist Demo Seed — Category 2 Residential Water Loss
 * RA-433: Realistic demo data for pilot company walkthroughs.
 *
 * Scenario: Burst pipe under kitchen sink, 47 Rosella St Buderim QLD 4556
 * Category 2 (grey water) / Class 2 / 3 affected rooms
 *
 * Usage: npx ts-node prisma/seed-demo-inspection.ts
 * Idempotent: safe to re-run — upserts by reportNumber.
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const DEMO_REPORT_NUMBER = "RA-DEMO-2026-001";

async function main() {
  // Find the first admin user to own the demo data
  const owner = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, name: true },
  });
  if (!owner) {
    console.error("No ADMIN user found. Create a user first.");
    process.exit(1);
  }
  console.log(`Seeding demo data under user: ${owner.name} (${owner.id})`);

  // Find workspace (optional — works without one)
  const workspace = await prisma.workspace.findFirst({
    where: { ownerId: owner.id },
    select: { id: true },
  });

  // ── Moisture Readings (JSON for Report.moistureReadings) ──
  const moistureReadings = {
    moistureReadings: [
      // Kitchen — pre-drying
      {
        location: "Kitchen — base cabinet (north wall)",
        surfaceType: "Particleboard (Yellow Tongue)",
        moistureLevel: 42,
        depth: "Subsurface",
        readingDate: "2026-04-01T09:30:00Z",
        instrument: "Protimeter Surveymaster",
        status: "above-goal",
      },
      {
        location: "Kitchen — vinyl flooring centre",
        surfaceType: "Vinyl over particleboard",
        moistureLevel: 38,
        depth: "Surface",
        readingDate: "2026-04-01T09:35:00Z",
        instrument: "Protimeter Surveymaster",
        status: "above-goal",
      },
      // Hallway — pre-drying
      {
        location: "Hallway — timber skirting (east)",
        surfaceType: "Timber skirting board",
        moistureLevel: 28,
        depth: "Surface",
        readingDate: "2026-04-01T09:45:00Z",
        instrument: "Protimeter Surveymaster",
        status: "above-goal",
      },
      {
        location: "Hallway — carpet underlay centre",
        surfaceType: "Carpet underlay (foam)",
        moistureLevel: 65,
        depth: "Subsurface",
        readingDate: "2026-04-01T09:50:00Z",
        instrument: "Protimeter Surveymaster",
        status: "above-goal",
      },
      // Living room — pre-drying
      {
        location: "Living room — plasterboard wall (south, 300mm AFF)",
        surfaceType: "Plasterboard",
        moistureLevel: 22,
        depth: "Surface",
        readingDate: "2026-04-01T10:00:00Z",
        instrument: "Protimeter Surveymaster",
        status: "monitoring",
      },
      {
        location: "Living room — carpet near hallway entry",
        surfaceType: "Carpet (nylon)",
        moistureLevel: 34,
        depth: "Surface",
        readingDate: "2026-04-01T10:05:00Z",
        instrument: "Protimeter Surveymaster",
        status: "above-goal",
      },
      // Day 3 monitoring
      {
        location: "Kitchen — base cabinet (north wall)",
        surfaceType: "Particleboard (Yellow Tongue)",
        moistureLevel: 26,
        depth: "Subsurface",
        readingDate: "2026-04-04T10:00:00Z",
        instrument: "Protimeter Surveymaster",
        status: "monitoring",
      },
      {
        location: "Kitchen — vinyl flooring centre",
        surfaceType: "Vinyl over particleboard",
        moistureLevel: 19,
        depth: "Surface",
        readingDate: "2026-04-04T10:05:00Z",
        instrument: "Protimeter Surveymaster",
        status: "monitoring",
      },
      {
        location: "Hallway — carpet underlay centre",
        surfaceType: "Carpet underlay (foam)",
        moistureLevel: 22,
        depth: "Subsurface",
        readingDate: "2026-04-04T10:15:00Z",
        instrument: "Protimeter Surveymaster",
        status: "monitoring",
      },
      {
        location: "Living room — carpet near hallway entry",
        surfaceType: "Carpet (nylon)",
        moistureLevel: 16,
        depth: "Surface",
        readingDate: "2026-04-04T10:25:00Z",
        instrument: "Protimeter Surveymaster",
        status: "within-goal",
      },
      // Day 7 final
      {
        location: "Kitchen — base cabinet (north wall)",
        surfaceType: "Particleboard (Yellow Tongue)",
        moistureLevel: 14,
        depth: "Subsurface",
        readingDate: "2026-04-07T09:30:00Z",
        instrument: "Protimeter Surveymaster",
        status: "within-goal",
      },
      {
        location: "Kitchen — vinyl flooring centre",
        surfaceType: "Vinyl over particleboard",
        moistureLevel: 12,
        depth: "Surface",
        readingDate: "2026-04-07T09:35:00Z",
        instrument: "Protimeter Surveymaster",
        status: "within-goal",
      },
      {
        location: "Hallway — carpet underlay centre",
        surfaceType: "Carpet underlay (foam)",
        moistureLevel: 13,
        depth: "Subsurface",
        readingDate: "2026-04-07T09:45:00Z",
        instrument: "Protimeter Surveymaster",
        status: "within-goal",
      },
      {
        location: "Living room — carpet near hallway entry",
        surfaceType: "Carpet (nylon)",
        moistureLevel: 11,
        depth: "Surface",
        readingDate: "2026-04-07T09:55:00Z",
        instrument: "Protimeter Surveymaster",
        status: "within-goal",
      },
    ],
    affectedAreas: [
      {
        roomZoneId: "Kitchen",
        affectedSquareFootage: 14,
        waterSource: "Burst pipe under sink",
        timeSinceLoss: 6,
      },
      {
        roomZoneId: "Hallway",
        affectedSquareFootage: 8,
        waterSource: "Migration from kitchen",
        timeSinceLoss: 6,
      },
      {
        roomZoneId: "Living Room",
        affectedSquareFootage: 10,
        waterSource: "Migration via hallway",
        timeSinceLoss: 6,
      },
    ],
  };

  // ── Psychrometric Assessment ──
  const psychrometricAssessment = {
    waterClass: "Class 2",
    temperature: 26.4,
    humidity: 72,
    dewPoint: 21.1,
    grainsPoundDry: 98.2,
    grainsTarget: 52,
    systemType: "LGR Dehumidification",
    dryingPotential: {
      status: "Fair",
      dryingIndex: 33.6,
      recommendation:
        "Increase air movement in hallway; consider supplemental dehumidification if RH remains above 60% after 48 hours.",
    },
  };

  // ── Scope Areas ──
  const scopeAreas = [
    {
      name: "Kitchen",
      length: 4.2,
      width: 3.4,
      height: 2.7,
      wetPercentage: 85,
      materials:
        "Particleboard subfloor (Yellow Tongue), vinyl sheet flooring, MDF base cabinets, plasterboard walls",
    },
    {
      name: "Hallway",
      length: 5.0,
      width: 1.6,
      height: 2.7,
      wetPercentage: 60,
      materials:
        "Carpet (nylon) over foam underlay, timber skirting boards, plasterboard walls",
    },
    {
      name: "Living Room",
      length: 5.5,
      width: 4.0,
      height: 2.7,
      wetPercentage: 30,
      materials:
        "Carpet (nylon) over foam underlay, plasterboard walls, timber skirting boards",
    },
  ];

  // ── Equipment Selection ──
  const equipmentSelection = [
    {
      groupId: "lgr-medium",
      quantity: 2,
      dailyRate: 85.0,
      serialNumbers: ["DH-LGR-4421", "DH-LGR-4422"],
      placement: "Kitchen (1), Living Room (1)",
    },
    {
      groupId: "airmover-axial",
      quantity: 4,
      dailyRate: 25.0,
      serialNumbers: ["AM-AX-1187", "AM-AX-1188", "AM-AX-1189", "AM-AX-1190"],
      placement: "Kitchen (2), Hallway (1), Living Room (1)",
    },
  ];

  // ── Pre-generated IICRC S500:2025 Report Narrative ──
  const detailedReport = `# PROFESSIONAL WATER DAMAGE RESTORATION INSPECTION REPORT

## Report Reference: ${DEMO_REPORT_NUMBER}
## Date of Inspection: 1 April 2026
## Property: 47 Rosella Street, Buderim QLD 4556

---

### 1. EXECUTIVE SUMMARY

A water intrusion event was identified at the above property on 1 April 2026 resulting from a burst braided flexi-hose connector beneath the kitchen sink. The water loss has been classified as **Category 2** (grey water containing chemical or biological contaminants per IICRC S500:2025 §3) and **Class 2** damage (water has affected structural materials including particleboard subfloor per IICRC S500:2025 §7.1).

Three rooms are affected: the kitchen (primary source), hallway (migration path), and living room (secondary exposure). Restorative drying was commenced on 1 April 2026 using LGR dehumidification and axial air movement in accordance with IICRC S500:2025 §14.

### 2. PROPERTY DETAILS

| Field | Detail |
|-------|--------|
| Property Address | 47 Rosella Street, Buderim QLD 4556 |
| Property Type | Single-storey residential dwelling |
| Construction | Brick veneer, slab-on-ground |
| Building Age | Approximately 18 years (est. 2008) |
| Insurer | Demo Insurance Co |
| Claim Reference | DIC-2026-04-0847 |
| Technician | Phill McGurk (IICRC WRT Certified) |

### 3. WATER INTRUSION EVENT

The source of the water intrusion event was a failed braided stainless-steel flexi-hose connector on the cold water supply to the kitchen sink. The connector exhibited fatigue cracking at the ferrule crimp, a known failure mode in flexi-hoses exceeding 10 years of service. Water discharged under mains pressure into the base cabinet void and migrated across the particleboard subfloor into the hallway and living room.

The water has been classified as **Category 2** in accordance with IICRC S500:2025 §3, as the discharge originated from a potable supply but contacted soiled surfaces within the cabinet void (cleaning chemicals, organic residue). Time since loss at initial attendance was approximately 6 hours.

### 4. DAMAGE CLASSIFICATION

Damage has been classified as **Class 2** per IICRC S500:2025 §7.1. Water has affected porous structural materials (particleboard subfloor) and semi-porous materials (MDF cabinet bases, plasterboard to 300mm above finished floor). Evaporation rate is moderate; affected materials have absorbed moisture but saturation has not penetrated to the full depth of structural elements.

### 5. AFFECTED AREAS

| Room | Area (m²) | Wet % | Primary Materials Affected |
|------|-----------|-------|----------------------------|
| Kitchen | 14.3 | 85% | Particleboard subfloor (Yellow Tongue), vinyl sheet, MDF base cabinets |
| Hallway | 8.0 | 60% | Carpet (nylon) over foam underlay, timber skirting boards |
| Living Room | 10.0 | 30% | Carpet (nylon) over foam underlay, plasterboard wall base |

**Total affected area: 32.3 m²**

### 6. MOISTURE ASSESSMENT (per IICRC S500:2025 §8)

Moisture readings were obtained using a Protimeter Surveymaster (pin-type and non-invasive modes) at initial attendance and at monitoring intervals on Day 3 and Day 7.

**Drying goals** (per IICRC S500:2025 §12):
- Particleboard subfloor: ≤ 16% MC (coastal Queensland baseline per §12)
- Carpet underlay: ≤ 15% MC
- Plasterboard: ≤ 17% MC
- Timber skirting: ≤ 16% MC

All affected materials reached drying goals by Day 7 of the restorative drying programme.

### 7. PSYCHROMETRIC CONDITIONS (per IICRC S500:2025 §6)

| Parameter | Day 1 | Day 3 | Day 7 |
|-----------|-------|-------|-------|
| Temperature (°C) | 26.4 | 25.8 | 24.2 |
| Relative Humidity (%) | 72 | 58 | 48 |
| Dew Point (°C) | 21.1 | 17.2 | 12.8 |
| GPP (Grains/lb) | 98.2 | 72.4 | 51.6 |

Drying potential improved from Fair to Good over the monitoring period. LGR dehumidification was effective in reducing ambient moisture levels within the target parameters.

### 8. EQUIPMENT DEPLOYMENT (per IICRC S500:2025 §14)

| Equipment | Model | Serial No. | Placement | Daily Rate |
|-----------|-------|-----------|-----------|------------|
| LGR Dehumidifier | Dri-Eaz LGR 3500i | DH-LGR-4421 | Kitchen | $85.00 |
| LGR Dehumidifier | Dri-Eaz LGR 3500i | DH-LGR-4422 | Living Room | $85.00 |
| Axial Air Mover | Dri-Eaz Sahara Pro X3 | AM-AX-1187 | Kitchen (subfloor) | $25.00 |
| Axial Air Mover | Dri-Eaz Sahara Pro X3 | AM-AX-1188 | Kitchen (cabinet void) | $25.00 |
| Axial Air Mover | Dri-Eaz Sahara Pro X3 | AM-AX-1189 | Hallway | $25.00 |
| Axial Air Mover | Dri-Eaz Sahara Pro X3 | AM-AX-1190 | Living Room | $25.00 |

Equipment deployment ratio: 1 dehumidifier per 16 m² of affected area (within S500:2025 §14 guideline of 1 per 15-20 m²). Air mover coverage: 1 per 8 m² (within guideline of 1 per 7-10 m²).

### 9. SCOPE SUMMARY

Restoration works included emergency water extraction (truck-mounted unit, 2 hours), antimicrobial treatment of all affected surfaces (Category 2 protocol), deployment of drying equipment for 7-day programme, daily moisture monitoring, and final drying certification. Licensed plumber attended to replace the failed flexi-hose connector and pressure-test the supply line.

### 10. DECLARATION

This inspection report has been prepared in accordance with IICRC S500:2025 Standard for Professional Water Damage Restoration and applicable Australian Standards (AS/NZS 3500, AS/NZS 3000:2018). All findings are based on visual inspection, instrument-based moisture assessment, and psychrometric monitoring conducted at the property.

**Prepared by:** Phill McGurk — IICRC WRT Certified Technician
**Date:** 7 April 2026
**Reviewed by:** _______________________
**Insurer acknowledgement:** _______________________`;

  // ── Upsert the demo report ──
  const existing = await prisma.report.findFirst({
    where: { reportNumber: DEMO_REPORT_NUMBER },
  });

  const reportData = {
    title: "WD-2026-DEMO-001",
    reportNumber: DEMO_REPORT_NUMBER,
    status: "COMPLETED" as const,
    clientName: "Sarah Mitchell",
    propertyAddress: "47 Rosella Street, Buderim QLD 4556",
    propertyPostcode: "4556",
    hazardType: "Water",
    insuranceType: "Building and Contents Insurance",
    insurerName: "Demo Insurance Co",
    claimReferenceNumber: "DIC-2026-04-0847",
    incidentDate: new Date("2026-04-01T03:00:00Z"),
    technicianAttendanceDate: new Date("2026-04-01T09:00:00Z"),
    inspectionDate: new Date("2026-04-01T09:00:00Z"),
    technicianName: "Phill McGurk",
    waterCategory: "Category 2",
    waterClass: "Class 2",
    sourceOfWater: "Burst braided flexi-hose connector under kitchen sink",
    affectedArea: 32.3,
    buildingAge: 2008,
    structureType: "Brick veneer, slab-on-ground",
    accessNotes:
      "Level driveway, clear access for truck mount. No restricted entry.",
    estimatedDryingDuration: 7,
    equipmentCostTotal: 1890.0,
    detailedReport: detailedReport,
    moistureReadings: JSON.stringify(moistureReadings),
    psychrometricAssessment: JSON.stringify(psychrometricAssessment),
    scopeAreas: JSON.stringify(scopeAreas),
    equipmentSelection: JSON.stringify(equipmentSelection),
    technicianFieldReport:
      "Attended 47 Rosella St Buderim re burst pipe kitchen. Braided flexi hose failed under sink cold water supply. Water spread kitchen into hallway and into lounge. Approx 6hrs since event. Vinyl lifting in kitchen, carpet saturated hallway. Lounge carpet damp near hallway entry. Extracted standing water truck mount 2hrs. Deployed 2x LGR dehus, 4x air movers. Applied antimicrobial all affected surfaces cat 2 protocol. Readings taken all rooms - see moisture log. Plumber replacing flexi connector tomorrow.",
    reportDepthLevel: "Enhanced",
    userId: owner.id,
    ...(workspace ? { workspaceId: workspace.id } : {}),
  };

  let report;
  if (existing) {
    report = await prisma.report.update({
      where: { id: existing.id },
      data: reportData,
    });
    console.log(`Updated existing demo report: ${report.id}`);
  } else {
    report = await prisma.report.create({
      data: reportData,
    });
    console.log(`Created demo report: ${report.id}`);
  }

  console.log(`\n✅ Demo seed complete!`);
  console.log(`   Report ID: ${report.id}`);
  console.log(`   Report Number: ${DEMO_REPORT_NUMBER}`);
  console.log(`   Property: 47 Rosella Street, Buderim QLD 4556`);
  console.log(`   Category 2 / Class 2 — 3 rooms, 32.3 m²`);
  console.log(`   14 moisture readings (Day 1, Day 3, Day 7)`);
  console.log(`   6 equipment units (2 LGR + 4 air movers)`);
  console.log(`\n   View in dashboard → Reports → ${report.title}`);
  console.log(`   Export PDF → /api/reports/${report.id}/pdf`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
