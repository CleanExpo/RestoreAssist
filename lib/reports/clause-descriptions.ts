/**
 * Clause description lookup for standards cited in RestoreAssist PDF reports.
 * Source: scripts/data/standards-corpus.json + IICRC S500:2021 Australian edition.
 *
 * IICRC references cite edition and section: `S500:2021 §7.1` — never abbreviate or omit version.
 */

import { getS500Section } from "@/lib/standards/s500-sections";

/** Matches an S500:2021 clause ref and captures the bare section number. */
const S500_CLAUSE = /^S500:2021\s+§?\s*([\d.]+)$/;

export const CLAUSE_DESCRIPTIONS: Record<string, string> = {
  // IICRC S500:2021 (Australian edition)
  "S500:2021 §3.1": "Scope and application of the standard",
  "S500:2021 §3.2": "Definitions of key restoration terms",
  "S500:2021 §8": "General health and safety obligations for restorers",
  "S500:2021 §8.12": "Electrical hazard management during water intrusion",
  "S500:2021 §7.5": "Mould and microbial risk during water damage response",
  "S500:2021 §10.4": "Water category classification framework",
  "S500:2021 §10.4.1":
    "Category of water — Category 1/2/3 (clean/grey/black) characteristics and classification",
  "S500:2021 §12.5": "Drying system design principles",
  "S500:2021 §12.3.6": "Porous material remediation requirements by category",

  // AS/NZS 4849.1:2019 — Moisture measurement
  "AS/NZS 4849.1:2019 §4.2": "Moisture content thresholds for timber framing",
  "AS/NZS 4849.1:2019 §5.1":
    "Measurement methods for building material moisture",
  "AS/NZS 4849.1:2019 §6.3":
    "Moisture limits for plasterboard and sheet linings",
  "AS/NZS 4849.1:2019 §7.1": "Documentation requirements for moisture mapping",

  // AS/NZS 4360:2004 — Risk management
  "AS/NZS 4360:2004 §4.1": "Risk management process overview",
  "AS/NZS 4360:2004 §4.3": "Risk assessment framework",
  "AS/NZS 4360:2004 §5.3": "Risk analysis and likelihood-consequence matrix",
  "AS/NZS 4360:2004 §6.1": "Risk treatment options and selection criteria",

  // AS/NZS 3000:2018 — Electrical wiring
  "AS/NZS 3000:2018 §1.6": "Electrical installations — scope in wet locations",
  "AS/NZS 3000:2018 §4.4": "Protection against electric shock in wet areas",
  "AS/NZS 3000:2018 §7.3":
    "Inspection and testing of electrical installations post-flood",

  // NZBS E2:2004 — External moisture
  "NZBS E2:2004 §3.1":
    "External moisture — design requirements for cladding systems",
  "NZBS E2:2004 §4.2": "Acceptable solutions for external wall drainage",
  "NZBS E2:2004 §6.1": "Verification method for cladding system performance",
  // Bare NZBS E2 (no clause suffix)
  "NZBS E2": "External moisture protection (NZBS E2:2004)",

  // NZBS E3:2004 — Internal moisture
  "NZBS E3:2004 §2.1": "Internal moisture sources and condensation control",
  "NZBS E3:2004 §3.2": "Ventilation requirements to manage internal humidity",
  // Bare NZBS E3 (no clause suffix)
  "NZBS E3": "Internal moisture protection (NZBS E3:2004)",

  // NADCA ACR 2021 — HVAC
  "NADCA ACR:2021 §5.1":
    "HVAC system contamination assessment following water damage",
  "NADCA ACR:2021 §7.3": "HVAC duct cleaning procedures and verification",
};

/**
 * Return a human-readable description for a standards clause reference.
 * Normalises leading/trailing whitespace before lookup.
 *
 * Resolution order:
 *   1. The hand-authored CLAUSE_DESCRIPTIONS table (richest, takes precedence).
 *   2. For an S500:2021 ref not in the table, the verified S500 section index
 *      (titles only — copyright-safe), so valid citations recall their real
 *      title instead of the placeholder. This is what wires the report citation
 *      path to the single verified source of truth.
 *   3. "Standards reference" for anything still unrecognised.
 */
export function describeClause(clauseRef: string): string {
  const normalised = clauseRef.trim();

  const explicit = CLAUSE_DESCRIPTIONS[normalised];
  if (explicit !== undefined) return explicit;

  const s500 = S500_CLAUSE.exec(normalised);
  if (s500) {
    const section = getS500Section(s500[1]);
    if (section) return section.title;
  }

  return "Standards reference";
}
