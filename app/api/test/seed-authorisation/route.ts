/**
 * TEST-ONLY route — inserts a row into Authorisation for the currently
 * signed-in test user. Used by the technician-dashboard banner-dismiss
 * spec, which needs an existing Authorisation row to verify the banner
 * disappears after one is added.
 *
 * HARD GUARD — returns 404 unless NODE_ENV !== "production".
 *
 * Body: { subjectLicenceNumber: string, whsCardNumber: string, ... }
 * Returns: { authorisationId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface SeedAuthBody {
  subjectLicenceNumber?: string;
  whsCardNumber?: string;
  subjectLicenceState?: string;
  subjectLicenceClass?: string;
  publicLiabilityInsurer?: string;
  publicLiabilityPolicyNumber?: string;
  publicLiabilityCoverAmount?: number;
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404 },
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
