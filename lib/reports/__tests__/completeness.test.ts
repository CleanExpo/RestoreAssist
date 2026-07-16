import { describe, expect, it } from "vitest";
import {
  computeReportCompletenessSections,
  overallScoreFromSections,
  scoreReportCompleteness,
  type CompletenessInput,
  type CompletenessSection,
} from "../completeness";

/**
 * Characterisation tests for the RA-7053 report-completeness scorer.
 * These pin the ACTUAL shipped behaviour read from completeness.ts — the
 * scorer backs both app/api/reports/completeness-check/route.ts and the
 * gate-metrics aggregation, so its section scores/thresholds must not drift
 * silently.
 */

/** A report where every one of the 10 sections scores 100. */
function completeInput(): CompletenessInput {
  return {
    client: { name: "Acme Pty Ltd", email: "ops@acme.test", phone: "0400000000" },
    reportNumber: "R-1",
    scopeOfWorksDocument: null,
    costEstimationDocument: null,
    totalCost: null,
    authorityForms: [{ id: "af1" }],
    inspection: {
      environmentalData: { temp: 22 },
      moistureReadings: [{ id: "m1" }],
      affectedAreas: [{ id: "a1" }],
      classifications: [{ id: "c1" }],
      scopeItems: [{ id: "s1" }],
      costEstimates: [{ id: "ce1" }],
      photos: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      claimSketches: [{ id: "sk1", renderedPngUrl: "https://cdn.test/plan.png" }],
      contentsManifestDraft: "manifest",
      floorPlanImageUrl: null,
      powerCircuits: 2,
      powerCircuitRatingA: 20,
    },
  };
}

/** Deep-clone the complete fixture then apply an override mutation. */
function withInput(
  mutate: (i: CompletenessInput) => void,
): CompletenessInput {
  const i = completeInput();
  mutate(i);
  return i;
}

function section(
  input: CompletenessInput,
  name: string,
): CompletenessSection {
  const found = computeReportCompletenessSections(input).find(
    (s) => s.name === name,
  );
  if (!found) throw new Error(`No section named "${name}"`);
  return found;
}

const SECTION_ORDER = [
  "Client Information",
  "Inspection Data",
  "IICRC Classification",
  "Scope of Works",
  "Cost Estimates",
  "Site Photos",
  "Floor Plan",
  "Signed Authorisations",
  "Contents Manifest",
  "Site Power Assessment",
];

describe("computeReportCompletenessSections — shape", () => {
  it("returns exactly the 10 sections in a stable order", () => {
    const names = computeReportCompletenessSections(completeInput()).map(
      (s) => s.name,
    );
    expect(names).toEqual(SECTION_ORDER);
  });

  it("scores every section 100 for a fully-complete report", () => {
    for (const s of computeReportCompletenessSections(completeInput())) {
      expect(s.score, s.name).toBe(100);
      expect(s.status, s.name).toBe("complete");
      expect(s.issues, s.name).toEqual([]);
    }
  });
});

// Table-driven per-section thresholds. Each row overrides the complete fixture
// and asserts the exact score + status the scorer produces.
type Row = {
  desc: string;
  section: string;
  mutate: (i: CompletenessInput) => void;
  score: number;
  status: CompletenessSection["status"];
};

const ROWS: Row[] = [
  // --- Client Information: 0 issues→100/complete, 1→66/partial, 2+→33/missing
  {
    desc: "client complete",
    section: "Client Information",
    mutate: () => {},
    score: 100,
    status: "complete",
  },
  {
    desc: "client missing one field (phone)",
    section: "Client Information",
    mutate: (i) => {
      i.client = { name: "Acme", email: "ops@acme.test", phone: null };
    },
    score: 66,
    status: "partial",
  },
  {
    desc: "client missing two fields (email+phone)",
    section: "Client Information",
    mutate: (i) => {
      i.client = { name: "Acme", email: null, phone: null };
    },
    score: 33,
    status: "missing",
  },

  // --- Inspection Data: 100 | 100-25*issues (floor 0); status ≤1→partial
  {
    desc: "inspection complete",
    section: "Inspection Data",
    mutate: () => {},
    score: 100,
    status: "complete",
  },
  {
    desc: "inspection missing environmental data only (1 issue)",
    section: "Inspection Data",
    mutate: (i) => {
      i.inspection!.environmentalData = null;
    },
    score: 75,
    status: "partial",
  },
  {
    desc: "inspection missing all three signals (3 issues)",
    section: "Inspection Data",
    mutate: (i) => {
      i.inspection!.environmentalData = null;
      i.inspection!.moistureReadings = [];
      i.inspection!.affectedAreas = [];
    },
    score: 25,
    status: "missing",
  },
  {
    desc: "no inspection linked (single issue)",
    section: "Inspection Data",
    mutate: (i) => {
      i.inspection = null;
    },
    score: 75,
    status: "partial",
  },

  // --- IICRC Classification: 100 | 0
  {
    desc: "classification run",
    section: "IICRC Classification",
    mutate: () => {},
    score: 100,
    status: "complete",
  },
  {
    desc: "classification not run",
    section: "IICRC Classification",
    mutate: (i) => {
      i.inspection!.classifications = [];
    },
    score: 0,
    status: "missing",
  },

  // --- Scope of Works: OR (scopeItems OR scopeOfWorksDocument)
  {
    desc: "scope via inspection scopeItems",
    section: "Scope of Works",
    mutate: () => {},
    score: 100,
    status: "complete",
  },
  {
    desc: "scope via report document when scopeItems empty (OR branch)",
    section: "Scope of Works",
    mutate: (i) => {
      i.inspection!.scopeItems = [];
      i.scopeOfWorksDocument = "generated scope";
    },
    score: 100,
    status: "complete",
  },
  {
    desc: "scope missing entirely",
    section: "Scope of Works",
    mutate: (i) => {
      i.inspection!.scopeItems = [];
      i.scopeOfWorksDocument = null;
    },
    score: 0,
    status: "missing",
  },

  // --- Cost Estimates: OR (costEstimates OR costEstimationDocument OR totalCost)
  {
    desc: "cost via inspection costEstimates",
    section: "Cost Estimates",
    mutate: () => {},
    score: 100,
    status: "complete",
  },
  {
    desc: "cost via totalCost when estimates empty (OR branch)",
    section: "Cost Estimates",
    mutate: (i) => {
      i.inspection!.costEstimates = [];
      i.totalCost = 5000;
    },
    score: 100,
    status: "complete",
  },
  {
    desc: "cost via document when estimates empty (OR branch)",
    section: "Cost Estimates",
    mutate: (i) => {
      i.inspection!.costEstimates = [];
      i.costEstimationDocument = "generated cost doc";
    },
    score: 100,
    status: "complete",
  },
  {
    desc: "cost missing entirely",
    section: "Cost Estimates",
    mutate: (i) => {
      i.inspection!.costEstimates = [];
    },
    score: 0,
    status: "missing",
  },

  // --- Site Photos: ≥3→100/complete, else 50/partial (0 photos is NOT "missing")
  {
    desc: "photos ≥3",
    section: "Site Photos",
    mutate: () => {},
    score: 100,
    status: "complete",
  },
  {
    desc: "photos present but < 3",
    section: "Site Photos",
    mutate: (i) => {
      i.inspection!.photos = [{ id: "p1" }, { id: "p2" }];
    },
    score: 50,
    status: "partial",
  },
  {
    desc: "no photos still scores 50/partial (characterisation)",
    section: "Site Photos",
    mutate: (i) => {
      i.inspection!.photos = [];
    },
    score: 50,
    status: "partial",
  },

  // --- Floor Plan: OR (rendered sketch OR floorPlanImageUrl); unrendered sketch ≠ pass
  {
    desc: "floor plan via rendered sketch",
    section: "Floor Plan",
    mutate: () => {},
    score: 100,
    status: "complete",
  },
  {
    desc: "floor plan via uploaded image when no sketch (OR branch)",
    section: "Floor Plan",
    mutate: (i) => {
      i.inspection!.claimSketches = [];
      i.inspection!.floorPlanImageUrl = "https://cdn.test/upload.png";
    },
    score: 100,
    status: "complete",
  },
  {
    desc: "unrendered sketch (null renderedPngUrl) does not satisfy floor plan",
    section: "Floor Plan",
    mutate: (i) => {
      i.inspection!.claimSketches = [{ id: "sk1", renderedPngUrl: null }];
      i.inspection!.floorPlanImageUrl = null;
    },
    score: 0,
    status: "missing",
  },

  // --- Signed Authorisations: 100 | 0
  {
    desc: "authority form on file",
    section: "Signed Authorisations",
    mutate: () => {},
    score: 100,
    status: "complete",
  },
  {
    desc: "no authority forms",
    section: "Signed Authorisations",
    mutate: (i) => {
      i.authorityForms = [];
    },
    score: 0,
    status: "missing",
  },

  // --- Contents Manifest: 100/complete | 50/partial (soft)
  {
    desc: "contents manifest captured",
    section: "Contents Manifest",
    mutate: () => {},
    score: 100,
    status: "complete",
  },
  {
    desc: "no contents manifest scores 50/partial (soft, not a hard fail)",
    section: "Contents Manifest",
    mutate: (i) => {
      i.inspection!.contentsManifestDraft = null;
    },
    score: 50,
    status: "partial",
  },

  // --- Site Power Assessment: 100 | 0 — needs BOTH circuits AND rating
  {
    desc: "power assessment complete (circuits + rating)",
    section: "Site Power Assessment",
    mutate: () => {},
    score: 100,
    status: "complete",
  },
  {
    desc: "power missing rating (circuits alone is insufficient)",
    section: "Site Power Assessment",
    mutate: (i) => {
      i.inspection!.powerCircuitRatingA = null;
    },
    score: 0,
    status: "missing",
  },
  {
    desc: "power missing entirely",
    section: "Site Power Assessment",
    mutate: (i) => {
      i.inspection!.powerCircuits = null;
      i.inspection!.powerCircuitRatingA = null;
    },
    score: 0,
    status: "missing",
  },
];

describe("computeReportCompletenessSections — per-section thresholds", () => {
  it.each(ROWS)(
    "$section: $desc → $score / $status",
    ({ section: name, mutate, score, status }) => {
      const s = section(withInput(mutate), name);
      expect(s.score).toBe(score);
      expect(s.status).toBe(status);
    },
  );
});

describe("overall score — Math.round(Σ/n) over 10 sections", () => {
  it("fully-complete report scores 100", () => {
    expect(scoreReportCompleteness(completeInput())).toBe(100);
  });

  it("empty report ({}) scores the documented floor of 21", () => {
    // Section scores for {}: 33 + 75 + 0 + 0 + 0 + 50 + 0 + 0 + 50 + 0 = 208
    // Math.round(208 / 10) = 21.
    expect(scoreReportCompleteness({})).toBe(21);
  });

  it("overallScoreFromSections rounds the section-score average", () => {
    const sections = computeReportCompletenessSections({});
    const sum = sections.reduce((acc, s) => acc + s.score, 0);
    expect(sum).toBe(208);
    expect(overallScoreFromSections(sections)).toBe(
      Math.round(sum / sections.length),
    );
  });

  it("scoreReportCompleteness equals overallScoreFromSections∘compute", () => {
    const input = withInput((i) => {
      i.client = { name: "Acme", email: null, phone: null }; // 33
      i.inspection!.classifications = []; // 0
    });
    const viaSections = overallScoreFromSections(
      computeReportCompletenessSections(input),
    );
    expect(scoreReportCompleteness(input)).toBe(viaSections);
  });
});
