/**
 * Seed: CostDatabase — RA-849 M2 National Average Rates
 *
 * Seeds 7 national average rows for the RA-848 schema additions
 * (negativeAirMachine, hepaVacuum, monitoringVisit, mobilisation,
 *  wasteDisposal, projectManagement, photoDocumentation).
 *
 * Rates are NRPG midpoints (national averages, no region).
 * Multiplier fields (afterHours, saturday, sunday, publicHoliday) are
 * dimensionless ratios and are not stored in CostDatabase.
 *
 * Run: npx ts-node prisma/seed-cost-database.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COST_DATABASE_ENTRIES = [
  {
    itemType: "negativeAirMachineDailyRate",
    category: "Equipment",
    description: "Negative Air Machine — daily rental (HEPA-filtered containment unit)",
    unit: "$/day",
    minRate: 55,
    maxRate: 180,
    averageRate: 117.5,
    region: null,
    source: "NRPG RA-848",
    updateFrequency: "Quarterly",
  },
  {
    itemType: "hepaVacuumDailyRate",
    category: "Equipment",
    description: "HEPA Vacuum — daily rental (certified H13/H14 filtration)",
    unit: "$/day",
    minRate: 35,
    maxRate: 90,
    averageRate: 62.5,
    region: null,
    source: "NRPG RA-848",
    updateFrequency: "Quarterly",
  },
  {
    itemType: "monitoringVisitDailyRate",
    category: "Labor",
    description: "Monitoring Visit — per site visit for drying progress assessment",
    unit: "$/visit",
    minRate: 85,
    maxRate: 220,
    averageRate: 152.5,
    region: null,
    source: "NRPG RA-848",
    updateFrequency: "Quarterly",
  },
  {
    itemType: "mobilisationFee",
    category: "Fees",
    description: "Mobilisation Fee — one-off charge for site setup, travel, and initial response",
    unit: "$",
    minRate: 100,
    maxRate: 450,
    averageRate: 275,
    region: null,
    source: "NRPG RA-848",
    updateFrequency: "Quarterly",
  },
  {
    itemType: "wasteDisposalPerBinRate",
    category: "Materials",
    description: "Waste Disposal — per bin (240L skip bin, includes levy and collection)",
    unit: "$/bin",
    minRate: 280,
    maxRate: 650,
    averageRate: 465,
    region: null,
    source: "NRPG RA-848",
    updateFrequency: "Quarterly",
  },
  {
    itemType: "projectManagementPercent",
    category: "Fees",
    description: "Project Management — percentage of total job cost for PM oversight",
    unit: "%",
    minRate: 5,
    maxRate: 15,
    averageRate: 10,
    region: null,
    source: "NRPG RA-848",
    updateFrequency: "Quarterly",
  },
  {
    itemType: "photoDocumentationFee",
    category: "Fees",
    description: "Photo Documentation Fee — comprehensive photographic evidence package",
    unit: "$",
    minRate: 95,
    maxRate: 250,
    averageRate: 172.5,
    region: null,
    source: "NRPG RA-848",
    updateFrequency: "Quarterly",
  },
];

async function main() {
  console.log("Seeding CostDatabase — RA-849 M2 national average rates...");

  let created = 0;
  let skipped = 0;

  for (const entry of COST_DATABASE_ENTRIES) {
    // Upsert on itemType + region (null = national) to be idempotent
    const existing = await prisma.costDatabase.findFirst({
      where: { itemType: entry.itemType, region: null },
    });

    if (existing) {
      await prisma.costDatabase.update({
        where: { id: existing.id },
        data: {
          ...entry,
          lastUpdated: new Date(),
        },
      });
      console.log(`  ✓ Updated: ${entry.itemType}`);
      skipped++;
    } else {
      await prisma.costDatabase.create({
        data: {
          ...entry,
          isActive: true,
          lastUpdated: new Date(),
        },
      });
      console.log(`  + Created: ${entry.itemType}`);
      created++;
    }
  }

  console.log(`\nDone. Created: ${created}, Updated: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
