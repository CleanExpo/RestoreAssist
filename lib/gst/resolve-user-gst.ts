import "server-only";

import { prisma } from "@/lib/prisma";
import { getGstTreatment, type GstTreatment } from "@/lib/gst-rules";
import { isSupportedCountry } from "@/lib/locale/organization-locale";

/**
 * Discriminator carried on {@link OrganizationLocaleRequiredError}.
 *
 * `lib/api-errors.ts` matches on this string rather than importing the class,
 * for the same reason it duck-types Prisma's "P2025"/"P2002": that module must
 * stay usable in edge runtimes, and this one is `server-only`.
 */
export const ORGANIZATION_LOCALE_REQUIRED_CODE = "ORGANIZATION_LOCALE_REQUIRED";

/**
 * A tenant reached financial work before setting their organisation locale.
 *
 * This is the caller's state to fix, not a server fault, so it must surface as
 * a 4xx. Thrown as a bare `Error` it reached `fromException` unrecognised and
 * became a 500 INTERNAL — which also paged the observability feed that
 * `apiError` reserves for genuine 5xx.
 *
 * Extends `Error`, so the existing `catch` blocks in all six calling routes
 * keep working unchanged.
 */
export class OrganizationLocaleRequiredError extends Error {
  readonly code = ORGANIZATION_LOCALE_REQUIRED_CODE;

  constructor() {
    super("Organization locale is required before financial work");
    this.name = "OrganizationLocaleRequiredError";
  }
}

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
    throw new OrganizationLocaleRequiredError();
  }
  return getGstTreatment(country);
}
