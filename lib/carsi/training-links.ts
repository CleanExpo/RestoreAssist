/**
 * CARSI training for a job, by claim type (decision D-007).
 *
 * CARSI owns courses, assessments and credentials. RestoreAssist only links into
 * them from the job a technician is working on. It never grants a course, never
 * hosts course content, and never claims CEC hours (those are approved per course
 * by the IICRC and shown only on CARSI).
 *
 * Every slug below is a course published in CARSI's catalogue
 * (CleanExpo/CARSI `data/seed/courses-catalog.json`) as at 20/11/2026. Courses
 * still awaiting go-live (e.g. Water Restoration Practitioner) are deliberately
 * absent: add one only after CARSI publishes it.
 */

export const CARSI_ORIGIN = "https://carsi.com.au";

export type CarsiTrainingClaimType =
  | "WATER"
  | "FIRE"
  | "MOULD"
  | "STORM"
  | "CONTENTS"
  | "BIOHAZARD"
  | "ODOUR"
  | "CARPET"
  | "HVAC"
  | "ASBESTOS";

export interface CarsiCourseLink {
  slug: string;
  title: string;
}

const COURSES = {
  waterEssentials: { slug: "water-damage-essentials", title: "Water Damage Essentials" },
  appliedDrying: { slug: "introduction-to-applied-structural-drying", title: "Applied Structural Drying" },
  psychrometry: { slug: "introduction-to-psychrometry-science-and-calculations", title: "Psychrometry Science and Calculations" },
  moistureMeters: { slug: "moisture-meters-readings-and-dry-standards", title: "Moisture Meters, Readings and Dry Standards" },
  extraction: { slug: "introduction-to-water-extraction-methods", title: "Water Extraction Methods" },
  microbial: { slug: "introduction-to-applied-microbial-remediation", title: "Applied Microbial Remediation" },
  smokeSoot: { slug: "introduction-to-smoke-and-soot-damage-restoration", title: "Smoke and Soot Damage Restoration" },
  odour: { slug: "introduction-to-odour-control-and-removal-techniques", title: "Odour Control and Removal" },
  carpet: { slug: "introduction-to-basic-carpet-cleaning-and-drying", title: "Carpet Cleaning and Drying" },
  airQuality: { slug: "introduction-to-monitoring-air-quality-on-the-job-site", title: "Monitoring Air Quality on the Job Site" },
  ppe: { slug: "introduction-to-using-personal-protective-equipment", title: "Using Personal Protective Equipment" },
  biosecurity: { slug: "avian-influenza-awareness-restoration-iaq-facilities", title: "Avian Influenza Awareness for Restoration and Facilities" },
} satisfies Record<string, CarsiCourseLink>;

/**
 * Claim types with no matching course map to an empty list, and the panel then
 * links to the catalogue. ASBESTOS is empty on purpose: removal is licensed work,
 * and a PPE course must not read as training for it.
 */
export const CARSI_TRAINING_BY_CLAIM_TYPE: Record<CarsiTrainingClaimType, CarsiCourseLink[]> = {
  WATER: [COURSES.waterEssentials, COURSES.appliedDrying, COURSES.psychrometry, COURSES.moistureMeters],
  STORM: [COURSES.waterEssentials, COURSES.extraction, COURSES.appliedDrying],
  MOULD: [COURSES.microbial, COURSES.ppe],
  FIRE: [COURSES.smokeSoot, COURSES.odour],
  ODOUR: [COURSES.odour],
  CARPET: [COURSES.carpet],
  HVAC: [COURSES.airQuality],
  BIOHAZARD: [COURSES.ppe, COURSES.biosecurity],
  CONTENTS: [],
  ASBESTOS: [],
};

function withTracking(path: string, claimType: string): string {
  const url = new URL(path, CARSI_ORIGIN);
  url.searchParams.set("utm_source", "restoreassist");
  url.searchParams.set("utm_medium", "job");
  url.searchParams.set("utm_campaign", claimType.toLowerCase());
  return url.toString();
}

export interface CarsiTrainingForJob {
  courses: Array<CarsiCourseLink & { url: string }>;
  catalogueUrl: string;
}

/** Courses for a job's claim type. Unknown or missing claim types get the catalogue only. */
export function carsiTrainingForClaimType(claimType: string | null | undefined): CarsiTrainingForJob {
  const key = (claimType ?? "").toUpperCase() as CarsiTrainingClaimType;
  const courses = CARSI_TRAINING_BY_CLAIM_TYPE[key] ?? [];
  const tag = key && key in CARSI_TRAINING_BY_CLAIM_TYPE ? key : "general";
  return {
    courses: courses.map((c) => ({ ...c, url: withTracking(`/courses/${c.slug}`, tag) })),
    catalogueUrl: withTracking("/courses", tag),
  };
}
