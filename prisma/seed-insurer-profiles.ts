/**
 * Seed: Australian Insurer Profiles
 * RA-406: Sprint H — Insurer profile templates
 *
 * Run: npx ts-node prisma/seed-insurer-profiles.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const INSURER_PROFILES = [
  {
    slug: "iag",
    name: "IAG (NRMA / CGU / SGIO)",
    aliases: ["NRMA", "CGU", "SGIO", "SGIC", "Swann", "IAG"],
    requiredEvidenceClasses: [
      "SITE_OVERVIEW",
      "DAMAGE_CLOSE_UP",
      "MOISTURE_READING",
      "EQUIPMENT_PLACEMENT",
    ],
    preferredEvidenceClasses: [
      "THERMAL_IMAGE",
      "FLOOR_PLAN_ANNOTATION",
      "PROGRESS_PHOTO",
      "COMPLETION_PHOTO",
      "AFFECTED_CONTENTS",
    ],
    minPhotoCount: 8,
    reportFormat: "STANDARD" as const,
    requiresSignedScope: true,
    requiresThirdPartyScope: false,
    gstRegistrationRequired: true,
    claimsEmailDomain: "iag.com.au",
    portalUrl: "https://www.nrma.com.au/claims",
    specialInstructions:
      "IAG requires scope of works to be signed by the property owner or their authorised representative before restoration work commences. All moisture readings must include GPS coordinates or room annotations. Contents damage must be itemised separately.",
    iicrcComplianceNote:
      "IAG references IICRC S500:2025 for all water damage claims. Classification and category must be documented per §5.1–§5.3.",
    isSystemProfile: true,
  },
  {
    slug: "suncorp",
    name: "Suncorp (AAMI / GIO / Apia)",
    aliases: ["AAMI", "GIO", "Apia", "Shannons", "Bingle", "Suncorp"],
    requiredEvidenceClasses: [
      "SITE_OVERVIEW",
      "DAMAGE_CLOSE_UP",
      "MOISTURE_READING",
      "EQUIPMENT_PLACEMENT",
      "COMPLETION_PHOTO",
    ],
    preferredEvidenceClasses: [
      "THERMAL_IMAGE",
      "FLOOR_PLAN_ANNOTATION",
      "PROGRESS_PHOTO",
      "AIR_QUALITY_READING",
    ],
    minPhotoCount: 10,
    reportFormat: "ENHANCED" as const,
    requiresSignedScope: false,
    requiresThirdPartyScope: false,
    gstRegistrationRequired: true,
    claimsEmailDomain: "suncorp.com.au",
    portalUrl: "https://www.suncorp.com.au/insurance/claims.html",
    specialInstructions:
      "Suncorp (AAMI/GIO) requires daily progress reports for jobs exceeding 5 days. Enhanced report format preferred. Air quality readings required for all Category 2+ jobs. Invoice must reference the claim number in the description field.",
    iicrcComplianceNote:
      "Suncorp follows IICRC S500:2025 and S520:2015 for mould remediation. Document psychrometric readings at start and end of each drying phase.",
    isSystemProfile: true,
  },
  {
    slug: "qbe",
    name: "QBE Insurance",
    aliases: ["QBE"],
    requiredEvidenceClasses: [
      "SITE_OVERVIEW",
      "DAMAGE_CLOSE_UP",
      "MOISTURE_READING",
      "EQUIPMENT_PLACEMENT",
      "STRUCTURAL_ASSESSMENT",
    ],
    preferredEvidenceClasses: [
      "THERMAL_IMAGE",
      "MATERIAL_SAMPLE",
      "FLOOR_PLAN_ANNOTATION",
      "COMPLETION_PHOTO",
    ],
    minPhotoCount: 10,
    reportFormat: "ENHANCED" as const,
    requiresSignedScope: true,
    requiresThirdPartyScope: true,
    gstRegistrationRequired: true,
    claimsEmailDomain: "qbe.com",
    portalUrl: "https://www.qbe.com/au/claims",
    specialInstructions:
      "QBE requires an independent scoper (not the restorer) for all jobs over $10,000. Thermal imaging is strongly preferred for Category 2+ jobs. Structural assessment photos required where wall or ceiling cavities are affected. Third-party scope must be submitted before QBE approves work to commence.",
    iicrcComplianceNote:
      "QBE references IICRC S500:2025 and requires explicit Class and Category designation per §5.1. All technicians must hold current IICRC certifications — include certification numbers in report.",
    isSystemProfile: true,
  },
  {
    slug: "allianz",
    name: "Allianz Australia",
    aliases: ["Allianz"],
    requiredEvidenceClasses: [
      "SITE_OVERVIEW",
      "DAMAGE_CLOSE_UP",
      "MOISTURE_READING",
      "EQUIPMENT_PLACEMENT",
      "COMPLETION_PHOTO",
    ],
    preferredEvidenceClasses: [
      "THERMAL_IMAGE",
      "FLOOR_PLAN_ANNOTATION",
      "PROGRESS_PHOTO",
      "UTILITY_STATUS",
    ],
    minPhotoCount: 8,
    reportFormat: "STANDARD" as const,
    requiresSignedScope: false,
    requiresThirdPartyScope: false,
    gstRegistrationRequired: true,
    claimsEmailDomain: "allianz.com.au",
    portalUrl: "https://www.allianz.com.au/claims",
    specialInstructions:
      "Allianz requires utility isolation photos (water shut-off, power isolation) for all Category 2+ jobs. Scope of works must be submitted within 24 hours of initial assessment. Progress reports required every 48 hours for drying phase.",
    iicrcComplianceNote:
      "Allianz accepts IICRC S500:2025 standards. Document temperature and humidity at minimum twice daily during drying phase.",
    isSystemProfile: true,
  },
  {
    slug: "zurich",
    name: "Zurich Financial Services",
    aliases: ["Zurich"],
    requiredEvidenceClasses: [
      "SITE_OVERVIEW",
      "DAMAGE_CLOSE_UP",
      "MOISTURE_READING",
      "STRUCTURAL_ASSESSMENT",
      "EQUIPMENT_PLACEMENT",
      "COMPLETION_PHOTO",
    ],
    preferredEvidenceClasses: [
      "THERMAL_IMAGE",
      "MATERIAL_SAMPLE",
      "AIR_QUALITY_READING",
      "ENVIRONMENTAL_CONDITION",
    ],
    minPhotoCount: 12,
    reportFormat: "FORENSIC" as const,
    requiresSignedScope: true,
    requiresThirdPartyScope: true,
    gstRegistrationRequired: true,
    claimsEmailDomain: "zurich.com.au",
    portalUrl: "https://www.zurich.com.au/claims",
    specialInstructions:
      "Zurich typically handles commercial and high-value residential claims. Forensic-level documentation required. All material samples must be logged with chain-of-custody. Independent scoper required for all commercial jobs. Pre-authorisation required before commencing work on jobs over $5,000.",
    iicrcComplianceNote:
      "Zurich requires full IICRC S500:2025 compliance documentation including psychrometric calculations, drying goals, and daily progress logging.",
    isSystemProfile: true,
  },
  {
    slug: "aig",
    name: "AIG Australia",
    aliases: ["AIG", "American International Group"],
    requiredEvidenceClasses: [
      "SITE_OVERVIEW",
      "DAMAGE_CLOSE_UP",
      "MOISTURE_READING",
      "EQUIPMENT_PLACEMENT",
      "AFFECTED_CONTENTS",
      "COMPLETION_PHOTO",
    ],
    preferredEvidenceClasses: [
      "THERMAL_IMAGE",
      "FLOOR_PLAN_ANNOTATION",
      "STRUCTURAL_ASSESSMENT",
      "MATERIAL_SAMPLE",
    ],
    minPhotoCount: 10,
    reportFormat: "ENHANCED" as const,
    requiresSignedScope: true,
    requiresThirdPartyScope: false,
    gstRegistrationRequired: true,
    claimsEmailDomain: "aig.com",
    portalUrl: "https://www.aig.com.au/claims",
    specialInstructions:
      "AIG requires a separate contents manifest for all jobs where personal property is affected. Contents items must be individually photographed and valued. Signed scope required before commencement.",
    iicrcComplianceNote:
      "AIG references IICRC S500:2025. Contents damage documentation should follow IICRC contents restoration guidelines where applicable.",
    isSystemProfile: true,
  },
];

async function main() {
  console.log("Seeding insurer profiles...");

  for (const profile of INSURER_PROFILES) {
    await (prisma as any).insurerProfile.upsert({
      where: { slug: profile.slug },
      update: {
        ...profile,
        updatedAt: new Date(),
      },
      create: {
        ...profile,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log(`  ✓ ${profile.name}`);
  }

  console.log(`\nSeeded ${INSURER_PROFILES.length} insurer profiles.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
