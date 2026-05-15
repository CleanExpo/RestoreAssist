import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTrialStatus } from "@/lib/trial-handling";
import { apiError, fromException } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    }
    const status = await getTrialStatus(session.user.id);
    return NextResponse.json({ data: status });
  } catch (err) {
    return fromException(request, err, { stage: "billing/trial-status" });
  }
}
