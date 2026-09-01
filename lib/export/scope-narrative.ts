/**
 * Scope-of-works narrative generator (spec §11 — the human deliverable).
 *
 * Deterministically renders the versioned scope contract (`ScopeExport`) into a
 * plain-English, ANSI/IICRC S500:2021-grounded scope-of-works document (Markdown).
 * It is a FAITHFUL rendering of already-verified contract data — no LLM, no
 * inference, nothing fabricated. ANZ-native: AU reinstatement cites the NCC; NZ
 * routes via NHCover (Natural Hazards Insurance Act 2023). It references no
 * US/foreign estimating format.
 */
import { standardCite } from "@/lib/nir-standards-mapping";
import type { ScopeExport } from "./scope-contract";

const area = (m2: number) => `${m2.toFixed(1)} m²`;

export function buildScopeNarrative(scope: ScopeExport): string {
  const lines: string[] = [];

  // ── Header ──
  lines.push(`# Scope of Works — ${scope.property.address || "Property"}`);
  lines.push("");
  lines.push(
    `Report: ${scope.property.reportNumber || "—"} · Jurisdiction: ${scope.jurisdiction} · Contract v${scope.schemaVersion}`,
  );
  lines.push(
    "Standard: ANSI/IICRC S500:2021 — Professional Water Damage Restoration",
  );
  lines.push("");

  // ── Affected areas ──
  lines.push("## Affected areas");
  if (scope.floors.length === 0) {
    lines.push("No areas captured.");
  }
  const materialByRoom = new Map(
    scope.compliance.rows.map((r) => [r.roomLabel, r]),
  );
  for (const floor of scope.floors) {
    lines.push(`### ${floor.label}`);
    if (floor.rooms.length === 0) lines.push("- (no rooms drawn)");
    for (const room of floor.rooms) {
      const m = materialByRoom.get(room.label);
      const material = m?.materialName ?? "material not assigned";
      const acm = m?.isPotentialAcm ? " — SUSPECTED ASBESTOS (ACM)" : "";
      lines.push(`- ${room.label}: ${area(room.areaM2)} — ${material}${acm}`);
    }
    lines.push(`Floor total: ${area(floor.totalFloorAreaM2)}`);
    lines.push("");
  }
  lines.push(`Total floor area: ${area(scope.totalFloorAreaM2)}`);
  lines.push("");

  // ── WHS hazardous materials ──
  lines.push("## WHS — hazardous materials");
  if (scope.compliance.acmElements.length > 0) {
    lines.push(
      `Suspected asbestos-containing material (ACM) in: ${scope.compliance.acmElements.join(", ")}.`,
    );
    lines.push(
      "Demolition / strip-out scope is BLOCKED until a WHS pathway is recorded (friable vs non-friable, licensed removal per the relevant state regulator, or a sampling result).",
    );
  } else {
    lines.push("No suspected ACM identified in the annotated elements.");
  }
  lines.push("");

  // ── Water category ──
  lines.push("## Water category (ANSI/IICRC S500:2021)");
  if (scope.compliance.waterCategories.length === 0) {
    lines.push("No water category assigned.");
  }
  for (const c of scope.compliance.waterCategories) {
    lines.push(`### ${c.label}`);
    lines.push(c.description);
    lines.push(`- Minimum PPE: ${c.ppe.join(", ")}`);
    lines.push(
      `- Containment required: ${c.containmentRequired ? "yes" : "no"}`,
    );
    lines.push(
      `- Dispose affected materials as contaminated: ${c.disposalAsContaminated ? "yes" : "no"}`,
    );
    lines.push(
      `- Porous materials salvageable: ${c.porousMaterialsSalvageable ? "yes" : "no"}`,
    );
  }
  lines.push("");

  // ── Drying scope ──
  lines.push("## Drying scope (ANSI/IICRC S500:2021)");
  if (scope.compliance.dryingLog.length === 0) {
    lines.push("No moisture readings recorded.");
  }
  for (const d of scope.compliance.dryingLog) {
    const status = d.dryStandardMet ? "DRY" : "NOT YET DRY";
    const note = d.note ? ` · ${d.note}` : "";
    lines.push(
      `- ${d.materialLabel}: ${d.wme}% WME vs dry standard ${d.targetMc}% — ${status}${note}`,
    );
  }
  lines.push("");

  // ── Drying equipment ──
  // Phased and power-bounded (RA-7005), not an area division. On a mould job the
  // sequence is the point: Phase 1 carries no air movers at all, and a narrative
  // that flattened the phases into one list would read as a plain equipment
  // count and lose the S520 gate that makes it safe.
  const plan = scope.dryingPlan;
  lines.push(
    `## Drying equipment (${plan ? plan.citation : standardCite("S500", "6")})`,
  );
  if (!plan) {
    lines.push(
      "No affected floor area recorded — no drying equipment sized. Record room geometry before scoping equipment.",
    );
  } else {
    if (plan.mouldActive) {
      lines.push(
        "**Active mould on this job.** Air movers are withheld until the area clears to Condition 1 — running them over live growth aerosolises spores through the building.",
      );
      lines.push("");
    }
    for (const phase of plan.phases) {
      lines.push(`### Phase ${phase.phase} — ${phase.label}`);
      lines.push(`- Dehumidifiers: ${phase.equipment.dehumidifier}`);
      lines.push(
        `- Air movers: ${phase.equipment.airMover}${phase.airMoversAllowed ? "" : " (NONE this phase — gated behind PRV clearance)"}`,
      );
      lines.push(`- Air scrubbers / AFD: ${phase.equipment.airScrubber}`);
      lines.push(`- Load: ${phase.ampsTotal}A`);
      lines.push("");
    }
    const power = plan.power;
    lines.push(
      `Power budget: ${power.circuits} x ${power.circuitRatingA}A derated to ${Math.round(power.deratePct * 100)}% = ${power.siteUsableA}A usable.` +
        (power.assumed
          ? " **ASSUMED** — no on-site power assessment is on file for this job; confirm before equipment goes in."
          : ""),
    );
    if (plan.powerConstrained) {
      lines.push(
        "The ideal equipment count exceeds what this supply can power; the counts above are what fits.",
      );
    }
    for (const advisory of plan.advisories) {
      lines.push(`- ${advisory}`);
    }
  }
  lines.push("");

  // ── Reinstatement references ──
  lines.push("## Reinstatement references");
  if (scope.jurisdiction === "NZ" && scope.compliance.nhcover) {
    const nh = scope.compliance.nhcover;
    lines.push(
      `NHCover (Natural Hazards Insurance Act 2023) — building cap NZ$${nh.buildingCapNzd.toLocaleString("en-NZ")} + GST; excess NZ$${nh.flatExcessNzd} per insured home.`,
    );
    lines.push(
      "Natural hazards (earthquake, landslip, volcanic, hydrothermal, tsunami, fire) → NHCover building; storm/flood building damage → private insurer; land → NHCover.",
    );
    if (nh.routing) {
      lines.push(
        `Cause "${nh.routing.cause}": building → ${nh.routing.building.covered ? "NHCover" : "private insurer"}; land → ${nh.routing.land.covered ? "NHCover" : "private"}.`,
      );
    }
    if (nh.claim) {
      const topUp =
        nh.claim.privateTopUp > 0
          ? `, NZ$${nh.claim.privateTopUp.toLocaleString("en-NZ")} private top-up`
          : "";
      lines.push(
        `Estimate routing: NZ$${nh.claim.nhcCoveredAmount.toLocaleString("en-NZ")} via NHCover (excess NZ$${nh.claim.excess})${topUp}.`,
      );
    }
  } else {
    lines.push(
      `National Construction Code edition: ${scope.compliance.edition}.`,
    );
    if (scope.compliance.nccReferences.length === 0) {
      lines.push("No NCC references applicable from the annotated materials.");
    }
    for (const ref of scope.compliance.nccReferences) {
      const as = ref.australianStandard ? ` (${ref.australianStandard})` : "";
      lines.push(`- ${ref.topic} — ${ref.volume}${as}`);
    }
  }
  lines.push("");

  lines.push("---");
  lines.push(
    "Generated by RestoreAssist · Indicative scope — confirm against the current standards before submission.",
  );

  return lines.join("\n");
}
