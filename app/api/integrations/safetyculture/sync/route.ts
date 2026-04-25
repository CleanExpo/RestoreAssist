/**
 * POST /api/integrations/safetyculture/sync
 *
 * Pulls completed audits from SafetyCulture (iAuditor) and upserts them
 * as WHSIncident records. Designed for webhook-triggered or scheduled calls.
 *
 * Body (optional):
 * {
 *   templateId?: string   // filter to one template
 *   inspectionId?: string // link new incidents to an inspection
 *   modifiedAfter?: string // ISO-8601 cutoff (default: 24h ago)
 *   limit?: number        // max audits to pull (1–100, default 50)
 * }
 *
 * Response:
 * {
 *   synced: number       // incidents created or updated
 *   skipped: number      // already up-to-date
 *   errors: string[]     // per-audit error messages
 * }
 *
 * GET /api/integrations/safetyculture/sync
 * Returns the status of the integration (key present, last sync time).
 *
 * RA-1128 P1-INT6
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  searchAudits,
  auditToIncidentFields,
  type IauditorAuditHeader,
} from "@/lib/integrations/safetyculture-client";

interface SyncBody {
  templateId?: string;
  inspectionId?: string;
  modifiedAfter?: string;
  limit?: number;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SAFETYCULTURE_API_KEY) {
    return NextResponse.json(
      { error: "SafetyCulture API key not configured — set SAFETYCULTURE_API_KEY" },
      { status: 503 },
    );
  }

  let body: SyncBody = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as SyncBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const modifiedAfter =
    body.modifiedAfter ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const limit = Math.min(Math.max(1, body.limit ?? 50), 100);

  // Validate inspectionId if provided
  if (body.inspectionId) {
    const inspection = await prisma.inspection.findUnique({
      where: { id: body.inspectionId },
      select: { userId: true },
    });
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }
    if (inspection.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let audits: IauditorAuditHeader[];
  try {
    audits = await searchAudits({
      templateId: body.templateId,
      modifiedAfter,
      limit,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `SafetyCulture fetch failed: ${msg}` },
      { status: 502 },
    );
  }

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const audit of audits) {
    try {
      const fields = auditToIncidentFields(audit);

      // Upsert by externalAuditId stored in description prefix — use description
      // as surrogate key since WHSIncident has no externalId column.
      // Check for existing record with matching audit_id in description.
      const existing = await prisma.wHSIncident.findFirst({
        where: {
          userId: session.user.id,
          description: { contains: audit.audit_id },
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.wHSIncident.update({
          where: { id: existing.id },
          data: {
            severity: fields.severity,
            status: fields.status,
            description: `[iAuditor:${audit.audit_id}] ${fields.description}`,
            updatedAt: new Date(),
          },
        });
        synced++;
      } else {
        await prisma.wHSIncident.create({
          data: {
            userId: session.user.id,
            inspectionId: body.inspectionId ?? null,
            incidentType: fields.incidentType,
            severity: fields.severity,
            status: fields.status,
            incidentDate: fields.incidentDate,
            description: `[iAuditor:${audit.audit_id}] ${fields.description}`,
          },
        });
        synced++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`audit ${audit.audit_id}: ${msg}`);
      skipped++;
    }
  }

  return NextResponse.json({ synced, skipped, errors }, { status: 200 });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyConfigured = !!process.env.SAFETYCULTURE_API_KEY;

  const lastIncident = await prisma.wHSIncident.findFirst({
    where: {
      userId: session.user.id,
      incidentType: "safetyculture_audit",
    },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  return NextResponse.json({
    keyConfigured,
    lastSyncAt: lastIncident?.updatedAt ?? null,
  });
}
