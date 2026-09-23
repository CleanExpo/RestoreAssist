/**
 * RA-7713 part 11 — the job page's evidence readiness figure.
 *
 * The readiness panel counted six job-page sections (claim type, photos,
 * areas, moisture, classification, scope) and showed "Ready 100%" while the
 * Field Evidence Checklist right below it said "Required 0/10 complete".
 * Readiness can now never exceed required-checklist completion.
 */

export interface RequiredEvidenceProgress {
  present: number;
  total: number;
}

export interface EvidenceReadiness {
  /** 0-100, or null while the required checklist is unknown. */
  percent: number | null;
  /** True when required evidence exists and none of it is captured. */
  notStarted: boolean;
  /** Null when unknown or not wired. */
  requiredComplete: boolean | null;
}

function pct(done: number, total: number): number {
  return total <= 0 ? 100 : Math.round((done / total) * 100);
}

/**
 * @param required undefined = no checklist wired (section-only, legacy);
 *                 null = checklist not loaded or failed (unknown).
 */
export function evidenceReadiness({
  sectionsComplete,
  sectionsTotal,
  required,
}: {
  sectionsComplete: number;
  sectionsTotal: number;
  required: RequiredEvidenceProgress | null | undefined;
}): EvidenceReadiness {
  const sectionPct = pct(sectionsComplete, sectionsTotal);
  if (required === undefined) {
    return { percent: sectionPct, notStarted: false, requiredComplete: null };
  }
  if (required === null) {
    return { percent: null, notStarted: false, requiredComplete: null };
  }
  const requiredPct = pct(required.present, required.total);
  return {
    percent: Math.min(sectionPct, requiredPct),
    notStarted: required.total > 0 && required.present === 0,
    requiredComplete: required.present >= required.total,
  };
}
