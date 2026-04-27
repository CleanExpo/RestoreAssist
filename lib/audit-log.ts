/**
 * RA-1541 — generic mutation audit helper.
 *
 * Writes a structured record of every state-changing API call to the
 * existing `SecurityEvent` table (no new migration) and mirrors it to
 * the structured console for Vercel Observability.
 *
 * Design:
 *   - Non-blocking: failures are swallowed so an audit outage never
 *     breaks the primary write path.
 *   - Single table re-use: `SecurityEvent.eventType = "MUTATION"` with
 *     the verb/resource packed into `details`. Avoids another schema
 *     migration during the stabilisation window (post-RA-1505).
 *   - Additive: routes opt in by calling `recordMutationAudit`. The
 *     existing SOC2-scoped `lib/security-audit.ts` handles auth events;
 *     this helper handles everything else.
 *
 * Callers should log AFTER the primary write succeeds so the audit row
 * reflects the committed state, not a rolled-back attempt.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type MutationVerb = "CREATE" | "UPDATE" | "DELETE" | "ACTION";

export interface MutationAuditInput {
  /** e.g. "user", "invoice", "estimate", "integration" */
  resource: string;
  /** ID of the resource that was mutated */
  resourceId?: string | null;
  verb: MutationVerb;
  /** Free-form action name (e.g. "update.isJuniorTechnician", "sync.retry"). */
  action: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  organizationId?: string | null;
  /** Arbitrary structured context (before/after, reason, target id, etc.). */
  metadata?: Record<string, unknown>;
  /** Optional — pulled from the request if provided. */
  request?: NextRequest;
}

function extractContext(req?: NextRequest): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  if (!req) return { ipAddress: null, userAgent: null };
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const userAgent = req.headers.get("user-agent") || null;
  return { ipAddress, userAgent };
}

/**
 * Record a mutation audit event. Never throws — failures are logged but
 * do not bubble to the caller.
 */
export async function recordMutationAudit(
  input: MutationAuditInput,
): Promise<void> {
  const { ipAddress, userAgent } = extractContext(input.request);
  const details = {
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    verb: input.verb,
    action: input.action,
    organizationId: input.organizationId ?? null,
    metadata: input.metadata ?? null,
  };

  // Structured log → Vercel Observability (searchable by tag).
  console.info("[audit.mutation]", JSON.stringify({
    actorUserId: input.actorUserId ?? null,
    ...details,
  }));

  try {
    await prisma.securityEvent.create({
      data: {
        eventType: "MUTATION",
        severity: "INFO",
        userId: input.actorUserId ?? null,
        email: input.actorEmail ?? null,
        ipAddress,
        userAgent,
        details: JSON.stringify(details),
      },
    });
  } catch (err) {
    console.error("[audit.mutation] persist failed:", err);
  }
}
