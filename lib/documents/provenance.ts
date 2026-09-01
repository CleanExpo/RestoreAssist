/**
 * The provenance block a document renders beneath a regulatory statement.
 *
 * Spec 10 asks for three things, and each exists because a document that states
 * a rule without them is stating it more confidently than it was checked:
 *
 *   1. Every regulatory statement shows its INSTRUMENT and the date it was
 *      VERIFIED. A rule with no source on the page is indistinguishable from one
 *      somebody typed.
 *   2. A caution travels with it: this is guidance, not legal advice, and the
 *      reader should verify against their own regulator.
 *   3. A NEW ZEALAND JOB NEVER SILENTLY RECEIVES AUSTRALIAN LAW. Where only an
 *      Australian entry exists, the document says so in as many words.
 *
 * The third is not hypothetical here. The only citation in the catalogue today
 * is chemicals.antimicrobial-registration.au, which is Australian and has no New
 * Zealand counterpart in the registry: New Zealand regulates the same products
 * through the EPA under HSNO, which has not been verified and so has not been
 * seeded. On a New Zealand job this block therefore says the cited rule is
 * Australian and does not govern the job -- rather than printing an APVMA duty
 * beside a Christchurch address and letting it read as local law.
 *
 * Nothing here paraphrases an instrument. `requirement` is carried through from
 * the registry, which holds it in our own words for the copyright reasons set
 * out in lib/compliance/regulatory-registry/types.ts.
 */
import {
  regulation,
  type RegulatoryEntry,
  type RegulatoryJurisdiction,
} from "@/lib/compliance/regulatory-registry";
import {
  citedRegulations,
  type AuthorityTemplateSpec,
} from "./authority-catalogue";

/** Jurisdictions that are Australian for the purpose of "is this our law". */
const AUSTRALIAN: ReadonlySet<string> = new Set([
  "AU",
  "NSW",
  "VIC",
  "QLD",
  "WA",
  "SA",
  "TAS",
  "ACT",
  "NT",
]);

export function isAustralianJurisdiction(j: string): boolean {
  return AUSTRALIAN.has(j);
}

export interface ProvenanceEntry {
  id: string;
  instrument: string;
  provision?: string;
  requirement: string;
  sourceUrl: string;
  verifiedAt: string;
  verification: string;
  jurisdiction: RegulatoryJurisdiction;
  /**
   * True when the entry governs a different country from the job.
   *
   * Not a formatting hint. When this is set the document must say the rule does
   * not govern the job, because the alternative -- printing it plainly -- is a
   * product telling a technician the wrong law with total confidence.
   */
  foreignToJob: boolean;
}

export interface ProvenanceBlock {
  heading: string;
  entries: ProvenanceEntry[];
  /** Statements the document must print. Order is the order to render. */
  notices: string[];
  /** True when nothing was cited: the caller renders no block at all. */
  empty: boolean;
}

const NOT_LEGAL_ADVICE =
  "This is guidance drawn from a sourced regulatory register, not legal advice. Verify the current requirement with your regulator before relying on it.";

function foreignTo(entry: RegulatoryEntry, job: RegulatoryJurisdiction): boolean {
  const entryIsAu = isAustralianJurisdiction(entry.jurisdiction);
  const jobIsAu = isAustralianJurisdiction(job);
  return entryIsAu !== jobIsAu;
}

/**
 * Build the block for a template on a job in `jobJurisdiction`.
 *
 * A template citing nothing returns `empty: true` and no notices: a document
 * that engages no registry duty must not grow a regulatory footer, because a
 * caution printed on everything is a caution nobody reads.
 */
export function buildProvenanceBlock(
  spec: AuthorityTemplateSpec,
  jobJurisdiction: RegulatoryJurisdiction,
): ProvenanceBlock {
  const cited = citedRegulations(spec);
  if (cited.length === 0) {
    return { heading: "", entries: [], notices: [], empty: true };
  }

  const entries: ProvenanceEntry[] = cited.map((c) => {
    const entry = regulation(c.id);
    return {
      id: c.id,
      instrument: c.instrument,
      provision: c.provision,
      requirement: c.requirement,
      sourceUrl: c.sourceUrl,
      verifiedAt: c.verifiedAt,
      verification: c.verification,
      jurisdiction: entry.jurisdiction,
      foreignToJob: foreignTo(entry, jobJurisdiction),
    };
  });

  const notices: string[] = [];

  // Requirement 3, and it goes FIRST: a reader who stops after one line must
  // still have been told the rule is not theirs.
  const foreign = entries.filter((e) => e.foreignToJob);
  if (foreign.length > 0) {
    const jobCountry = isAustralianJurisdiction(jobJurisdiction)
      ? "Australian"
      : "New Zealand";
    const otherCountry = jobCountry === "Australian" ? "New Zealand" : "Australian";
    notices.push(
      `This job is ${jobCountry}. ${foreign.length === 1 ? "The requirement" : "Some requirements"} shown below ${foreign.length === 1 ? "is" : "are"} ${otherCountry} and ${foreign.length === 1 ? "does" : "do"} not govern this job. RestoreAssist holds no verified ${jobCountry} equivalent, so treat this as background only and confirm the ${jobCountry} position with your regulator.`,
    );
  }

  notices.push(NOT_LEGAL_ADVICE);

  // Verification level, disclosed rather than hidden. Spec 11 contemplated an
  // allow-list for secondary-quoting-primary entries on customer-facing
  // surfaces; every entry in the registry is currently that, so an allow-list
  // would list all of them and tell the reader nothing. Printing the level on
  // the document is strictly more informative than a hidden exemption.
  if (entries.some((e) => e.verification === "secondary-quoting-primary")) {
    notices.push(
      "Marked sources were confirmed against publications quoting the regulator rather than the regulator's own page, which was unreachable when the entry was checked.",
    );
  }

  return {
    heading: "Regulatory basis",
    entries,
    notices,
    empty: false,
  };
}

/** One line per fact, for a renderer that lays out plain text. */
export function provenanceLines(block: ProvenanceBlock): string[] {
  if (block.empty) return [];
  const lines: string[] = [block.heading];
  for (const e of block.entries) {
    lines.push(
      `${e.instrument}${e.provision ? `, ${e.provision}` : ""} (${e.jurisdiction})`,
    );
    lines.push(e.requirement);
    lines.push(`Source: ${e.sourceUrl}`);
    lines.push(`Checked: ${e.verifiedAt}`);
  }
  lines.push(...block.notices);
  return lines;
}
