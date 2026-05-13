import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { invalidateAuthorisationCache } from "@/lib/authorisations/most-recent";

interface PostBody {
  inspectionId?: string;
  subjectLicenceNumber?: string;
  whsCardNumber?: string;
  subjectLicenceState?: string;
  subjectLicenceClass?: string;
  publicLiabilityInsurer?: string;
  publicLiabilityPolicyNumber?: string;
  publicLiabilityCoverAmount?: number;
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.subjectLicenceNumber || typeof body.subjectLicenceNumber !== "string") {
    return NextResponse.json(
      { error: "subjectLicenceNumber is required" },
      { status: 400 },
    );
  }
  if (!body.whsCardNumber || typeof body.whsCardNumber !== "string") {
    return NextResponse.json(
      { error: "whsCardNumber is required" },
      { status: 400 },
    );
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
      return NextResponse.json(
        { error: "User is not attached to an organization" },
        { status: 400 },
      );
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
        whsCardNumber: body.whsCardNumber,
        publicLiabilityInsurer: body.publicLiabilityInsurer ?? null,
        publicLiabilityPolicyNumber: body.publicLiabilityPolicyNumber ?? null,
        verifiedMethod: "SELF_DECLARED",
        status: "VALID",
      },
      select: { id: true },
    });

    invalidateAuthorisationCache(session.user.id);

    return NextResponse.json({ ok: true, authorisationId: created.id });
  } catch (error) {
    console.error("[POST /api/authorisations]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
