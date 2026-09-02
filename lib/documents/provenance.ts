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
  familyLabel,
  resolveFamily,
  type AuthorityTemplateSpec,
  type RegulationFamily,
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
  /**
   * Families that named a real rule but resolved to no entry FOR THIS JOB.
   *
   * Kept separate from `entries` because the document has to say something it
   * cannot say by printing a requirement: that a duty was looked for and no
   * verified entry was held. Dropping these silently is how a Victorian job
   * ends up with no asbestos-register line and no indication one was sought.
   */
  unresolved: string[];
}

const NOT_LEGAL_ADVICE =
  "This is guidance drawn from a sourced regulatory register, not legal advice. Verify the current requirement with your regulator before relying on it.";

const SECONDARY_SOURCE =
  "Marked sources were confirmed against publications quoting the regulator rather than the regulator's own page, which was unreachable when the entry was checked.";

/**
 * Is this entry's law foreign to the job?
 *
 * An unrecorded jurisdiction is NOT "foreign": we do not know, and claiming the
 * rule is foreign would be as unfounded as claiming it applies. The unknown
 * case gets its own notice instead, which says exactly that.
 */
function foreignTo(
  entry: RegulatoryEntry,
  job: RegulatoryJurisdiction | null,
): boolean {
  if (job === null) return false;
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
  /**
   * null when no source recorded the job's country.
   *
   * Deliberately not defaulted to "AU". Report has no country field,
   * Inspection.propertyCountry and Organization.country both default to "AU",
   * and postcode cannot separate the two countries -- so assuming Australia is
   * how a New Zealand job silently receives Australian law. Unknown is stated,
   * not guessed. See lib/documents/job-jurisdiction.ts.
   */
  jobJurisdiction: RegulatoryJurisdiction | null,
  options: { mayBeSchemaDefault?: boolean } = {},
): ProvenanceBlock {
  const cited = citedRegulations(spec);
  const families: RegulationFamily[] = spec.citesRegulationFamilies ?? [];

  if (cited.length === 0 && families.length === 0) {
    return { heading: "", entries: [], notices: [], empty: true, unresolved: [] };
  }

  const toProvenance = (entry: RegulatoryEntry): ProvenanceEntry => ({
    id: entry.id,
    instrument: entry.instrument,
    provision: entry.provision,
    requirement: entry.requirement,
    sourceUrl: entry.sourceUrl,
    verifiedAt: entry.verifiedAt,
    verification: entry.verification,
    jurisdiction: entry.jurisdiction,
    foreignToJob: foreignTo(entry, jobJurisdiction),
  });

  const entries: ProvenanceEntry[] = cited.map((c) => toProvenance(regulation(c.id)));

  // Families resolve to the job's country. By construction one never resolves
  // to a foreign entry -- `resolveFamily` gives New Zealand no Australian
  // fallback -- so every foreign entry in this block came from an exact id.
  const unresolved: string[] = [];
  for (const family of families) {
    const entry = resolveFamily(family, jobJurisdiction);
    if (!entry) {
      unresolved.push(familyLabel(family));
      continue;
    }
    // A rule cited both ways renders once. The duplicate would otherwise read
    // as two independent sources saying the same thing.
    if (entries.some((e) => e.id === entry.id)) continue;
    entries.push(toProvenance(entry));
  }

  const notices: string[] = [];

  // No recorded country. Say so rather than assuming: the assumption that
  // would be made here is "Australian", and every entry cited today is
  // Australian, so the assumption would always look right and sometimes be
  // catastrophically wrong.
  if (jobJurisdiction === null) {
    notices.push(
      entries.length > 0
        ? "The country this job sits in was not recorded, so RestoreAssist cannot confirm the requirement below applies. Confirm the position for the job's jurisdiction before relying on it."
        : "The country this job sits in was not recorded, so RestoreAssist could not select the requirements that apply. Nothing below states the rule for this job. Record the country and reissue this document.",
    );
    // Naming them matters: a reader can then ask for the missing rule by name
    // instead of reading the absence as "no such duty".
    if (unresolved.length > 0) {
      notices.push(
        `Not selected, because the job's country is unrecorded: ${unresolved.join(", ")}.`,
      );
    }
    notices.push(NOT_LEGAL_ADVICE);
    if (entries.some((e) => e.verification === "secondary-quoting-primary")) {
      notices.push(SECONDARY_SOURCE);
    }
    return { heading: "Regulatory basis", entries, notices, empty: false, unresolved };
  }

  // Requirement 3, and it goes FIRST: a reader who stops after one line must
  // still have been told the rule is not theirs.
  const foreign = entries.filter((e) => e.foreignToJob);
  if (foreign.length > 0) {
    const jobCountry = isAustralianJurisdiction(jobJurisdiction)
      ? "Australian"
      : "New Zealand";
    const otherCountry = jobCountry === "Australian" ? "New Zealand" : "Australian";
    // The instruments are NAMED. The unnamed version of this sentence was true
    // when a block could hold only foreign entries; once a family can resolve a
    // local rule into the same block, "RestoreAssist holds no verified
    // Australian equivalent" sits directly beneath an Australian entry and the
    // reader cannot tell which line it disclaims. Naming them keeps it true.
    const named = foreign.map((e) => e.instrument).join("; ");
    notices.push(
      `This job is ${jobCountry}. ${foreign.length === 1 ? "The following requirement is" : "The following requirements are"} ${otherCountry} and ${foreign.length === 1 ? "does" : "do"} not govern this job: ${named}. RestoreAssist holds no verified ${jobCountry} equivalent for ${foreign.length === 1 ? "it" : "them"}, so treat ${foreign.length === 1 ? "it" : "them"} as background only and confirm the ${jobCountry} position with your regulator.`,
    );
  }

  // A stored "AU" may be the column default rather than a confirmation. Say so
  // where it could change the answer -- that is, where an Australian rule is
  // being shown on the strength of an unconfirmed Australian job.
  if (options.mayBeSchemaDefault && foreign.length === 0) {
    notices.push(
      "The job's country was taken from a field that defaults to Australia, so it may not have been confirmed for this job. If this is a New Zealand job, the requirement below does not govern it.",
    );
  }

  // A duty was looked for and no verified entry was held for this country.
  // Stated as an absence of a CHECKED ENTRY, never as a finding that no duty
  // exists: a Victorian asbestos register duty is not absent because this
  // registry has not yet seeded it, and a document that implied otherwise would
  // be worse than one that said nothing.
  if (unresolved.length > 0) {
    const jobCountryName = isAustralianJurisdiction(jobJurisdiction)
      ? "Australian"
      : "New Zealand";
    notices.push(
      `RestoreAssist holds no verified ${jobCountryName} entry for: ${unresolved.join(", ")}. That is an absence of a checked entry, not a finding that no duty applies. Confirm the position with your regulator before relying on this document.`,
    );
  }

  notices.push(NOT_LEGAL_ADVICE);

  // Verification level, disclosed rather than hidden. Spec 11 contemplated an
  // allow-list for secondary-quoting-primary entries on customer-facing
  // surfaces; every entry in the registry is currently that, so an allow-list
  // would list all of them and tell the reader nothing. Printing the level on
  // the document is strictly more informative than a hidden exemption.
  if (entries.some((e) => e.verification === "secondary-quoting-primary")) {
    notices.push(SECONDARY_SOURCE);
  }

  return {
    heading: "Regulatory basis",
    entries,
    notices,
    empty: false,
    unresolved,
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
