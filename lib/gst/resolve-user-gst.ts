import "server-only";

import { prisma } from "@/lib/prisma";
import { getGstTreatment, type GstTreatment } from "@/lib/gst-rules";
import { isSupportedCountry } from "@/lib/locale/organization-locale";

/**
 * Resolve the authenticated user's authoritative tenant tax treatment.
 * Financial writes fail closed when the organisation locale is missing or
 * unsupported; silently treating an NZ tenant as AU creates an invalid tax
 * invoice.
 */
export async function resolveUserGstTreatment(
  userId: string,
): Promise<GstTreatment> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organization: { select: { country: true } } },
  });
  const country = user?.organization?.country;
  if (!isSupportedCountry(country)) {
    throw new Error("Organization locale is required before financial work");
  }
  return getGstTreatment(country);
}
