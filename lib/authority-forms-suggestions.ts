/**
 * Auto-suggestion logic for Authority Forms based on report data.
 *
 * WHICH WAY THIS ERRS, AND WHY. A suggestion is an offer, not a gate: nothing
 * here blocks a job, and a form that is offered and declined costs a click. A
 * hazard document that is NOT offered costs the thing it was written to
 * prevent. So where a signal is missing the safety documents are still offered,
 * at a lower priority, with a reason that says the input was not recorded --
 * never silently withheld.
 *
 * That asymmetry is deliberate and it is the opposite of the rule used for
 * REGULATORY CONTENT, where an unknown must never be filled in with a guess.
 * The two are consistent: both refuse to let an unknown pass as a known. Here
 * the unknown surfaces as a lower-priority offer that names what is missing;
 * in lib/documents/provenance.ts it surfaces as a notice on the page.
 *
 * NO REGULATORY YEAR IS WRITTEN HERE. Whether a building falls in a presumption
 * era is asked of lib/compliance/asbestos-era.ts and lead-era.ts, which read the
 * registry. The reasons below describe the test in words and let the document
 * carry the number, because a year in this file would be a fifth copy of the
 * value that once reported a 1995 building as asbestos-free.
 */
import { presumeAsbestosFromEra } from "@/lib/compliance/asbestos-era";
import { presumeLeadFromEra } from "@/lib/compliance/lead-era";

export interface ReportAnalysis {
  waterCategory?: string | null; // "Category 1", "Category 2", "Category 3"
  waterClass?: string | null; // "1", "2", "3", "4"
  scopeItems?: string[]; // Array of scope item IDs
  equipmentDeployed?: boolean;
  hasDemolition?: boolean;
  hasDisposal?: boolean;
  hasContamination?: boolean;
  biologicalMouldDetected?: boolean;
  methamphetamineScreen?: string | null;
  /**
   * Year the building was constructed, from the linked inspection.
   *
   * `null` and `undefined` both mean NOT RECORDED, and that is a distinct third
   * state from "old enough" and "not old enough". `presumeAsbestosFromEra`
   * returns false for a null year -- correct for a report field, which must not
   * assert a hazard it cannot establish, but wrong as the only input to a
   * suggestion, where it would silently withhold the document.
   */
  propertyYearBuilt?: number | null;
  /** Country whose presumption years apply. `null` when never recorded. */
  jurisdiction?: "AU" | "NZ" | null;
  /** Cutting, grinding, drilling or breaking silica-bearing material. */
  hasDustGeneratingWork?: boolean;
  /**
   * How many WHS incidents the linked inspection carries.
   *
   * Any at all makes the Notifiable Incident Record required. Whether a given
   * incident is legally notifiable is a judgement about facts that belongs with
   * a person and their regulator -- so this offers the document and lets them
   * decide, rather than deciding for them and being silently wrong.
   */
  whsIncidentCount?: number;
}

export interface SuggestedForm {
  templateCode: string;
  templateName: string;
  priority: "required" | "recommended" | "optional";
  reason: string;
}

/**
 * Analyze report data and suggest appropriate authority forms
 */
export function suggestAuthorityForms(
  analysis: ReportAnalysis,
): SuggestedForm[] {
  const suggestions: SuggestedForm[] = [];

  // 1. Authority to Commence Work
  // Required if equipment is being deployed or work is starting
  if (analysis.equipmentDeployed || analysis.waterCategory) {
    suggestions.push({
      templateCode: "AUTH_COMMENCE",
      templateName: "Authority to Commence Work",
      priority: "required",
      reason:
        "Equipment deployment or work commencement requires client authorization",
    });
  }

  // 2. Authority to Dispose
  // Required for Category 3 water or contaminated materials
  if (
    analysis.waterCategory?.includes("Category 3") ||
    analysis.waterCategory?.includes("Category 2") ||
    analysis.hasContamination ||
    analysis.biologicalMouldDetected ||
    analysis.methamphetamineScreen === "POSITIVE"
  ) {
    suggestions.push({
      templateCode: "AUTH_DISPOSE",
      templateName: "Authority to Dispose",
      priority: "required",
      reason:
        "Contaminated materials or Category 2/3 water requires disposal authorization",
    });
  }

  // 3. Authority to Not Remove Recommended Damaged Building Materials
  // Required if demolition is recommended but client declines
  if (analysis.hasDemolition) {
    suggestions.push({
      templateCode: "AUTH_NO_REMOVE",
      templateName:
        "Authority to Not Remove Recommended Damaged Building Materials",
      priority: "recommended",
      reason: "Demolition work is recommended - client may decline removal",
    });
  }

  // 4. Authority for Chemical Treatment
  // Recommended if antimicrobial treatment is needed
  if (analysis.biologicalMouldDetected || analysis.hasContamination) {
    suggestions.push({
      templateCode: "AUTH_CHEMICAL",
      templateName: "Authority for Chemical Treatment",
      priority: "recommended",
      reason:
        "Antimicrobial or chemical treatment may be required for contamination",
    });
  }

  // 5. Authority for Extended Drying Period
  // Optional if extended drying is needed (Class 4 or large area)
  if (analysis.waterClass === "4" || String(analysis.waterClass) === "4") {
    suggestions.push({
      templateCode: "AUTH_EXTENDED_DRYING",
      templateName: "Authority for Extended Drying Period",
      priority: "optional",
      reason: "Class 4 water damage may require extended drying period",
    });
  }

  // ── The four documents added for spec 9.3 ─────────────────────────────────

  // The era test has THREE outcomes, and collapsing them to two is the defect
  // this guards. `presumeAsbestosFromEra` answers false both for a modern
  // building and for a year nobody recorded; only the first is a reason not to
  // offer the document.
  const eraKnown =
    analysis.propertyYearBuilt != null &&
    Number.isFinite(analysis.propertyYearBuilt) &&
    analysis.jurisdiction != null;

  const asbestosPresumed =
    eraKnown &&
    presumeAsbestosFromEra(analysis.propertyYearBuilt, analysis.jurisdiction!);
  const leadPresumed =
    eraKnown &&
    presumeLeadFromEra(analysis.propertyYearBuilt, analysis.jurisdiction!);

  // 6. Asbestos Assessment Authority
  // Disturbing material in a building of the presumption era is the trigger.
  // Where the era cannot be established the document is still offered, one
  // priority lower, because "we did not record the year" is not "the building
  // is modern".
  if (asbestosPresumed || (!eraKnown && analysis.hasDemolition)) {
    suggestions.push({
      templateCode: "AUTH_ASBESTOS_ASSESSMENT",
      templateName: "Asbestos Assessment Authority",
      priority: asbestosPresumed && analysis.hasDemolition ? "required" : "recommended",
      reason: asbestosPresumed
        ? "The building's age falls inside the asbestos presumption period for this jurisdiction, so how asbestos was established should be recorded before material is disturbed"
        : "Material is being removed and the building's year or country was not recorded, so the asbestos presumption cannot be ruled out",
    });
  }

  // 7. Silica Risk Control Plan
  // Cutting, grinding or breaking concrete, masonry, render or tile. Demolition
  // alone is a weaker signal than a named dust-generating task, so it offers
  // rather than requires.
  if (analysis.hasDustGeneratingWork || analysis.hasDemolition) {
    suggestions.push({
      templateCode: "SILICA_CONTROL_PLAN",
      templateName: "Silica Risk Control Plan",
      priority: analysis.hasDustGeneratingWork ? "required" : "recommended",
      reason: analysis.hasDustGeneratingWork
        ? "The scope includes cutting, grinding or breaking silica-bearing material, so the controls must be recorded before the work starts"
        : "Removal work may generate respirable dust from concrete, masonry, render or tile",
    });
  }

  // 8. WHS Site Induction Record
  // Anyone attending a site with an identified hazard is inducted on it. Lead
  // appears here and not in its own document because the induction is where a
  // presumed lead coating is communicated to the people who may disturb it.
  const inductionHazard =
    asbestosPresumed ||
    leadPresumed ||
    analysis.hasDustGeneratingWork ||
    analysis.hasContamination ||
    analysis.biologicalMouldDetected;

  if (inductionHazard || analysis.equipmentDeployed) {
    suggestions.push({
      templateCode: "WHS_SITE_INDUCTION",
      templateName: "WHS Site Induction Record",
      priority: inductionHazard ? "required" : "recommended",
      reason: inductionHazard
        ? "A hazard has been identified on this site, so everyone attending is inducted on it and on the controls in place"
        : "People will be attending the site to place and service equipment",
    });
  }

  // 9. Certificate of Completion
  // Deliberately OPTIONAL and deliberately not conditional on completion: the
  // analysis carries no signal for whether works have finished, and inventing
  // one would be a guess wearing the shape of a fact. A job that ran drying
  // equipment will end with this document; offering it at the lowest priority
  // says so without claiming the job is over.
  if (analysis.equipmentDeployed) {
    suggestions.push({
      templateCode: "CERT_COMPLETION",
      templateName: "Certificate of Completion",
      priority: "optional",
      reason:
        "Issued when the works finish, to record the drying goal, the final readings against it and any clearance evidence",
    });
  }

  // 10. Notifiable Incident Record
  // The one document here with a statutory clock on it. Both countries run the
  // notification duty from the moment the business becomes aware, and neither
  // gives a grace period, so this is offered as required the instant an
  // incident exists rather than waiting for anyone to classify it.
  if ((analysis.whsIncidentCount ?? 0) > 0) {
    suggestions.push({
      templateCode: "NOTIFIABLE_INCIDENT_RECORD",
      templateName: "Notifiable Incident Record",
      priority: "required",
      reason:
        "An incident has been recorded on this job. Confirm with the regulator whether it is notifiable, and record when the business became aware -- that is when the duty to notify starts running",
    });
  }

  // Sort by priority: required > recommended > optional
  return suggestions.sort((a, b) => {
    const priorityOrder = { required: 0, recommended: 1, optional: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Extract report analysis from report data
 */
export function extractReportAnalysis(report: any): ReportAnalysis {
  // Parse scope items from JSON if available
  let scopeItems: string[] = [];
  try {
    if (report.scopeOfWorksData) {
      const scopeData = JSON.parse(report.scopeOfWorksData);
      if (Array.isArray(scopeData)) {
        scopeItems = scopeData
          .map((item: any) => item.id || item.itemType || item.code)
          .filter(Boolean);
      } else if (scopeData.items && Array.isArray(scopeData.items)) {
        scopeItems = scopeData.items
          .map((item: any) => item.id || item.itemType || item.code)
          .filter(Boolean);
      }
    }
  } catch (e) {
    // Ignore parse errors
  }

  // Check for demolition in scope items
  const hasDemolition = scopeItems.some(
    (item: string) =>
      item.toLowerCase().includes("demolish") ||
      item.toLowerCase().includes("remove") ||
      item.toLowerCase().includes("demolition"),
  );

  // Check for disposal in scope items
  const hasDisposal = scopeItems.some(
    (item: string) =>
      item.toLowerCase().includes("dispose") ||
      item.toLowerCase().includes("disposal") ||
      item.toLowerCase().includes("waste"),
  );

  // Cutting, grinding, drilling or breaking silica-bearing material. Kept
  // separate from hasDemolition: demolition may be soft-strip with no dust, and
  // a tile cut generates respirable silica without being demolition at all.
  const hasDustGeneratingWork = scopeItems.some((item: string) => {
    const v = item.toLowerCase();
    const action = /\b(cut|cutting|grind|grinding|drill|drilling|saw|sawing|chase|chasing|jackhammer|break|breaking)\b/.test(v);
    const material = /\b(concrete|masonry|brick|block|render|screed|tile|mortar|stone|fibre[- ]?cement|fiber[- ]?cement)\b/.test(v);
    return action && material;
  });

  // Check if equipment is deployed
  const equipmentDeployed = !!(
    report.equipmentSelection ||
    report.equipmentUsed ||
    report.psychrometricAssessment
  );

  return {
    waterCategory: report.waterCategory,
    waterClass: report.waterClass,
    scopeItems,
    equipmentDeployed,
    hasDemolition,
    hasDisposal,
    hasContamination:
      report.biologicalMouldDetected ||
      report.methamphetamineScreen === "POSITIVE",
    biologicalMouldDetected: report.biologicalMouldDetected || false,
    methamphetamineScreen: report.methamphetamineScreen,
    hasDustGeneratingWork,
    whsIncidentCount: report.inspection?._count?.whsIncidents ?? 0,
    // Both live on the linked inspection, not on Report. A report with no
    // inspection yields null for each, which reads as NOT RECORDED rather than
    // as a modern building -- see the note on ReportAnalysis.
    propertyYearBuilt: normaliseYearBuilt(report.inspection?.propertyYearBuilt),
    jurisdiction: normaliseJurisdiction(report.inspection?.propertyCountry),
  };
}

/** A usable year, or null. A zero, a string or a stray 0000 is not a year. */
function normaliseYearBuilt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n > 1000 && n < 2200 ? n : null;
}

/**
 * The job's country, or null.
 *
 * `Inspection.propertyCountry` defaults to "AU", so an "AU" here may be the
 * column default rather than a confirmation. That weakness is disclosed on the
 * document by lib/documents/provenance.ts; for a SUGGESTION it is acceptable,
 * because the consequence of being wrong is offering a form that is declined.
 * Anything unrecognised returns null rather than falling back to Australia.
 */
function normaliseJurisdiction(value: unknown): "AU" | "NZ" | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  if (v === "NZ" || v === "NEW ZEALAND") return "NZ";
  if (v === "AU" || v === "AUS" || v === "AUSTRALIA") return "AU";
  return null;
}
