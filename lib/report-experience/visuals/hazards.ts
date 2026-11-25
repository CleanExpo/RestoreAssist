/**
 * RA-8107: hazard priority, critical alert and floor-plan hotspots.
 *
 * A hazard with no recorded severity is "not assessed", and is ranked with
 * HIGH: absence of a rating is never treated as safe. An empty hazard list is
 * reported as "none recorded", never as "no hazards". Positions are drawn only
 * when recorded and inside the plan.
 */

export type HazardSeverity = "critical" | "high" | "medium" | "low";
export type HazardVerification = "unverified" | "verified" | "resolved";

export type HazardInput = Readonly<{
  id: string;
  title: string;
  action: string;
  verification: HazardVerification;
  severity?: HazardSeverity | null;
  /** Normalised position on the floor plan, 0 to 1 on both axes. */
  position?: Readonly<{ x: number; y: number }> | null;
}>;

export type HazardCard = Readonly<{
  id: string;
  /** 1-based priority number, shared with the floor-plan hotspot. */
  number: number;
  title: string;
  action: string;
  verification: HazardVerification;
  severity: HazardSeverity | "not-assessed";
  severityLabel: string;
  locationRecorded: boolean;
}>;

export type HazardHotspot = Readonly<{ id: string; number: number; x: number; y: number; severity: HazardCard["severity"] }>;

export type HazardModel = Readonly<{
  cards: readonly HazardCard[];
  hotspots: readonly HazardHotspot[];
  criticalAlert: Readonly<{ count: number; titles: readonly string[] }> | null;
  noHazardsRecorded: boolean;
}>;

const SEVERITY_LABEL: Record<HazardCard["severity"], string> = {
  critical: "Critical danger",
  high: "High risk",
  medium: "Medium risk",
  low: "Low risk",
  "not-assessed": "Severity not assessed",
};

// Not assessed shares rank 1 with high so it can never sink below an assessed risk.
const SEVERITY_RANK: Record<HazardCard["severity"], number> = {
  critical: 0,
  high: 1,
  "not-assessed": 1,
  medium: 2,
  low: 3,
};

const VERIFICATION_RANK: Record<HazardVerification, number> = { unverified: 0, verified: 1, resolved: 2 };

function inPlan(position: HazardInput["position"]): position is { x: number; y: number } {
  return (
    !!position &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    position.x >= 0 &&
    position.x <= 1 &&
    position.y >= 0 &&
    position.y <= 1
  );
}

export function prioritiseHazards(hazards: readonly HazardInput[]): HazardModel {
  const rated = hazards.map((hazard) => ({
    hazard,
    severity: (hazard.severity ?? "not-assessed") as HazardCard["severity"],
  }));
  rated.sort((a, b) => {
    const resolved = Number(a.hazard.verification === "resolved") - Number(b.hazard.verification === "resolved");
    if (resolved) return resolved;
    return (
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      VERIFICATION_RANK[a.hazard.verification] - VERIFICATION_RANK[b.hazard.verification] ||
      (a.hazard.id < b.hazard.id ? -1 : a.hazard.id > b.hazard.id ? 1 : 0)
    );
  });

  const cards: HazardCard[] = rated.map(({ hazard, severity }, index) => ({
    id: hazard.id,
    number: index + 1,
    title: hazard.title,
    action: hazard.action,
    verification: hazard.verification,
    severity,
    severityLabel: SEVERITY_LABEL[severity],
    locationRecorded: inPlan(hazard.position),
  }));

  const hotspots: HazardHotspot[] = rated.flatMap(({ hazard, severity }, index) =>
    inPlan(hazard.position)
      ? [{ id: hazard.id, number: index + 1, x: hazard.position.x, y: hazard.position.y, severity }]
      : [],
  );

  const critical = cards.filter((c) => c.severity === "critical" && c.verification !== "resolved");
  return {
    cards,
    hotspots,
    criticalAlert: critical.length > 0 ? { count: critical.length, titles: critical.map((c) => c.title) } : null,
    noHazardsRecorded: hazards.length === 0,
  };
}
