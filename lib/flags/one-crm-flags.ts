/**
 * RA-7660 (One CRM, Unit A1) — listing switches for surfaces that are not
 * ready to sell.
 *
 * - NRPG: the DR-NRPG referral network is the founder's own product and is not
 *   ready. Nothing a customer sees may mention it until he says so.
 * - ServiceM8, MYOB, QuickBooks: none has passed a real sync test, so each is
 *   hidden rather than shown with a badge saying it may not work.
 * - Import Data: the Integrations page button re-pulls through a jobs path
 *   that always fails yet reports success (RA-7663).
 *
 * Every switch defaults OFF. Only an explicit 1 / true / on opens one. Each is
 * a `NEXT_PUBLIC_` variable read as a LITERAL `process.env.NEXT_PUBLIC_*`
 * default parameter, because Next.js inlines only literal reads into the
 * browser bundle; a computed `process.env[name]` would be undefined there and
 * the switch could never be turned on. Same pattern as
 * lib/sketch/underlay-import-flag.ts.
 */

function isOn(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/** DR-NRPG referral network: integration card, connect modal, NIR category field. */
export function isNrpgEnabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_NRPG_ENABLED,
): boolean {
  return isOn(raw);
}

/** ServiceM8 card on the Integrations page. */
export function isServiceM8Enabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_SERVICEM8_ENABLED,
): boolean {
  return isOn(raw);
}

/** MYOB card on the Integrations page and in the Bookkeeping add-on copy. */
export function isMyobEnabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_MYOB_ENABLED,
): boolean {
  return isOn(raw);
}

/** QuickBooks card on the Integrations page and in the Bookkeeping add-on copy. */
export function isQuickBooksEnabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_QUICKBOOKS_ENABLED,
): boolean {
  return isOn(raw);
}

/** "Import Data" button on the Integrations page (RA-7663). */
export function isImportDataEnabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_IMPORT_DATA_ENABLED,
): boolean {
  return isOn(raw);
}
