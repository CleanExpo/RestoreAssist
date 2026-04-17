/**
 * Seed: New Zealand Insurer Profiles
 * RA-1120: NZ locale + 7 NZ insurer profiles
 *
 * Run: npx tsx prisma/seed-insurer-profiles-nz.ts
 *
 * Standards referenced:
 *   NZBS E2:2004+A3:2013 — External Moisture (NZ Building Code clause E2)
 *   NZBS E3 — Internal Moisture (NZ Building Code clause E3)
 *   IICRC S500:2025 — Water Damage Restoration Standard
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NZ_INSURER_PROFILES = [
  {
    slug: "iag-nz",
    name: "IAG NZ (State Insurance / AMI / NZI / Lumley)",
    aliases: ["State Insurance", "AMI", "NZI", "Lumley", "IAG NZ"],
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
    claimsEmailDomain: "iag.co.nz",
    portalUrl: "",
    specialInstructions:
      "IAG NZ (State/AMI/NZI/Lumley) requires scope of works signed by the property owner or authorised representative before work commences. Moisture readings must include room annotations or GPS coordinates. Contents damage must be itemised separately. All reports should reference GST-exclusive amounts; GST (15% NZ) is added separately. Submit documentation in PDF format with supporting photos.",
    iicrcComplianceNote:
      "IAG NZ references IICRC S500:2025 for water damage classification and category. NZ building compliance per NZBS E2:2004+A3:2013 §9 (subfloor moisture) and E3 (internal moisture management). Class and Category must be documented per S500:2025 §5.1–§5.3.",
    isSystemProfile: true,
  },
  {
    slug: "suncorp-nz",
    name: "Suncorp NZ (Vero NZ / AA Insurance)",
    aliases: ["Vero NZ", "Vero", "AA Insurance", "Suncorp NZ"],
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
    claimsEmailDomain: "suncorp.co.nz",
    portalUrl: "",
    specialInstructions:
      "Suncorp NZ (Vero/AA Insurance) requires daily progress reports for jobs exceeding 5 days. Enhanced report format preferred. Air quality readings required for all Category 2+ jobs. Invoice must reference the claim number. All amounts in NZD; GST at 15%. Submit reports and photos in PDF format.",
    iicrcComplianceNote:
      "Suncorp NZ follows IICRC S500:2025 and S520:2015 for mould remediation. NZ building compliance per NZBS E2:2004+A3:2013 and E3. Psychrometric readings required at start and end of each drying phase.",
    isSystemProfile: true,
  },
  {
    slug: "tower-nz",
    name: "Tower NZ",
    aliases: ["Tower", "Tower Insurance"],
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
    ],
    minPhotoCount: 8,
    reportFormat: "STANDARD" as const,
    requiresSignedScope: false,
    requiresThirdPartyScope: false,
    gstRegistrationRequired: true,
    claimsEmailDomain: "tower.co.nz",
    portalUrl: "https://www.tower.co.nz/claims",
    specialInstructions:
      "Tower NZ requires scope submission within 48 hours of initial assessment. Progress updates required every 48 hours during the drying phase. All documentation in PDF with photos. Invoice amounts in NZD excluding GST (15%). Include claim reference number on all communications.",
    iicrcComplianceNote:
      "Tower NZ accepts IICRC S500:2025 standards for water damage restoration. NZ building moisture compliance per NZBS E2:2004+A3:2013 §4 and E3. Document temperature and relative humidity readings twice daily during drying.",
    isSystemProfile: true,
  },
  {
    slug: "fmg-nz",
    name: "FMG (Farmers Mutual Group)",
    aliases: ["FMG", "Farmers Mutual", "Farmers Mutual Group"],
    requiredEvidenceClasses: [
      "SITE_OVERVIEW",
      "DAMAGE_CLOSE_UP",
      "MOISTURE_READING",
      "EQUIPMENT_PLACEMENT",
    ],
    preferredEvidenceClasses: [
      "THERMAL_IMAGE",
      "FLOOR_PLAN_ANNOTATION",
      "STRUCTURAL_ASSESSMENT",
      "COMPLETION_PHOTO",
    ],
    minPhotoCount: 8,
    reportFormat: "STANDARD" as const,
    requiresSignedScope: true,
    requiresThirdPartyScope: false,
    gstRegistrationRequired: true,
    claimsEmailDomain: "fmg.co.nz",
    portalUrl: "https://www.fmg.co.nz/claims",
    specialInstructions:
      "FMG specialises in rural and farming properties. Scope must be approved before commencement. Farm buildings and rural structures may require structural assessment photos. Subfloor and agricultural moisture environments require additional documentation. All amounts in NZD; GST 15% itemised separately. PDF reports with photos required.",
    iicrcComplianceNote:
      "FMG references IICRC S500:2025 for water damage. NZ rural building compliance under NZBS E2:2004+A3:2013 — particular attention to §6 (roofs and walls) for farm structures. Subfloor moisture per E3 internal moisture clause.",
    isSystemProfile: true,
  },
  {
    slug: "mas-nz",
    name: "MAS (Medical Assurance Society)",
    aliases: ["MAS", "Medical Assurance Society"],
    requiredEvidenceClasses: [
      "SITE_OVERVIEW",
      "DAMAGE_CLOSE_UP",
      "MOISTURE_READING",
      "EQUIPMENT_PLACEMENT",
      "COMPLETION_PHOTO",
    ],
    preferredEvidenceClasses: [
      "THERMAL_IMAGE",
      "AIR_QUALITY_READING",
      "FLOOR_PLAN_ANNOTATION",
      "PROGRESS_PHOTO",
    ],
    minPhotoCount: 8,
    reportFormat: "ENHANCED" as const,
    requiresSignedScope: false,
    requiresThirdPartyScope: false,
    gstRegistrationRequired: true,
    claimsEmailDomain: "mas.co.nz",
    portalUrl: "https://www.mas.co.nz/claims",
    specialInstructions:
      "MAS serves medical professionals and their families. Higher documentation standards expected given the professional membership. Air quality readings recommended for any Category 2+ job. Submit reports in PDF format. Amounts in NZD; GST 15% shown separately. Pre-authorisation recommended for jobs over $5,000.",
    iicrcComplianceNote:
      "MAS references IICRC S500:2025 standards. NZ building compliance per NZBS E2:2004+A3:2013 and E3. Air quality documentation per S520:2015 for any mould-adjacent restoration work.",
    isSystemProfile: true,
  },
  {
    slug: "ando-nz",
    name: "Ando NZ",
    aliases: ["Ando", "Ando Insurance"],
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
    ],
    minPhotoCount: 6,
    reportFormat: "STANDARD" as const,
    requiresSignedScope: false,
    requiresThirdPartyScope: false,
    gstRegistrationRequired: true,
    claimsEmailDomain: "ando.co.nz",
    portalUrl: "",
    specialInstructions:
      "Ando NZ is a digital-first NZ insurer. Prefer digital submission of all documentation. PDF reports with embedded photos accepted. Amounts in NZD; GST 15% shown separately. Include claim reference on all communications. Moisture readings should reference room names and measurement locations clearly.",
    iicrcComplianceNote:
      "Ando NZ accepts IICRC S500:2025 for water damage restoration. NZ building moisture compliance per NZBS E2:2004+A3:2013 and E3. Class and Category designation required per S500:2025 §5.1.",
    isSystemProfile: true,
  },
  {
    slug: "qbe-nz",
    name: "QBE NZ",
    aliases: ["QBE New Zealand", "QBE NZ"],
    requiredEvidenceClasses: [
      "SITE_OVERVIEW",
      "DAMAGE_CLOSE_UP",
      "MOISTURE_READING",
      "EQUIPMENT_PLACEMENT",
      "STRUCTURAL_ASSESSMENT",
      "COMPLETION_PHOTO",
    ],
    preferredEvidenceClasses: [
      "THERMAL_IMAGE",
      "MATERIAL_SAMPLE",
      "FLOOR_PLAN_ANNOTATION",
      "AIR_QUALITY_READING",
    ],
    minPhotoCount: 10,
    reportFormat: "ENHANCED" as const,
    requiresSignedScope: true,
    requiresThirdPartyScope: true,
    gstRegistrationRequired: true,
    claimsEmailDomain: "qbe.com",
    portalUrl: "https://www.qbe.com/nz/claims",
    specialInstructions:
      "QBE NZ requires an independent scoper (not the restorer) for all jobs over NZD $10,000. Thermal imaging strongly preferred for Category 2+ jobs. Structural assessment photos required where wall or ceiling cavities are affected. Third-party scope must be submitted before QBE approves work. All IICRC certifications must be current — include certification numbers in report. Amounts in NZD; GST 15% itemised.",
    iicrcComplianceNote:
      "QBE NZ references IICRC S500:2025 and requires explicit Class and Category designation per §5.1. NZ building moisture compliance per NZBS E2:2004+A3:2013 and E3. All technicians must hold current IICRC certifications.",
    isSystemProfile: true,
  },
];

async function main() {
  console.log("Seeding NZ insurer profiles...");

  for (const profile of NZ_INSURER_PROFILES) {
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

  console.log(`\nSeeded ${NZ_INSURER_PROFILES.length} NZ insurer profiles.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
