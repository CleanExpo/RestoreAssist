/**
 * Seed the ANZ materials library into the Material table (spec §5.1, B1).
 *
 * Single source of truth is `lib/anz/materials.ts`; this upserts each entry by
 * slug so it is idempotent and safe to re-run.
 *
 * RA-8510: a material with no guide row has `dryStandardMc: null`, but the
 * Material column is NOT NULL. For those, an existing row keeps its stored
 * value (no app code reads the column) and a missing row is skipped with a
 * warning rather than given a number invented here.
 *
 * Run:  npx tsx prisma/seed-anz-materials.ts
 */
import { prisma } from "../lib/prisma";
import { ANZ_MATERIALS } from "../lib/anz/materials";

async function main() {
  let upserted = 0;
  for (const m of ANZ_MATERIALS) {
    const fields = {
      name: m.name,
      region: m.region,
      isPotentialAcm: m.isPotentialAcm,
      category: m.category,
    };

    if (m.dryStandardMc === null) {
      const { count } = await prisma.material.updateMany({
        where: { slug: m.id },
        data: fields,
      });
      if (count === 0) {
        console.warn(
          `Skipped ${m.id}: no guide value and Material.dryStandardMc is NOT NULL.`,
        );
        continue;
      }
      upserted += 1;
      continue;
    }

    await prisma.material.upsert({
      where: { slug: m.id },
      create: { slug: m.id, ...fields, dryStandardMc: m.dryStandardMc },
      update: { ...fields, dryStandardMc: m.dryStandardMc },
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
