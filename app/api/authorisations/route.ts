import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { invalidateAuthorisationCache } from "@/lib/authorisations/most-recent";
import { apiError, fromException } from "@/lib/api-errors";

// P1 #19 step 1 of 2 (CLAUDE.md rule #16 — two-step column rename).
// Mirrors prisma/schema.prisma `enum AuthorisationLicenceClass`.
const AUTHORISATION_LICENCE_CLASSES = [
  "OPEN",
  "PROVISIONAL",
  "RESTRICTED",
  "LEARNER",
  "PROBATIONARY",
  "HEAVY_VEHICLE",
  "MOTORCYCLE",
  "OTHER",
] as const;
type AuthorisationLicenceClass = (typeof AUTHORISATION_LICENCE_CLASSES)[number];

interface PostBody {
  inspectionId?: string;
  subjectLicenceNumber?: string;
  whsCardNumber?: string;
  subjectLicenceState?: string;
  subjectLicenceClass?: string;
  // Optional structured taxonomy. When supplied, written to the new
  // `subjectLicenceClassEnum` column; legacy free-text col still set
  // from `subjectLicenceClass`.
  subjectLicenceClassEnum?: AuthorisationLicenceClass;
  publicLiabilityInsurer?: string;
  publicLiabilityPolicyNumber?: string;
  publicLiabilityCoverAmount?: number;
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid request body",
      status: 400,
    });
  }

  if (
    !body.subjectLicenceNumber ||
    typeof body.subjectLicenceNumber !== "string"
  ) {
    return apiError(req, {
      code: "VALIDATION",
      message: "subjectLicenceNumber is required",
      status: 400,
    });
  }
  if (!body.whsCardNumber || typeof body.whsCardNumber !== "string") {
    return apiError(req, {
      code: "VALIDATION",
      message: "whsCardNumber is required",
      status: 400,
    });
  }
  if (
    body.subjectLicenceClassEnum !== undefined &&
    !AUTHORISATION_LICENCE_CLASSES.includes(
      body.subjectLicenceClassEnum as AuthorisationLicenceClass,
    )
  ) {
    return apiError(req, {
      code: "VALIDATION",
      message: "subjectLicenceClassEnum is not a valid licence class",
      status: 400,
    });
  }

  try {
    const userWithOrg = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        organization: {
          select: { name: true, legalName: true, tradingName: true },
        },
      },
    });

    if (!userWithOrg?.organization) {
      return apiError(req, {
        code: "VALIDATION",
        message: "User is not attached to an organization",
        status: 400,
      });
    }

    const subjectCompanyName =
      userWithOrg.organization.legalName ??
      userWithOrg.organization.tradingName ??
      userWithOrg.organization.name;

    const created = await prisma.authorisation.create({
      data: {
        inspectionId: body.inspectionId ?? null,
        userId: session.user.id,
        subjectUserId: session.user.id,
        subjectCompanyName,
        subjectLicenceNumber: body.subjectLicenceNumber,
        subjectLicenceState: body.subjectLicenceState ?? null,
        subjectLicenceClass: body.subjectLicenceClass ?? null,
        // P1 #19 step 1 of 2: dual-write the enum column when caller supplies it.
        // NULL for legacy callers; backfill PR populates from the free-text col.
        subjectLicenceClassEnum: body.subjectLicenceClassEnum ?? null,
        whsCardNumber: body.whsCardNumber,
        publicLiabilityInsurer: body.publicLiabilityInsurer ?? null,
        publicLiabilityPolicyNumber: body.publicLiabilityPolicyNumber ?? null,
        publicLiabilityCoverAmount: body.publicLiabilityCoverAmount ?? null,
        verifiedMethod: "SELF_DECLARED",
        status: "VALID",
      },
      select: { id: true },
    });

    invalidateAuthorisationCache(session.user.id);

    return NextResponse.json({ ok: true, authorisationId: created.id });
  } catch (error) {
    return fromException(req, error, { stage: "create" });
  }
}
