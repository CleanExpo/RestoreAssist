/**
 * SWMS for one activity.
 *
 *   GET  /api/swms/activities/[activityId]
 *     The template body — risk table, tools, PPE, training. No job details.
 *
 *   POST /api/swms/activities/[activityId]
 *     Composes a job-specific SWMS from the template plus the PCBU, project and
 *     consulted-persons details in the request body. POST rather than GET
 *     because the job details are a structured document, not query parameters;
 *     nothing is persisted, so the call is safe to repeat.
 *
 * Auth: getServerSession required on both.
 * Response: { data } | { error }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { getSwmsActivityTemplate } from "@/lib/swms/activity-templates";
import {
  buildActivitySwms,
  SwmsCompositionError,
} from "@/lib/swms/build-activity-swms";

type RouteContext = { params: Promise<{ activityId: string }> };

const BodySchema = z.object({
  pcbu: z.object({
    companyName: z.string().min(1),
    address: z.string().min(1),
    abn: z.string().min(1),
    contactName: z.string().min(1),
    contactPosition: z.string().default(""),
    contactPhone: z.string().default(""),
  }),
  project: z.object({
    name: z.string().min(1),
    address: z.string().min(1),
    jurisdictionCode: z.string().min(2).max(3),
    principalContractorName: z.string().optional(),
    principalContractorCompany: z.string().optional(),
    responsiblePersonName: z.string().optional(),
  }),
  consulted: z
    .array(z.object({ name: z.string().min(1), position: z.string() }))
    .max(100)
    .optional(),
});

async function requireSession(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  return null;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const unauthorised = await requireSession(request);
    if (unauthorised) return unauthorised;

    const { activityId } = await params;
    const template = getSwmsActivityTemplate(activityId);
    if (!template) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: `Unknown SWMS activity "${activityId}"`,
        status: 404,
      });
    }

    return NextResponse.json({ data: template });
  } catch (err) {
    return fromException(request, err, { stage: "swms-activity-template" });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const unauthorised = await requireSession(request);
    if (unauthorised) return unauthorised;

    const { activityId } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Request body must be JSON",
        status: 400,
      });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(request, {
        code: "VALIDATION",
        message: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        status: 400,
      });
    }

    const swms = buildActivitySwms({ activityId, ...parsed.data });
    return NextResponse.json({ data: swms });
  } catch (err) {
    // A composition failure is a client error — an unknown activity, an
    // unrecognised jurisdiction, or a malformed ABN — not a server fault.
    if (err instanceof SwmsCompositionError) {
      return apiError(request, {
        code: "VALIDATION",
        message: err.message,
        status: 400,
      });
    }
    return fromException(request, err, { stage: "swms-activity-compose" });
  }
}
