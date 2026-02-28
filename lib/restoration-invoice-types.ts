/**
 * Restoration Tax Invoice types — Australian law wording.
 * Each type has its own title, default line items, and applicable standards.
 */

export interface RestorationInvoiceTypeLineItem {
  description: string
  qty: string
  unit: string
  rate: string
}

export interface RestorationInvoiceTypeConfig {
  id: string
  label: string
  title: string
  subtitle?: string
  defaultLineItems: RestorationInvoiceTypeLineItem[]
  applicableStandards: string[]
  /** Default "Standard Applied" in certification section */
  standardApplied: string
}

export const RESTORATION_INVOICE_TYPES: RestorationInvoiceTypeConfig[] = [
  {
    id: "water",
    label: "Water Damage Restoration",
    title: "Water Damage Restoration — Tax Invoice (Cost Incurred)",
    subtitle: "Cost Incurred",
    standardApplied: "AS-IICRC S500:2025",
    applicableStandards: ["AS-IICRC S500:2025"],
    defaultLineItems: [
      { description: "Emergency Response & Site Assessment — Initial attendance, moisture mapping, hazard assessment, containment setup, and emergency water extraction per AS-IICRC S500:2025 §1.2", qty: "1", unit: "EA", rate: "550.00" },
      { description: "Water Extraction — Standing water removal using truck-mounted and portable extraction equipment from all affected areas", qty: "45", unit: "m²", rate: "12.50" },
      { description: "Structural Drying — Deployment of air movers and LGR dehumidifiers, daily monitoring, psychrometric logging, and moisture readings until dry standard achieved", qty: "4", unit: "Days", rate: "385.00" },
      { description: "Antimicrobial Treatment — Application of antimicrobial solution to all affected surfaces to prevent microbial amplification per AS-IICRC S500:2025", qty: "45", unit: "m²", rate: "8.50" },
      { description: "Content Manipulation — Removal, protection, and replacement of contents to facilitate drying and restoration of affected areas", qty: "1", unit: "EA", rate: "450.00" },
      { description: "Demolition & Removal — Removal of non-salvageable water-damaged materials (e.g., carpet, underlay, plasterboard) including disposal to nearest lawful facility", qty: "1", unit: "EA", rate: "680.00" },
      { description: "Drying Certificate & Documentation Package — Final moisture readings, drying logs, photographic evidence report, Certificate of Completion for insurer submission", qty: "1", unit: "EA", rate: "250.00" },
    ],
  },
  {
    id: "fire",
    label: "Fire & Smoke Restoration",
    title: "Fire & Smoke Restoration — Tax Invoice (Cost Incurred)",
    subtitle: "Cost Incurred",
    standardApplied: "BSR/IICRC S700 (Fire & Smoke)",
    applicableStandards: ["BSR/IICRC S700", "AS-IICRC S500:2025 where applicable"],
    defaultLineItems: [
      { description: "Emergency Response & Site Assessment — Initial attendance, safety assessment, board-up, containment, and emergency mitigation per IICRC S700", qty: "1", unit: "EA", rate: "650.00" },
      { description: "Soot & Smoke Residue Cleaning — Mechanical and chemical cleaning of affected surfaces, HVAC cleaning, and odour mitigation", qty: "1", unit: "EA", rate: "520.00" },
      { description: "Content Pack-Out & Cleaning — Inventory, pack-out, cleaning, and pack-back of salvageable contents", qty: "1", unit: "EA", rate: "480.00" },
      { description: "Structural Drying (if water used in suppression) — Air movers, dehumidifiers, moisture monitoring until dry standard achieved", qty: "3", unit: "Days", rate: "385.00" },
      { description: "Odour Neutralisation — Thermal fogging, ozone, or hydroxyl treatment as applicable", qty: "1", unit: "EA", rate: "420.00" },
      { description: "Controlled Demolition — Removal of non-salvageable fire/smoke-affected materials including disposal", qty: "1", unit: "EA", rate: "720.00" },
      { description: "Documentation Package — Photographic evidence, scope report, Certificate of Completion for insurer submission", qty: "1", unit: "EA", rate: "250.00" },
    ],
  },
  {
    id: "mould",
    label: "Mould Remediation",
    title: "Mould Remediation — Tax Invoice (Cost Incurred)",
    subtitle: "Cost Incurred",
    standardApplied: "IICRC S520 (Mould)",
    applicableStandards: ["IICRC S520", "AS-IICRC S500:2025 where applicable"],
    defaultLineItems: [
      { description: "Assessment & Protocol Development — Visual assessment, moisture mapping, scope of works, and remediation protocol per IICRC S520", qty: "1", unit: "EA", rate: "580.00" },
      { description: "Containment & Engineering Controls — Negative pressure containment, HEPA filtration, and access control", qty: "1", unit: "EA", rate: "620.00" },
      { description: "Removal of Contaminated Materials — Removal and lawful disposal of non-salvageable mould-affected materials", qty: "1", unit: "EA", rate: "550.00" },
      { description: "Surface Cleaning & Antimicrobial Treatment — HEPA vacuuming, damp wiping, and antimicrobial application per S520", qty: "45", unit: "m²", rate: "14.50" },
      { description: "Structural Drying — If moisture source present; air movers, dehumidifiers, monitoring until dry standard", qty: "4", unit: "Days", rate: "385.00" },
      { description: "Clearance Testing (if applicable) — Post-remediation air/surface sampling by independent hygienist", qty: "1", unit: "EA", rate: "450.00" },
      { description: "Documentation Package — Protocol, photographic evidence, clearance report, Certificate of Completion", qty: "1", unit: "EA", rate: "250.00" },
    ],
  },
  {
    id: "bioclean",
    label: "Biohazard / BioClean",
    title: "Biohazard Clean-Up — Tax Invoice (Cost Incurred)",
    subtitle: "Cost Incurred",
    standardApplied: "IICRC S540 (Trauma/Crime Scene)",
    applicableStandards: ["IICRC S540", "AS/NZS 4145", "WHS Regulation 2011"],
    defaultLineItems: [
      { description: "Site Assessment & Risk Assessment — Hazard identification, PPE protocol, and scope of remediation per IICRC S540", qty: "1", unit: "EA", rate: "550.00" },
      { description: "Containment & Engineering Controls — Negative pressure, HEPA filtration, and decontamination zone setup", qty: "1", unit: "EA", rate: "680.00" },
      { description: "Removal & Disposal of Contaminated Materials — Removal and lawful disposal of all contaminated materials to licensed facility", qty: "1", unit: "EA", rate: "720.00" },
      { description: "Surface Cleaning & Disinfection — Multi-stage cleaning and EPA-approved disinfectant application", qty: "1", unit: "EA", rate: "580.00" },
      { description: "Decontamination of Equipment & PPE — Cleaning and disinfection of all equipment and reusable PPE", qty: "1", unit: "EA", rate: "280.00" },
      { description: "Documentation & Certificate of Completion — Photographic evidence, waste manifests, Certificate of Completion", qty: "1", unit: "EA", rate: "250.00" },
    ],
  },
  {
    id: "fire_water",
    label: "Fire + Water (Combined)",
    title: "Fire & Water Damage Restoration — Tax Invoice (Cost Incurred)",
    subtitle: "Cost Incurred",
    standardApplied: "BSR/IICRC S700, AS-IICRC S500:2025",
    applicableStandards: ["BSR/IICRC S700", "AS-IICRC S500:2025"],
    defaultLineItems: [
      { description: "Emergency Response & Site Assessment — Safety assessment, board-up, moisture mapping, containment per S700 and S500", qty: "1", unit: "EA", rate: "650.00" },
      { description: "Water Extraction (suppression water) — Standing water removal from affected areas", qty: "1", unit: "EA", rate: "480.00" },
      { description: "Soot & Smoke Residue Cleaning — Mechanical and chemical cleaning of affected surfaces", qty: "1", unit: "EA", rate: "520.00" },
      { description: "Structural Drying — Air movers, LGR dehumidifiers, daily monitoring until dry standard achieved", qty: "4", unit: "Days", rate: "385.00" },
      { description: "Antimicrobial Treatment — Application to all affected surfaces per S500", qty: "45", unit: "m²", rate: "8.50" },
      { description: "Demolition & Removal — Non-salvageable materials removal and disposal", qty: "1", unit: "EA", rate: "720.00" },
      { description: "Documentation Package — Drying logs, photo report, Certificate of Completion", qty: "1", unit: "EA", rate: "250.00" },
    ],
  },
  {
    id: "water_mould",
    label: "Water + Mould",
    title: "Water Damage & Mould Remediation — Tax Invoice (Cost Incurred)",
    subtitle: "Cost Incurred",
    standardApplied: "AS-IICRC S500:2025, IICRC S520",
    applicableStandards: ["AS-IICRC S500:2025", "IICRC S520"],
    defaultLineItems: [
      { description: "Emergency Response & Water Extraction — Initial attendance, moisture mapping, water extraction per S500", qty: "1", unit: "EA", rate: "550.00" },
      { description: "Mould Assessment & Protocol — Visual assessment, scope, and remediation protocol per S520", qty: "1", unit: "EA", rate: "450.00" },
      { description: "Containment & Engineering Controls — Negative pressure, HEPA filtration for mould remediation", qty: "1", unit: "EA", rate: "580.00" },
      { description: "Structural Drying — Air movers, dehumidifiers, daily monitoring until dry standard", qty: "4", unit: "Days", rate: "385.00" },
      { description: "Removal of Mould-Affected Materials — Removal and lawful disposal of non-salvageable materials", qty: "1", unit: "EA", rate: "620.00" },
      { description: "Surface Cleaning & Antimicrobial Treatment — Per S500 and S520", qty: "45", unit: "m²", rate: "12.00" },
      { description: "Documentation Package — Drying logs, photo report, Certificate of Completion", qty: "1", unit: "EA", rate: "250.00" },
    ],
  },
  {
    id: "biohazard_structural_drying",
    label: "Biohazard Structural Drying",
    title: "Biohazard / Structural Drying — Tax Invoice (Cost Incurred)",
    subtitle: "Cost Incurred",
    standardApplied: "IICRC S540, AS-IICRC S500:2025",
    applicableStandards: ["IICRC S540", "AS-IICRC S500:2025", "AS/NZS 4145"],
    defaultLineItems: [
      { description: "Site Assessment & Hazard Identification — Per IICRC S540 and WHS requirements", qty: "1", unit: "EA", rate: "550.00" },
      { description: "Containment & Decontamination Setup — Negative pressure, HEPA, decon zones", qty: "1", unit: "EA", rate: "650.00" },
      { description: "Removal & Disposal of Contaminated Materials — To licensed waste facility", qty: "1", unit: "EA", rate: "700.00" },
      { description: "Structural Drying (if applicable) — Air movers, dehumidifiers, monitoring per S500", qty: "4", unit: "Days", rate: "385.00" },
      { description: "Surface Cleaning & Disinfection — Multi-stage cleaning and disinfection", qty: "1", unit: "EA", rate: "580.00" },
      { description: "Documentation Package — Waste manifests, photo report, Certificate of Completion", qty: "1", unit: "EA", rate: "250.00" },
    ],
  },
  {
    id: "storm",
    label: "Storm / Wind / Hail",
    title: "Storm Damage Restoration — Tax Invoice (Cost Incurred)",
    subtitle: "Cost Incurred",
    standardApplied: "AS-IICRC S500:2025 (water), industry best practice",
    applicableStandards: ["AS-IICRC S500:2025", "Building Code of Australia"],
    defaultLineItems: [
      { description: "Emergency Response & Tarping — Make-safe, roof tarping, board-up to prevent further water ingress", qty: "1", unit: "EA", rate: "620.00" },
      { description: "Water Extraction — Standing water removal from affected areas", qty: "1", unit: "EA", rate: "480.00" },
      { description: "Structural Drying — Air movers, dehumidifiers, daily monitoring until dry standard", qty: "4", unit: "Days", rate: "385.00" },
      { description: "Antimicrobial Treatment — Application to all affected surfaces", qty: "45", unit: "m²", rate: "8.50" },
      { description: "Demolition & Removal — Non-salvageable materials removal and disposal", qty: "1", unit: "EA", rate: "680.00" },
      { description: "Documentation Package — Photo report, drying logs, Certificate of Completion", qty: "1", unit: "EA", rate: "250.00" },
    ],
  },
]

export function getRestorationInvoiceTypeById(id: string): RestorationInvoiceTypeConfig | undefined {
  return RESTORATION_INVOICE_TYPES.find((t) => t.id === id)
}
