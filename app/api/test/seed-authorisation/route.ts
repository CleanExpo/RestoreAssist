/**
 * TEST-ONLY route — inserts a row into Authorisation for the currently
 * signed-in test user. Used by the technician-dashboard banner-dismiss
 * spec, which needs an existing Authorisation row to verify the banner
 * disappears after one is added.
 *
 * HARD GUARD — returns 404 unless ALLOW_TEST_HELPERS === "true".
 *
 * Body: { subjectLicenceNumber: string, whsCardNumber: string, ... }
 * Returns: { authorisationId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

// P1 #19 step 1 of 2: enum mirror of prisma `enum AuthorisationLicenceClass`.
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

interface SeedAuthBody {
  subjectLicenceNumber?: string;
  whsCardNumber?: string;
  subjectLicenceState?: string;
  subjectLicenceClass?: string;
  subjectLicenceClassEnum?: AuthorisationLicenceClass;
  publicLiabilityInsurer?: string;
  publicLiabilityPolicyNumber?: string;
  publicLiabilityCoverAmount?: number;
}

export async function POST(req: NextRequest) {
  // Vercel preview deploys run with NODE_ENV=production, so we cannot use
  // NODE_ENV to gate. The sandbox Vercel project sets ALLOW_TEST_HELPERS=true;
  // prod does not. Local dev sets it via .env.local for the E2E suite to work.
  if (process.env.ALLOW_TEST_HELPERS !== "true") {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Test helpers are not enabled in this environment",
      status: 404,
    });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let body: SeedAuthBody;
  try {
    body = (await req.json()) as SeedAuthBody;
  } catch {
    body = {};
  }

  const subjectLicenceNumber = body.subjectLicenceNumber ?? "IICRC-TEST";
  const whsCardNumber = body.whsCardNumber ?? "WHS-TEST";

  const userWithOrg = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      organization: {
        select: { name: true, legalName: true, tradingName: true },
      },
    },
  });

  const subjectCompanyName =
    userWithOrg?.organization?.legalName ??
    userWithOrg?.organization?.tradingName ??
    userWithOrg?.organization?.name ??
    "Test Org";

  const created = await prisma.authorisation.create({
    data: {
      userId: session.user.id,
      subjectUserId: session.user.id,
      subjectCompanyName,
      subjectLicenceNumber,
      subjectLicenceState: body.subjectLicenceState ?? null,
      subjectLicenceClass: body.subjectLicenceClass ?? null,
      // P1 #19 step 1 of 2: dual-write enum col when caller supplies it.
      subjectLicenceClassEnum:
        body.subjectLicenceClassEnum &&
        AUTHORISATION_LICENCE_CLASSES.includes(body.subjectLicenceClassEnum)
          ? body.subjectLicenceClassEnum
          : null,
      whsCardNumber,
      publicLiabilityInsurer: body.publicLiabilityInsurer ?? null,
      publicLiabilityPolicyNumber: body.publicLiabilityPolicyNumber ?? null,
      publicLiabilityCoverAmount: body.publicLiabilityCoverAmount ?? null,
      verifiedMethod: "SELF_DECLARED",
      status: "VALID",
    },
    select: { id: true },
  });

  return NextResponse.json({ authorisationId: created.id });
}
