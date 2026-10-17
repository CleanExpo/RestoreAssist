import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import { loadClaimContext } from "@/lib/margot/claim-context";
import { evaluateWaterDamageCompleteness } from "@/lib/completeness/water-damage-pack";
import { formatClaimContextForPrompt } from "@/lib/margot/claim-context-prompt";
import {
  auditMargotAction,
} from "@/lib/margot/audit-margot-action";
import {
  classifyMargotAction,
  requiresHumanConfirmation,
} from "@/lib/margot/action-classifier";
import { callAI } from "@/lib/agents/ai-bridge";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";
import { sanitizeString } from "@/lib/sanitize";

/**
 * POST — P4-2 claim-aware field assist. Runs on the workspace's own key, or,
 * for a funded trial (D-022), on the platform key: callAI "platform-allowed"
 * (RA-8001). That spend is uncapped until RA-8001 slice 1d-ii.
 * Body: { message?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const { id } = await params;
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
    };
    const message =
      typeof body.message === "string"
        ? sanitizeString(body.message.trim(), 4000)
        : "";

    const context = await loadClaimContext(prisma, { inspectionId: id });
    if (!context) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const [wdc, photoCount] = await Promise.all([
      prisma.waterDamageClassification.findUnique({
        where: { inspectionId: id },
        select: { waterCategory: true, damageClass: true },
      }),
      prisma.inspectionPhoto.count({ where: { inspectionId: id } }),
    ]);

    const inspection = await prisma.inspection.findFirst({
      where: { id },
      select: {
        clientId: true,
        report: { select: { incidentDate: true } },
      },
    });

    const completeness = evaluateWaterDamageCompleteness({
      hasClient: Boolean(inspection?.clientId),
      hasCategoryClass: Boolean(wdc?.waterCategory && wdc?.damageClass),
      hasIncidentDate: Boolean(inspection?.report?.incidentDate),
      hasBaseline: context.baselineCaptured,
      hasMonitoringPoint: context.monitoringPointCount > 0,
      photoCount,
    });

    const contextBlock = formatClaimContextForPrompt({ context, completeness });

    if (!message) {
      await auditMargotAction({
        inspectionId: id,
        userId: session.user.id,
        actionKey: "read_claim_context",
      });
      return NextResponse.json({
        data: {
          context,
          completeness,
          reply: null,
          actionClass: classifyMargotAction("read_claim_context"),
        },
      });
    }

    const draftClass = classifyMargotAction("draft_field_guidance");
    if (requiresHumanConfirmation(draftClass)) {
      await auditMargotAction({
        inspectionId: id,
        userId: session.user.id,
        actionKey: "draft_field_guidance",
        detail: { messageLength: message.length },
      });
    }

    const systemPrompt = `You are RestoreAssist field guidance. Use ONLY the claim context below.
Never invent moisture readings, categories, or approvals. Suggest the next 1-3 concrete field actions.
Do not quote IICRC category/class labels to homeowners — plain language only.
If completeness has blocking items, prioritise those.

${contextBlock}`;

    try {
      const ai = await callAI({
        userId: session.user.id,
        agentSlug: "client-communication",
        systemPrompt,
        userPrompt: message,
        keyPolicy: "platform-allowed",
        overrides: { maxTokens: 1200, temperature: 0.2 },
      });

      await auditMargotAction({
        inspectionId: id,
        userId: session.user.id,
        actionKey: "draft_field_guidance_applied",
        detail: { model: ai.model, tokensUsed: ai.tokensUsed },
      });

      return NextResponse.json({
        data: {
          context,
          completeness,
          reply: ai.text,
          actionClass: draftClass,
          provider: ai.provider,
          model: ai.model,
        },
      });
    } catch (err) {
      if (err instanceof NoWorkspaceKeyError) {
        // RA-7600 / RA-8001: a funded trial whose platform key is missing is
        // an ops fault, never "add your key".
        if (err.reason === "PLATFORM_NOT_READY") {
          return apiError(request, {
            code: "GOVERNOR_UNAVAILABLE",
            message: err.message,
            status: 503,
            err,
            stage: "field-assist-post",
            context: {
              userId: session.user.id,
              reason: err.reason,
              inspectionId: id,
            },
          });
        }
        return apiError(request, {
          code: "PAYMENT_REQUIRED",
          message:
            "Add an Anthropic API key in Workspace Settings before using field assist.",
          status: 402,
        });
      }
      throw err;
    }
  } catch (error) {
    return fromException(request, error, { stage: "field-assist-post" });
  }
}
