import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveUserGstTreatment } from "@/lib/gst/resolve-user-gst";

/** Read-only tenant tax treatment for every authenticated organisation member. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(undefined, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const treatment = await resolveUserGstTreatment(session.user.id);
    return NextResponse.json({ data: treatment });
  } catch (error) {
    return fromException(undefined, error, { stage: "gst-treatment:get" });
  }
}
