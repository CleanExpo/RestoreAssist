import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { normaliseAbn } from "@/lib/abn/checksum";
import { normalizeNZBN } from "@/lib/validation/nzbn-validator";
import { getGstTreatment } from "@/lib/gst-rules";
import { isSupportedCountry } from "@/lib/locale/organization-locale";
import { validateOrganizationLocaleProfile } from "@/lib/locale/validate-organization-profile";

const localeSelect = {
  country: true,
  timezone: true,
  abn: true,
  acn: true,
  nzbn: true,
} as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(undefined, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const organization = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: localeSelect,
  });
  if (!organization) {
    return apiError(undefined, {
      code: "NOT_FOUND",
      message: "Organization not found",
      status: 404,
    });
  }

  // Fail closed, exactly as the PATCH branch below already does. Coercing an
  // unset or unsupported stored country to "AU" reported a 10% GST treatment
  // for a tenant whose jurisdiction is unknown — the invalid-tax-invoice
  // failure that lib/gst/resolve-user-gst.ts is written to prevent.
  const country = organization.country;
  if (!isSupportedCountry(country)) {
    return apiError(undefined, {
      code: "VALIDATION",
      message:
        "Set your organisation locale (country) before using tax-dependent features",
      status: 422,
    });
  }

  return NextResponse.json({
    data: { ...organization, country, tax: getGstTreatment(country) },
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const current = await prisma.organization.findFirst({
      where: { ownerId: session.user.id },
      select: { id: true, ...localeSelect },
    });
    if (!current) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Organization not found",
        status: 404,
      });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const country = body.country === "NZ" ? "NZ" : body.country === "AU" ? "AU" : null;
    const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";
    const abn =
      country === "AU" && typeof body.abn === "string"
        ? normaliseAbn(body.abn) || null
        : null;
    const nzbn =
      country === "NZ" && typeof body.nzbn === "string"
        ? normalizeNZBN(body.nzbn) || null
        : null;
    const acn =
      country === "AU" && typeof body.acn === "string"
        ? body.acn.replace(/\D/g, "") || null
        : null;

    const validation = validateOrganizationLocaleProfile({
      country,
      timezone,
      abn,
      nzbn,
    });
    if (!validation.valid) {
      return apiError(request, {
        code: "VALIDATION",
        message: validation.error,
        status: 400,
      });
    }
    const validCountry = validation.country;
    if (acn && acn.length !== 9) {
      return apiError(request, {
        code: "VALIDATION",
        message: "ACN must contain 9 digits",
        status: 400,
      });
    }

    const organization = await prisma.organization.update({
      where: { id: current.id },
      data: { country: validCountry, timezone, abn, acn, nzbn },
      select: localeSelect,
    });
    return NextResponse.json({
      data: { ...organization, tax: getGstTreatment(validCountry) },
    });
  } catch (error) {
    return fromException(request, error, { stage: "organization/locale:patch" });
  }
}
