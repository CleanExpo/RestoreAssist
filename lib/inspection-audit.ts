/**
 * Inspection-scoped audit log writer (P1-ARCH4 — RA-1127).
 *
 * Writes to the existing `AuditLog` model (Inspection-scoped, see
 * prisma/schema.prisma model AuditLog). Non-blocking — failures are
 * logged but never thrown, so an audit outage never breaks primary writes.
 *
 * Usage:
 *   await writeInspectionAudit({
 *     inspectionId,
 *     userId: session.user.id,
 *     action: "make_safe.authorised",
 *     entityType: "MakeSafeAction",
 *   });
 *
 * For general (non-inspection) mutation auditing, use lib/audit-log.ts
 * (writes to SecurityEvent table).
 */

import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

export interface InspectionAuditInput {
  inspectionId: string;
  userId: string;
  /** Human-readable verb, e.g. "claim.handed_over", "make_safe.action_completed" */
  action: string;
  /** Prisma model name that was mutated, e.g. "MakeSafeAction", "ScopeVariation" */
  entityType?: string;
  entityId?: string;
  /** JSON-serialisable before/after or context payload */
  changes?: Record<string, unknown>;
  device?: string;
  request?: NextRequest;
}

function ipFrom(req?: NextRequest): string | null {
  if (!req) return null;
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function writeInspectionAudit(
  input: InspectionAuditInput,
): Promise<void> {
  const ip = ipFrom(input.request);
  const ua = input.request?.headers.get("user-agent") ?? null;

  try {
    await prisma.auditLog.create({
      data: {
        inspectionId: input.inspectionId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        changes: input.changes ? JSON.stringify(input.changes) : null,
        device: input.device ?? null,
        ipAddress: ip,
        userAgent: ua,
      },
    });
  } catch (err) {
    console.error("[inspection-audit] persist failed:", err);
  }
}
