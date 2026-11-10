import { prisma } from "@/lib/prisma";
import { getGstTreatment, type GstTreatment } from "@/lib/gst-rules";

/**
 * Resolve the GST treatment for an inspection from the owning Organization's
 * country (Inspection -> user -> organization.country). Defaults to AU (10% /
 * AUD) when the org or country is absent.
 *
 * RA-6683 — the per-domain assessment estimators (water/storm/fire-smoke/mould/
 * biohazard/hvac/australian-compliance) hardcoded `GST_RATE = 0.1` and
 * `currency: "AUD"`, so NZ orgs were billed 10% AUD instead of 15% NZD. This
 * routes them through the GST single-source-of-truth.
 */
export async function gstForInspection(
  inspectionId: string,
): Promise<GstTreatment> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      user: { select: { organization: { select: { country: true } } } },
    },
  });
  const country =
    inspection?.user?.organization?.country === "NZ" ? "NZ" : "AU";
  return getGstTreatment(country);
}

/**
 * RA-8281 — the GST treatment a stored estimate was actually priced at.
 *
 * Estimate lines are persisted with their GST dollars but not the rate, and
 * an organisation's country can change after generation. A PDF that labels
 * stored 10% dollars as "15% NZD" misstates the money, so the label must come
 * from the stored lines themselves:
 *   - every priced line carries the same AU (10%) or NZ (15%) rate -> that
 *     treatment (rate and currency);
 *   - no priced line (nothing to label) -> `fallback` (the org's country);
 *   - lines disagree, or match neither rate -> null: the caller must not
 *     print a GST rate or total for them.
 */
export function gstTreatmentForStoredLines(
  lines: ReadonlyArray<{
    lineTotalExGst: number | null;
    lineTotalIncGst: number | null;
  }>,
  fallback: GstTreatment,
): GstTreatment | null {
  const treatments = [getGstTreatment("AU"), getGstTreatment("NZ")];
  let found: GstTreatment | null = null;
  for (const l of lines) {
    const ex = l.lineTotalExGst;
    const inc = l.lineTotalIncGst;
    if (ex === null || inc === null || !(ex > 0)) continue;
    const gst = inc - ex;
    // Lines round GST to cents, so allow one cent of rounding.
    const match = treatments.find((t) => Math.abs(gst - ex * t.rate) <= 0.011);
    if (!match) return null;
    if (found && found.country !== match.country) return null;
    found = match;
  }
  return found ?? fallback;
}
