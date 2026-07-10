/**
 * RA-7026 Phase 2 — contractor-facing assistant chat endpoint.
 *
 * A SEPARATE surface from the founder's personal Margot (`/api/margot/chat`):
 * de-hardwired persona, session + subscription auth (not admin), per-user rate
 * limit, READ-ONLY (no tools), and grounded ONLY on the caller's own org
 * pricing + shared IICRC standards. No cross-tenant data is ever read.
 *
 * DARK BY DEFAULT: responds 404 unless CONTRACTOR_ASSISTANT_ENABLED === "true",
 * so it is invisible until the founder deliberately turns it on.
 *
 * Auth chain: rule 1 (session) -> rule 5 (subscription TRIAL/ACTIVE) -> rule 8
 * (rate-limit by userId).
 */

import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMargotModel, getOpenRouterApiKey } from "@/lib/ai/openrouter";
import { applyRateLimit } from "@/lib/rate-limiter";
import { getEffectiveSubscription } from "@/lib/organization-credits";
import { buildPricingGrounding, PRICING_HINT } from "@/lib/pricing/org-pricing";
import { appendCopyrightGroundingInstruction } from "@/lib/standards/copyright-guard";
import {
  ASSISTANT_SYSTEM_PROMPT,
  buildStandardsGrounding,
  buildWorkContext,
  latestUserText,
  WORK_HINT,
} from "@/lib/assistant/grounding";
import { apiError } from "@/lib/api-errors";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Subscription statuses that grant AI access (CLAUDE.md rule 5). */
const ALLOWED_SUBSCRIPTION_STATUSES = new Set(["TRIAL", "ACTIVE"]);

export async function POST(request: NextRequest) {
  try {
    // FR1 — dark by default: invisible until deliberately enabled.
    if (process.env.CONTRACTOR_ASSISTANT_ENABLED !== "true") {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });
    }

    // FR2 — auth (rule 1).
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const userId = session.user.id;

    // FR4 — rate limit per user (rule 8).
    const limited = await applyRateLimit(request, {
      maxRequests: 30,
      windowMs: 15 * 60 * 1000,
      prefix: "assistant-chat",
      key: userId,
    });
    if (limited) return limited;

    // FR3 — subscription gate (rule 5). Effective = own, or org-owner's for
    // team members.
    const effectiveSub = await getEffectiveSubscription(userId);
    if (!ALLOWED_SUBSCRIPTION_STATUSES.has(effectiveSub?.subscriptionStatus ?? "")) {
      return apiError(request, {
        code: "FORBIDDEN",
        message:
          "An active RestoreAssist subscription is required to use the assistant.",
        status: 402,
      });
    }

    if (!getOpenRouterApiKey()) {
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        message: "Assistant is offline — OPENROUTER_API_KEY not configured",
        status: 503,
        stage: "config",
      });
    }

    const body = (await request.json()) as { messages?: UIMessage[] };
    const messages = body.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "messages array required",
        status: 400,
      });
    }

    // Tenancy: the caller's OWN org is the only tenant scope used.
    const caller = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });

    const query = latestUserText(messages);
    const pricingIntent = PRICING_HINT.test(query);

    // FR5 — de-hardwired persona.
    let system = ASSISTANT_SYSTEM_PROMPT;

    // FR7 — standards grounding; drop KNOWLEDGE tier on pricing intent.
    const standardsGrounding = await buildStandardsGrounding(
      query,
      pricingIntent,
    );
    if (standardsGrounding) {
      system = appendCopyrightGroundingInstruction(system + standardsGrounding);
    }

    // FR6 — pricing grounding scoped to the CALLER's own org only.
    const pricingGrounding = await buildPricingGrounding(
      prisma,
      caller?.organizationId ?? null,
      query,
    );
    if (pricingGrounding) {
      system = system + pricingGrounding;
    }

    // Inc 2 — work-context grounding, strictly the caller's OWN records
    // (where userId = this user). Only when they ask about their own work.
    if (WORK_HINT.test(query)) {
      const workContext = await buildWorkContext(prisma, userId);
      if (workContext) system = system + workContext;
    }

    // FR8 — read-only: no tools passed to the model.
    const result = streamText({
      model: createMargotModel(),
      system,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    return apiError(request, {
      code: "INTERNAL",
      message: "Assistant chat failed",
      status: 500,
      err,
      stage: "stream",
    });
  }
}
