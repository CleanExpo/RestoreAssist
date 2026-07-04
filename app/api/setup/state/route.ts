import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { isValidAbn, normaliseAbn } from "@/lib/abn/checksum";

const PATCHABLE_FIELDS = [
  "legalName",
  "tradingName",
  "abn",
  "acn",
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
type PatchableField = (typeof PATCHABLE_FIELDS)[number];

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
      abn: true,
      acn: true,
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

  return NextResponse.json({
    data: {
      organization: org,
      sections: {
        businessDetails: jobByKind.ABR ?? "PENDING",
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
    select: { id: true, setupCompletedAt: true },
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

  const patch: Record<string, string | null> = {};
  for (const field of PATCHABLE_FIELDS) {
    if (!(field in body)) continue;
    const v = body[field];

    if (v === null || v === undefined || v === "") {
      patch[field] = null;
      continue;
    }
    if (typeof v !== "string") continue; // Silently ignore non-string non-null values — don't 400 on every typo

    if (field === "abn") {
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

    patch[field] = v;
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
