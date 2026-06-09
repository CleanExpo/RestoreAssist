/**
 * Seed the ANZ materials library into the Material table (spec §5.1, B1).
 *
 * Single source of truth is `lib/anz/materials.ts`; this upserts each entry by
 * slug so it is idempotent and safe to re-run.
 *
 * Run:  npx tsx prisma/seed-anz-materials.ts
 */
import { prisma } from "../lib/prisma";
import { ANZ_MATERIALS } from "../lib/anz/materials";

async function main() {
  let upserted = 0;
  for (const m of ANZ_MATERIALS) {
    await prisma.material.upsert({
      where: { slug: m.id },
      create: {
        slug: m.id,
        name: m.name,
        region: m.region,
        dryStandardMc: m.dryStandardMc,
        isPotentialAcm: m.isPotentialAcm,
        category: m.category,
      },
      update: {
        name: m.name,
        region: m.region,
        dryStandardMc: m.dryStandardMc,
        isPotentialAcm: m.isPotentialAcm,
        category: m.category,
      },
    });
    upserted += 1;
  }
  console.log(`Seeded ${upserted} ANZ materials.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
