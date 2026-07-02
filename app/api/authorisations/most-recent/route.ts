import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { mostRecentAuthorisationForUser } from "@/lib/authorisations/most-recent";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const row = await mostRecentAuthorisationForUser(session.user.id);
    if (!row) {
      return NextResponse.json({ row: null });
    }

    return NextResponse.json({
      row: {
        subjectLicenceNumber: row.subjectLicenceNumber,
        subjectLicenceState: row.subjectLicenceState,
        subjectLicenceClass: row.subjectLicenceClass,
        whsCardNumber: row.whsCardNumber,
        publicLiabilityInsurer: row.publicLiabilityInsurer,
        publicLiabilityPolicyNumber: row.publicLiabilityPolicyNumber,
        publicLiabilityCoverAmount: row.publicLiabilityCoverAmount
          ? row.publicLiabilityCoverAmount.toString()
          : null,
        verifiedAt: row.verifiedAt.toISOString(),
      },
    });
  } catch (err) {
    return fromException(req, err, { stage: "list" });
  }
}
