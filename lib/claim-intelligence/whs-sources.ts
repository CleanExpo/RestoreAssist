/**
 * RA-8276: the single table of Australian WHS sources the Claim Pathway cites.
 *
 * Every row was checked by the lead thread against the primary source on
 * 10/11/2026 (session-handoffs/briefs/ra-8276-whs-sources-verified.md). The
 * values are copied exactly. Do not hand-type a regulation clause anywhere
 * else in the product: add or correct a row here instead.
 *
 * `verified: false` means the clause has not been re-read in its current
 * in-force text. Such a row may be named (issuer and short title) but its
 * clause number must never be shown; see `whsCustomerLabel` / `whsTechLabel`.
 *
 * AS/NZS 1715, 1716 and 1892 are deliberately absent: their text was not
 * read, so no clause content from them may be cited.
 */

export interface WhsSource {
  key: WhsSourceKey;
  title: string;
  issuer: string;
  url: string;
  verified: boolean;
  /** Jurisdiction the source binds in. "AU" = Safe Work Australia model code. */
  jurisdiction: "AU" | "NSW";
}

export type WhsSourceKey =
  | "falls-cop"
  | "nsw-whs-reg-falls"
  | "electrical-cop"
  | "asbestos-cop"
  | "nsw-whs-reg-ppe"
  | "rpe-fit-testing";

export const WHS_SOURCES: Readonly<Record<WhsSourceKey, WhsSource>> = {
  "falls-cop": {
    key: "falls-cop",
    title: "Managing the risk of falls at workplaces (Code of Practice)",
    issuer: "Safe Work Australia",
    url: "https://www.safeworkaustralia.gov.au/doc/model-code-practice-managing-risk-falls-workplaces",
    verified: true,
    jurisdiction: "AU",
  },
  "nsw-whs-reg-falls": {
    key: "nsw-whs-reg-falls",
    title:
      "Work Health and Safety Regulation 2017 (NSW), Part 4.4 Falls, clauses 78-80",
    issuer: "NSW Government",
    url: "https://legislation.nsw.gov.au/view/whole/html/inforce/current/sl-2017-0404",
    verified: true,
    jurisdiction: "NSW",
  },
  "electrical-cop": {
    key: "electrical-cop",
    title: "Managing electrical risks in the workplace (Code of Practice)",
    issuer: "Safe Work Australia",
    url: "https://www.safeworkaustralia.gov.au/doc/model-code-practice-managing-electrical-risks-workplace",
    verified: true,
    jurisdiction: "AU",
  },
  "asbestos-cop": {
    key: "asbestos-cop",
    title:
      "How to manage and control asbestos in the workplace (Code of Practice)",
    issuer: "Safe Work Australia",
    url: "https://www.safeworkaustralia.gov.au/doc/model-code-practice-how-manage-and-control-asbestos-workplace",
    verified: true,
    jurisdiction: "AU",
  },
  "nsw-whs-reg-ppe": {
    key: "nsw-whs-reg-ppe",
    title:
      "Work Health and Safety Regulation 2017 (NSW), clause 44: provision and use of PPE",
    issuer: "NSW Government",
    url: "https://legislation.nsw.gov.au/view/whole/html/inforce/current/sl-2017-0404",
    verified: false,
    jurisdiction: "NSW",
  },
  "rpe-fit-testing": {
    key: "rpe-fit-testing",
    title:
      "Respiratory protective equipment and requirements for fit testing workers",
    issuer: "SafeWork NSW",
    url: "https://www.safework.nsw.gov.au/resource-library/hazardous-chemicals/respiratory-protective-equipment-and-requirements-for-fit-testing-workers",
    verified: true,
    jurisdiction: "AU",
  },
};

/**
 * The title with any part/clause reference removed: everything before the
 * first comma. Every row's clause reference follows a comma.
 */
function titleWithoutClause(title: string): string {
  return title.split(",")[0].trim();
}

/** Customer view: issuer and title. Clause numbers only for verified rows. */
export function whsCustomerLabel(key: WhsSourceKey): string {
  const s = WHS_SOURCES[key];
  return `${s.issuer}: ${s.verified ? s.title : titleWithoutClause(s.title)}`;
}

/** Technician view: same rule, plus a flag where the clause is unconfirmed. */
export function whsTechLabel(key: WhsSourceKey): string {
  const s = WHS_SOURCES[key];
  return s.verified
    ? `${s.issuer}, ${s.title}`
    : `${s.issuer}, ${titleWithoutClause(s.title)} (clause not yet confirmed)`;
}

/**
 * Which sources apply in a state. Safe Work Australia model codes are always
 * named; NSW regulation rows only when the property is in NSW. An unknown
 * state gets the model codes only, never another state's regulation.
 */
export function whsSourceApplies(
  key: WhsSourceKey,
  state: string | null | undefined,
): boolean {
  const j = WHS_SOURCES[key].jurisdiction;
  if (j === "AU") return true;
  return (state ?? "").trim().toUpperCase() === j;
}
