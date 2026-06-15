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
