/**
 * Statute-bearing sentences the inspection report viewer prints.
 *
 * RA-7361: these used to be Australian literals inside
 * RestorationInspectionReportViewer, so a New Zealand job still asserted the
 * Work Health and Safety Act 2011, the National Construction Code, and the
 * WHS Regulations 2011. The viewer now asks this module. Unknown jurisdiction
 * hides a statute rather than inventing an Australian one.
 */

export type ViewerJurisdiction = "NZ" | "AU" | "unknown";

export interface ViewerJurisdictionSource {
  state?: string | null;
  workSafetyAuthority?: string | null;
  standards?: string[] | null;
}

const IICRC_S500 = "IICRC S500 (Water Damage Restoration)";
const IICRC_S520 = "IICRC S520 (Mould Remediation)";
const AS_NZS_3000 = "AS/NZS 3000 (Electrical wiring rules)";
const HSWA_2015 = "Health and Safety at Work Act 2015 (NZ)";
const WORKSAFE_NZ = "WorkSafe New Zealand";
const WHS_ACT_2011 = "Work Health and Safety Act 2011";
const NCC = "National Construction Code (NCC)";
const WHS_REGS_2011 = "Work Health and Safety Regulations 2011";

export function viewerJurisdiction(
  source: ViewerJurisdictionSource,
): ViewerJurisdiction {
  const state = (source.state ?? "").trim();
  const authority = (source.workSafetyAuthority ?? "").trim();
  const blob = [state, authority, ...(source.standards ?? [])].join("\n");

  if (
    /^NZ$/i.test(state) ||
    /^New Zealand$/i.test(state) ||
    authority === WORKSAFE_NZ ||
    /Health and Safety at Work Act 2015/.test(blob)
  ) {
    return "NZ";
  }
  if (state || authority) return "AU";
  return "unknown";
}

export function viewerComplianceStandards(
  source: ViewerJurisdictionSource,
): string[] {
  const recorded = (source.standards ?? []).filter(
    (standard) => typeof standard === "string" && standard.trim().length > 0,
  );
  if (recorded.length > 0) return recorded;

  const jurisdiction = viewerJurisdiction(source);
  if (jurisdiction === "NZ") {
    return [IICRC_S500, IICRC_S520, HSWA_2015, AS_NZS_3000];
  }
  if (jurisdiction === "AU") {
    return [IICRC_S500, IICRC_S520, WHS_ACT_2011, NCC, AS_NZS_3000];
  }
  return [IICRC_S500, IICRC_S520, AS_NZS_3000];
}

export function viewerOpeningStatement(jurisdiction: ViewerJurisdiction): string {
  if (jurisdiction === "NZ") {
    return `This professional restoration inspection report has been prepared in accordance with IICRC S500 (Water Damage Restoration) standards and the ${HSWA_2015}, regulated by ${WORKSAFE_NZ}.`;
  }
  if (jurisdiction === "AU") {
    return `This professional restoration inspection report has been prepared in accordance with IICRC S500 (Water Damage Restoration) standards and relevant Australian regulations including the ${NCC} and ${WHS_ACT_2011}.`;
  }
  return "This professional restoration inspection report has been prepared in accordance with IICRC S500 (Water Damage Restoration) standards.";
}

export function viewerClosingCompliance(
  jurisdiction: ViewerJurisdiction,
): string {
  if (jurisdiction === "NZ") {
    return `All remediation procedures will be conducted in strict compliance with IICRC S500 standards, the ${HSWA_2015}, and AS/NZS 3000 electrical safety standards where applicable.`;
  }
  if (jurisdiction === "AU") {
    return `All remediation procedures will be conducted in strict compliance with IICRC S500 standards, National Construction Code requirements, ${WHS_ACT_2011}, and AS/NZS 3000 electrical safety standards where applicable.`;
  }
  return "All remediation procedures will be conducted in strict compliance with IICRC S500 standards and AS/NZS 3000 electrical safety standards where applicable.";
}

export function viewerCostStandardsPhrase(
  jurisdiction: ViewerJurisdiction,
): string {
  if (jurisdiction === "NZ") {
    return "compliance with New Zealand restoration standards";
  }
  if (jurisdiction === "AU") {
    return "compliance with Australian restoration standards";
  }
  return "compliance with applicable restoration standards";
}

function eraYear(flag: string): string {
  const match = /^(?:PRE|POST)-(\d{4})(?:_BUILDING|_NOT_CLEARED)$/.exec(flag);
  return match ? match[1] : "the presumption year";
}

export function viewerAsbestosComplianceProse(
  asbestosRiskFlag: string,
  jurisdiction: ViewerJurisdiction,
): string {
  const year = eraYear(asbestosRiskFlag);
  if (jurisdiction === "NZ") {
    return `Given the building's age (pre-${year}), potential asbestos-containing materials may be present, requiring assessment in accordance with the ${HSWA_2015} before any demolition or structural work.`;
  }
  if (jurisdiction === "AU") {
    return `Given the building's age (pre-${year}), potential asbestos-containing materials may be present, requiring assessment in accordance with ${WHS_REGS_2011} before any demolition or structural work.`;
  }
  return `Given the building's age (pre-${year}), potential asbestos-containing materials may be present, requiring assessment before any demolition or structural work.`;
}

export function viewerLeadComplianceProse(
  leadRiskFlag: string,
  jurisdiction: ViewerJurisdiction,
): string {
  const year = eraYear(leadRiskFlag);
  if (jurisdiction === "NZ") {
    return `Lead-based materials may be present in this pre-${year} structure, necessitating appropriate safety measures per the ${HSWA_2015}.`;
  }
  if (jurisdiction === "AU") {
    return `Lead-based materials may be present in this pre-${year} structure, necessitating appropriate safety measures per ${WHS_REGS_2011}.`;
  }
  return `Lead-based materials may be present in this pre-${year} structure, necessitating appropriate safety measures.`;
}

export function viewerHazardPanelCompliance(
  kind: "asbestos" | "lead",
  flag: string,
  jurisdiction: ViewerJurisdiction,
): string {
  const year = eraYear(flag);
  const subject = kind === "asbestos" ? "asbestos assessment" : "lead assessment";
  if (jurisdiction === "NZ") {
    return `${HSWA_2015} requires ${subject} for pre-${year} buildings.`;
  }
  if (jurisdiction === "AU") {
    return `${WHS_REGS_2011} (WHS) require ${subject} for pre-${year} buildings.`;
  }
  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} is required for pre-${year} buildings.`;
}

/**
 * Every statute-bearing sentence the viewer can print for this job.
 * Tests scan this blob so a hardcoded AU fallback cannot hide in JSX.
 */
export function collectViewerComplianceProse(source: {
  state?: string | null;
  workSafetyAuthority?: string | null;
  standards?: string[] | null;
  asbestosRisk?: string | null;
  leadRisk?: string | null;
}): string {
  const jurisdiction = viewerJurisdiction(source);
  const parts = [
    ...viewerComplianceStandards(source),
    viewerOpeningStatement(jurisdiction),
    viewerClosingCompliance(jurisdiction),
    viewerCostStandardsPhrase(jurisdiction),
  ];
  if (source.asbestosRisk) {
    parts.push(
      viewerAsbestosComplianceProse(source.asbestosRisk, jurisdiction),
      viewerHazardPanelCompliance("asbestos", source.asbestosRisk, jurisdiction),
    );
  }
  if (source.leadRisk && /^PRE-\d{4}_BUILDING$/.test(source.leadRisk)) {
    parts.push(
      viewerLeadComplianceProse(source.leadRisk, jurisdiction),
      viewerHazardPanelCompliance("lead", source.leadRisk, jurisdiction),
    );
  }
  return parts.join("\n");
}

export interface JurisdictionLawLabels {
  /** Work health and safety law, as a short in-sentence label. */
  safety: string;
  /** Building code, as a short in-sentence label. */
  buildingCode: string;
  /** "IICRC S500, S520, <safety>, <building code>, and AS/NZS 3000". */
  standardsList: string;
}

/**
 * RA-7625: short law labels for the report screens' progress notes and the
 * default report instructions, which are sent into report generation. Every
 * one of those strings used to name WHS Regulations 2011 and the NCC for
 * every job, New Zealand included.
 *
 * `country` is Inspection.propertyCountry, the field report generation reads
 * (RA-7361). AS/NZS 3000 is a joint AU/NZ standard, so it stays on both.
 *
 * An unknown country keeps the Australian labels on purpose: that is what
 * these strings said before, and generation resolves a job with no recorded
 * country from its postcode as Australian. Nothing New Zealand is invented
 * for a job that did not say it is in New Zealand.
 */
export function jurisdictionLawLabels(
  country: string | null | undefined,
): JurisdictionLawLabels {
  const nz = viewerJurisdiction({ state: country }) === "NZ";
  const safety = nz ? "HSWA 2015 (WorkSafe NZ)" : "WHS Regulations 2011";
  const buildingCode = nz ? "NZ Building Code" : "NCC";
  return {
    safety,
    buildingCode,
    standardsList: `IICRC S500, S520, ${safety}, ${buildingCode}, and AS/NZS 3000`,
  };
}
