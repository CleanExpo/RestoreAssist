import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { isValidAbn, normaliseAbn } from "@/lib/abn/checksum";
import { normalizeNZBN, validateNZBN } from "@/lib/validation/nzbn-validator";
import {
  DEFAULT_ORGANIZATION_TIMEZONE,
  isSupportedCountry,
  isTimezoneForCountry,
} from "@/lib/locale/organization-locale";
import type { Country } from "@/lib/gst-rules";

const PATCHABLE_FIELDS = [
  "legalName",
  "tradingName",
  "country",
  "abn",
  "nzbn",
  "acn",
  "timezone",
  "state",
  "address",
  "phone",
  "email",
  "website",
  "logoUrl",
  "primaryColor",
  "accentColor",
  "aboutCopy",
] as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(undefined, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: {
      id: true,
      legalName: true,
      tradingName: true,
      country: true,
      abn: true,
      nzbn: true,
      acn: true,
      timezone: true,
      state: true,
      address: true,
      phone: true,
      email: true,
      website: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      aboutCopy: true,
      tradingStatus: true,
      setupStartedAt: true,
      setupCompletedAt: true,
      setupMode: true,
      pricingConfig: true,
      hydrationJobs: {
        select: {
          kind: true,
          status: true,
          errorMessage: true,
          completedAt: true,
        },
      },
    },
  });

  if (!org) {
    return apiError(undefined, {
      code: "NOT_FOUND",
      message: "No organization for this user",
      status: 404,
    });
  }

  // Derive per-section status from hydration jobs (default PENDING if no job row)
  const jobByKind = Object.fromEntries(
    org.hydrationJobs.map((j) => [j.kind, j.status]),
  );
  const nzBusinessReady = Boolean(
    org.country === "NZ" &&
      org.legalName &&
      org.nzbn &&
      org.state &&
      org.timezone,
  );

  return NextResponse.json({
    data: {
      organization: org,
      sections: {
        businessDetails: jobByKind.ABR ?? (nzBusinessReady ? "READY" : "PENDING"),
        branding: jobByKind.WEBSITE ?? "PENDING",
        pricing: jobByKind.PRICING ?? "PENDING",
      },
    },
  });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(undefined, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError(undefined, {
      code: "VALIDATION",
      message: "Invalid JSON body",
      status: 400,
    });
  }

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, country: true, setupCompletedAt: true },
  });
  if (!org) {
    return apiError(undefined, {
      code: "NOT_FOUND",
      message: "No organization for this user",
      status: 404,
    });
  }
  if (org.setupCompletedAt) {
    return apiError(undefined, {
      code: "CONFLICT",
      message: "Setup already complete; edit in Settings instead",
      status: 409,
    });
  }

  let effectiveCountry: Country;
  if ("country" in body) {
    const requestedCountry =
      typeof body.country === "string"
        ? body.country.trim().toUpperCase()
        : body.country;
    if (!isSupportedCountry(requestedCountry)) {
      return apiError(undefined, {
        code: "VALIDATION",
        message: "Country must be AU or NZ",
        status: 400,
      });
    }
    effectiveCountry = requestedCountry;
  } else if (isSupportedCountry(org.country)) {
    effectiveCountry = org.country;
  } else {
    return apiError(undefined, {
      code: "VALIDATION",
      message: "Organization country is not supported",
      status: 400,
    });
  }

  const patch: Record<string, string | null> = {};
  for (const field of PATCHABLE_FIELDS) {
    if (!(field in body)) continue;
    const v = body[field];

    if (v === null || v === undefined || v === "") {
      if (field === "country" || field === "timezone") {
        return apiError(undefined, {
          code: "VALIDATION",
          message: `${field === "country" ? "Country" : "Timezone"} is required`,
          status: 400,
        });
      }
      patch[field] = null;
      continue;
    }
    if (typeof v !== "string") continue; // Silently ignore non-string non-null values — don't 400 on every typo

    if (field === "country") {
      patch.country = effectiveCountry;
      continue;
    }

    if (field === "abn") {
      if (effectiveCountry !== "AU") {
        return apiError(undefined, {
          code: "VALIDATION",
          message: "ABN is only valid for Australian organizations",
          status: 400,
        });
      }
      // AU compliance: ABN is an 11-digit checksummed number — same validation
      // as the ABR-lookup success path (POST /api/setup/hydrate).
      const normalised = normaliseAbn(v);
      if (!normalised || !isValidAbn(normalised)) {
        return apiError(undefined, {
          code: "VALIDATION",
          message: "Invalid ABN",
          status: 400,
        });
      }
      patch.abn = normalised;
      continue;
    }

    if (field === "nzbn") {
      if (effectiveCountry !== "NZ") {
        return apiError(undefined, {
          code: "VALIDATION",
          message: "NZBN is only valid for New Zealand organizations",
          status: 400,
        });
      }
      const normalized = normalizeNZBN(v);
      if (!validateNZBN(normalized).valid) {
        return apiError(undefined, {
          code: "VALIDATION",
          message: "Invalid NZBN",
          status: 400,
        });
      }
      patch.nzbn = normalized;
      continue;
    }

    if (field === "timezone") {
      if (!isTimezoneForCountry(effectiveCountry, v)) {
        return apiError(undefined, {
          code: "VALIDATION",
          message: `Timezone is not valid for ${effectiveCountry}`,
          status: 400,
        });
      }
      patch.timezone = v;
      continue;
    }

    patch[field] = v;
  }

  if ("country" in body && !("timezone" in body)) {
    patch.timezone = DEFAULT_ORGANIZATION_TIMEZONE[effectiveCountry];
  }

  if (Object.keys(patch).length === 0) {
    return apiError(undefined, {
      code: "VALIDATION",
      message: "No patchable fields in body",
      status: 400,
    });
  }

  await prisma.organization.update({ where: { id: org.id }, data: patch });
  return NextResponse.json({ data: { updated: Object.keys(patch) } });
}
