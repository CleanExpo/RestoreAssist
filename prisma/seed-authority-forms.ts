/**
 * Seed script for Authority Form Templates.
 * Run with: npx tsx prisma/seed-authority-forms.ts
 *
 * The templates themselves live in lib/documents/authority-catalogue.ts, which
 * is the single source of truth and the thing check:regulatory-registry gates.
 * They used to be defined here as JSON blobs, which put the only definition of
 * five customer-facing consent documents inside a script that nothing
 * type-checked and no gate could see.
 *
 * This script is now just the writer: read the catalogue, upsert the rows.
 */
import { PrismaClient } from "@prisma/client";
import {
  AUTHORITY_TEMPLATES,
  formContentFor,
} from "../lib/documents/authority-catalogue";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding authority form templates...");

  for (const spec of AUTHORITY_TEMPLATES) {
    const formContent = formContentFor(spec);
    const existing = await prisma.authorityFormTemplate.findUnique({
      where: { code: spec.code },
    });

    if (existing) {
      // Previously this skipped, which meant a template that gained a
      // regulatory citation never reached an environment that had already been
      // seeded -- the catalogue and the database would silently disagree, and
      // the database is what renders the document. Update the content-bearing
      // fields and leave isActive alone so an operator's decision to retire a
      // template is not undone by a re-seed.
      await prisma.authorityFormTemplate.update({
        where: { code: spec.code },
        data: {
          name: spec.name,
          description: spec.description,
          formContent,
        },
      });
      console.log(`Updated template: ${spec.code}`);
      continue;
    }

    await prisma.authorityFormTemplate.create({
      data: {
        code: spec.code,
        name: spec.name,
        description: spec.description,
        formContent,
        isActive: spec.isActive,
      },
    });
    console.log(`Created template: ${spec.name}`);
  }

  console.log("Authority form templates seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
