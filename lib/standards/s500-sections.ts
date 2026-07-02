/**
 * ANSI/IICRC S500-2021 (5th ed.) section index — verified source of truth for
 * section→title recall.
 *
 * Values transcribed from the owner's LICENSED per-chapter PDFs (verified
 * 2026-06-30): §10 "016 - Inspections" (full §10.1–§10.9 subsection ToC),
 * §12 "018 - Structural Restoration", §7/§8/§9/§13 chapter PDFs. This is the
 * persistent store behind consistent
 * citation recall — it replaces ad-hoc per-file hardcoding.
 *
 * COPYRIGHT: this holds only section NUMBERS and short TITLES (facts / a table
 * of contents). It must NEVER contain verbatim standard prose — that lives only
 * in the owner's private store (enforced by scripts/check-no-verbatim-standards.ts).
 */

export const S500_SECTIONS: Readonly<Record<string, string>> = {
  "1": "Principles of Water Damage Restoration",
  "2": "Microbiology of Water Damage",
  "3": "Health Effects from Exposure to Microbial Contamination",
  "4": "Building and Material Science",
  "5": "Psychrometry and Drying Technology",
  "6": "Equipment, Instruments, and Tools",
  "7": "Antimicrobial (biocide) Technology",
  "7.1": "Antimicrobial (biocide) Use in Water Damage Projects",
  "7.2": "Risk Management (biocide training)",
  "7.3": "Application",
  "8": "Safety and Health",
  "8.4": "Personal Protective Equipment (PPE)",
  "8.4.1": "Respirator Use and Written Respiratory Protection Plan",
  "8.4.2": "Respirator Types",
  "8.12": "Lockout/Tagout (Control of Hazardous Energy)",
  "9": "Administrative Procedures, Project Documentation, and Risk Management",
  "9.1": "Administrative Procedures",
  "9.2": "Project Documentation and Recordkeeping",
  "9.2.3": "Project Monitoring Logs",
  "9.2.4": "Required Documentation",
  "9.2.5": "Recommended Documentation",
  "9.3": "Risk Management",
  "10": "Inspections, Preliminary Determinations, and Pre-Restoration Evaluations",
  "10.1": "Introduction",
  "10.2": "Qualifications",
  "10.3": "Documentation",
  "10.4": "Definitions of Category and Class",
  "10.4.1": "Category of Water",
  "10.4.2": "Regulated, Hazardous Materials, and Mold",
  "10.4.3": "Class of Water Intrusion",
  "10.4.4": "Other Factors Necessary to Estimate Humidity Control",
  "10.5": "Initial Contact and Information Gathering",
  "10.6": "Initial Response, Inspection, and Preliminary Determination",
  "10.6.1": "Safety and Health Hazards",
  "10.6.2": "Identify Priorities and Concerns",
  "10.6.3": "Extent of Water Migration",
  "10.6.4": "Pre-existing Damage",
  "10.6.5": "Secondary Damage",
  "10.6.6": "Dry Standards and Drying Goals",
  "10.6.7": "Preliminary Determination",
  "10.6.8": "Performing the Initial Moisture Inspection",
  "10.7": "Pre-Remediation and Pre-Restoration Evaluation",
  "10.7.1": "Evaluating Emergency Response Actions",
  "10.7.2": "Evaluating Building Materials and Assemblies",
  "10.7.3": "Evaluating Contents",
  "10.7.4": "Evaluating HVAC Systems",
  "10.7.5": "Evaluating Below-Grade, Substructure and Unfinished Spaces",
  "10.8": "Project Work Plans",
  "10.9": "Ongoing Inspections and Monitoring",
  "11": "Limitations, Complexities, Complications, and Conflicts",
  "12": "Structural Restoration",
  "12.3.2": "Engineering Controls",
  "12.3.3": "Bulk Material Removal and Water Extraction",
  "12.3.6": "Controlled Demolition and Removal of Unrestorable Components",
  "12.4.2": "Controlling Humidity and Stabilization",
  "12.5": "Drying (Post-Cleaning)",
  "12.5.7": "Verifying Drying Goals",
  "13": "Heating, Ventilating, and Air Conditioning (HVAC) Restoration",
  "13.4": "HVAC System Assessment, Cleaning, and Restoration",
  "14": "Contents Evaluation, Restoration, and Remediation",
  "15": "Large or Catastrophic Restoration Projects",
  "16": "Materials and Assemblies",
} as const;

export interface StandardSection {
  /** Canonical in-product citation, e.g. "S500:2021 §10.4.1". */
  citationKey: string;
  /** Section title, e.g. "Category of Water". */
  title: string;
}

/**
 * Recall a verified S500 section by number.
 * `getS500Section("10.4.1")` → { citationKey: "S500:2021 §10.4.1", title: "Category of Water" }.
 * Returns null for an unknown section (caller handles — never fabricate a citation).
 */
export function getS500Section(section: string): StandardSection | null {
  const key = section.trim().replace(/^§\s*/, "").trim();
  const title = S500_SECTIONS[key];
  if (title === undefined) return null;
  return { citationKey: `S500:2021 §${key}`, title };
}
