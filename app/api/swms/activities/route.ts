/**
 * GET /api/swms/activities
 *
 * The catalogue of activity-based SWMS templates a crew can issue for a job.
 * Body-free and read-only; the templates are static data, so this route does
 * not touch the database.
 *
 * Auth: getServerSession required. The templates are not secret, but the
 * catalogue is a product surface and every other authenticated API route in
 * this application gates on session — an unauthenticated exception here would
 * be the odd one out.
 *
 * Response: { data: { activities: [...], jurisdictions: [...] } } | { error }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import {
  SWMS_ACTIVITY_IDS,
  SWMS_ACTIVITY_TEMPLATES,
} from "@/lib/swms/activity-templates";
import { getSwmsJurisdictions } from "@/lib/swms/jurisdiction-reference";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Summary only — the full risk table is large and is fetched per activity.
    const activities = SWMS_ACTIVITY_IDS.map((id) => {
      const tpl = SWMS_ACTIVITY_TEMPLATES[id];
      return {
        id: tpl.id,
        title: tpl.title,
        sourceRevision: tpl.sourceRevision,
        stepCount: tpl.rows.length,
        highestResidualRisk: tpl.rows.reduce(
          (max, row) => Math.max(max, row.riskAfter),
          0,
        ),
        // NOT "this job is HRCW" — the template cannot know that. This is
        // the size of the checklist the crew must work through first.
        hrcwCategoriesToAssess: tpl.hrcwCategoriesToAssess.length,
      };
    });

    return NextResponse.json({
      data: {
        activities,
        jurisdictions: getSwmsJurisdictions().map((j) => ({
          code: j.code,
          name: j.name,
        })),
      },
    });
  } catch (err) {
    return fromException(request, err, { stage: "swms-activity-catalogue" });
  }
}
