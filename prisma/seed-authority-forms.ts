/**
 * Seed script for Authority Form Templates
 * Run with: npx tsx prisma/seed-authority-forms.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const formTemplates = [
  {
    name: "Authority to Commence Work",
    code: "AUTH_COMMENCE",
    description: "Authorization for restoration company to commence work on the property",
    formContent: JSON.stringify({
      fields: [
        { id: "authorityDescription", type: "textarea", label: "Authority Description", required: true }
      ],
      defaultSignatories: ["CLIENT"]
    }),
    isActive: true
  },
  {
    name: "Authority to Dispose",
    code: "AUTH_DISPOSE",
    description: "Authorization to dispose of contaminated or damaged materials",
    formContent: JSON.stringify({
      fields: [
        { id: "authorityDescription", type: "textarea", label: "Authority Description", required: true }
      ],
      defaultSignatories: ["CLIENT", "INSURER"]
    }),
    isActive: true
  },
  {
    name: "Authority to Not Remove Recommended Damaged Building Materials",
    code: "AUTH_NO_REMOVE",
    description: "Client authorization to not remove recommended damaged building materials",
    formContent: JSON.stringify({
      fields: [
        { id: "authorityDescription", type: "textarea", label: "Authority Description", required: true }
      ],
      defaultSignatories: ["CLIENT"]
    }),
    isActive: true
  },
  {
    name: "Authority for Chemical Treatment",
    code: "AUTH_CHEMICAL",
    description: "Authorization for antimicrobial or chemical treatment application",
    formContent: JSON.stringify({
      fields: [
        { id: "authorityDescription", type: "textarea", label: "Authority Description", required: true }
      ],
      defaultSignatories: ["CLIENT"]
    }),
    isActive: true
  },
  {
    name: "Authority for Extended Drying Period",
    code: "AUTH_EXTENDED_DRYING",
    description: "Authorization for extended drying period beyond standard timeline",
    formContent: JSON.stringify({
      fields: [
        { id: "authorityDescription", type: "textarea", label: "Authority Description", required: true }
      ],
      defaultSignatories: ["CLIENT"]
    }),
    isActive: true
  }
]

async function main() {
  console.log("Seeding authority form templates...")

  for (const template of formTemplates) {
    const existing = await prisma.authorityFormTemplate.findUnique({
      where: { code: template.code }
    })

    if (existing) {
      console.log(`Template ${template.code} already exists, skipping...`)
      continue
    }

    await prisma.authorityFormTemplate.create({
      data: template
    })

    console.log(`Created template: ${template.name}`)
  }

  console.log("Authority form templates seeded successfully!")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
