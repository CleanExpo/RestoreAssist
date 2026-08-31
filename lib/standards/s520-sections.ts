/**
 * ANSI/IICRC S520-2024 (4th ed.) section index — verified source of truth for
 * S520 section→title recall (mirrors lib/standards/s500-sections.ts).
 *
 * PROVENANCE — READ THIS BEFORE RELYING ON A SECTION NUMBER HERE.
 * This previously claimed the values were "transcribed from the owner's LICENSED
 * S520:2024 standard as ingested into the RA-7000 authoritative RAG corpus
 * (verified against the ingested chapter headings 2026-07-11)". That claim is
 * CIRCULAR and cannot be checked by anyone: the corpus it cites as the authority
 * is `IicrcChunk`, which has zero rows on production, and the corpus's own
 * provenance is the open question. An audit of the accessible Drive on 2026-08-31
 * found no S520 document of any edition — only a superseded S540:2017 set and a  standards-cite-ignore (naming a superseded edition on purpose)
 * third-party retyping of the S500 definitions clause.
 *
 * So: these numbers are ATTESTED BY THE OWNER, not independently verifiable from
 * anything in this repository or reachable from it. They are used because they
 * corrected demonstrably wrong values (see below) and because failing loudly on an
 * unknown section is better than fabricating one — not because a second party has
 * checked them. Re-verify against the licensed S520:2024 before treating any
 * number here as authoritative, and replace this note with what was actually
 * checked, by whom, and when. See docs/findings/iicrc-standards-provenance.md.
 *
 * This replaces ad-hoc per-file S520 section
 * hardcoding, several instances of which were WRONG — in particular the
 * worker-protection PPE citation was recorded as "§14", but S520:2024 has no
 * §14; worker protection is §5 "Safety and Health", and post-remediation
 * clearance is §12 "Post Remediation Verification" (see RA S520-citation finding).
 *
 * COPYRIGHT: this holds only section NUMBERS and short TITLES (facts / a table
 * of contents). It must NEVER contain verbatim standard prose — that lives only
 * in the owner's private store.
 */

export const S520_SECTIONS: Readonly<Record<string, string>> = {
  "1": "Principles of Mold Remediation",
  "2": "Mold Cleaners, Antimicrobial Chemicals, and Coatings as Remediation Tools",
  "3": "Building and Material Science",
  "4": "Remediator Qualifications",
  "5": "Safety and Health",
  "6": "Administrative Procedures, Documentation and Risk Management",
  "7": "Inspection and Preliminary Determination",
  "8": "Limitations, Complexities, Complications, and Conflicts",
  "9": "Structural Remediation",
  "10": "HVAC Remediation",
  "11": "Contents Remediation",
  "12": "Post Remediation Verification",
  "13": "Indoor Environmental Professional",
} as const;

export interface StandardSection {
  /** Canonical in-product citation, e.g. "S520:2024 §5". */
  citationKey: string;
  /** Section title, e.g. "Safety and Health". */
  title: string;
}

/**
 * Recall a verified S520 section by number.
 * `getS520Section("5")` → { citationKey: "S520:2024 §5", title: "Safety and Health" }.
 * Returns null for an unknown section (caller handles — never fabricate a citation).
 */
export function getS520Section(section: string): StandardSection | null {
  const key = section.trim().replace(/^§\s*/, "").trim();
  const title = S520_SECTIONS[key];
  if (title === undefined) return null;
  return { citationKey: `S520:2024 §${key}`, title };
}
