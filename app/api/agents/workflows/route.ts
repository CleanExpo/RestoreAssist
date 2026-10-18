import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { prisma } from "@/lib/prisma";
import {
  createWorkflow,
  liveLeaseSql,
  quickAssessmentWorkflow,
  type WorkflowDefinition,
} from "@/lib/agents";
import {
  agentKeyPreflight,
  agentSubscriptionGate,
  needsByokKey,
} from "@/lib/agents/route-gates";
import {
  assertInspectionTenancy,
  assertReportTenancy,
} from "@/lib/auth/assert-tenancy";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

const WORKFLOW_TEMPLATES: Record<string, any> = {
  "quick-assessment": quickAssessmentWorkflow,
};

/**
 * POST /api/agents/workflows — Create a new workflow
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 10,
    prefix: "agent-workflows",
  });
  if (rateLimited) return rateLimited;

  // RA-1266: workflow creation kicks off a chain of async agent tasks —
  // duplicate creation means double the AI spend and double the results.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { workflow: templateName, reportId, inspectionId, config } = body;

      if (!templateName) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Workflow template name is required",
          status: 400,
        });
      }

      const template = WORKFLOW_TEMPLATES[templateName];
      if (!template) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Unknown workflow template: ${templateName}. Available: ${Object.keys(WORKFLOW_TEMPLATES).join(", ")}`,
          status: 400,
        });
      }

      // RA-8001: ids are checked before they are stored.
      for (const [field, value] of [
        ["inspectionId", inspectionId],
        ["reportId", reportId],
      ] as const) {
        if (value !== undefined && value !== null && typeof value !== "string") {
          return apiError(request, {
            code: "VALIDATION",
            message: `${field} must be a string`,
            status: 400,
          });
        }
      }

      // RA-8001 order: G1 -> tenancy -> key preflight -> createWorkflow, all
      // inside withIdempotency. Any refusal writes no row.
      const gate = {
        route: "agents-workflow-create",
        userId,
        ids: { inspectionId: inspectionId ?? undefined, reportId: reportId ?? undefined },
      };
      const inactive = await agentSubscriptionGate(request, gate);
      if (inactive) return inactive;

      // WRITE scope (the helpers' default): a technician may attach only
      // their own records, never a colleague's (never assertInspectionReadable).
      if (typeof inspectionId === "string") {
        const tenancy = await assertInspectionTenancy(session, inspectionId);
        if (!tenancy.ok) {
          return apiError(request, {
            code: "NOT_FOUND",
            message: "Inspection not found",
            status: 404,
          });
        }
      }
      if (typeof reportId === "string") {
        const tenancy = await assertReportTenancy(session, reportId);
        if (!tenancy.ok) {
          return apiError(request, {
            code: "NOT_FOUND",
            message: "Report not found",
            status: 404,
          });
        }
      }

      const steps = (template as WorkflowDefinition).steps.map((s) => s.agentSlug);
      if (needsByokKey(steps)) {
        const refused = await agentKeyPreflight(request, gate);
        if (refused) return refused;
      }

      const result = await createWorkflow(template, {
        userId,
        reportId: reportId ?? undefined,
        inspectionId: inspectionId ?? undefined,
        config,
      });

      return NextResponse.json(result, { status: 201 });
    } catch (error) {
      return fromException(request, error, { stage: "agents-workflow-create" });
    }
  });
}

/**
 * GET /api/agents/workflows — List user's workflows
 */
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

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);
    const status = url.searchParams.get("status") ?? undefined;

    const workflows = await prisma.agentWorkflow.findMany({
      where: {
        userId: session.user.id,
        ...(status ? { status: status as any } : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        totalTasks: true,
        completedTasks: true,
        failedTasks: true,
        reportId: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // RA-7999: read-only count of the caller's RUNNING tasks whose lease has
    // expired (the sweep's predicate, on the database clock).
    const [{ expired }] = await prisma.$queryRaw<Array<{ expired: number }>>`
      SELECT count(*)::int AS expired
      FROM "AgentTask" t
      JOIN "AgentWorkflow" w ON w.id = t."workflowId"
      WHERE w."userId" = ${session.user.id}
        AND t.status = 'RUNNING'
        AND NOT COALESCE(${liveLeaseSql("t")}, false)`;

    return NextResponse.json({
      workflows,
      count: workflows.length,
      expiredLeaseTasks: expired,
    });
  } catch (error) {
    return fromException(request, error, { stage: "agents-workflow-list" });
  }
}
