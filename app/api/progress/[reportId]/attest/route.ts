/**
 * POST /api/progress/[reportId]/attest — Pi-Sign in-house attestation.
 *
 * RA-1703. Replaces DocuSign for V1. Captures a base64-drawn signature
 * from the client and writes a ProgressAttestation row with a tamper-
 * evident integrity hash.
 *
 * Body:
 *   {
 *     attestationType: "TECHNICIAN_SIGN_OFF" | "MANAGER_COUNTERSIGN" |
 *                       "CARRIER_ACCEPT" | "LEGAL_CLEAR" |
 *                       "CUSTOMER_SIGN_OFF" | "LABOUR_HIRE_SELF",
 *     signatureDataUrl: string,    // data:image/png;base64,…
 *     transitionId?: string,        // optional FK to a ProgressTransition
 *     attestationNote?: string,
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { validateCsrf } from "@/lib/csrf";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { canAttest, resolveProgressRole } from "@/lib/progress/permissions";
import {
  computeAttestationIntegrityHash,
  validateSignatureDataUrl,
} from "@/lib/progress/signature";
import { recordAttestationCaptured } from "@/lib/telemetry/progress";

const ALLOWED_TYPES = new Set([
  "TECHNICIAN_SIGN_OFF",
  "MANAGER_COUNTERSIGN",
  "CARRIER_ACCEPT",
  "LEGAL_CLEAR",
  "CUSTOMER_SIGN_OFF",
  "LABOUR_HIRE_SELF",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 30,
    windowMs: 60 * 1000,
    prefix: "progress:attest",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  const { reportId } = await params;

  return withIdempotency(request, userId, async (rawBody) => {
    let body: {
      attestationType?: string;
      signatureDataUrl?: string;
      transitionId?: string | null;
      attestationNote?: string | null;
    };
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.attestationType || !ALLOWED_TYPES.has(body.attestationType)) {
      return NextResponse.json(
        { error: `attestationType must be one of ${[...ALLOWED_TYPES].join(", ")}` },
        { status: 400 },
      );
    }

    const sigCheck = validateSignatureDataUrl(body.signatureDataUrl);
    if (!sigCheck.ok) {
      return NextResponse.json({ error: sigCheck.error }, { status: 400 });
    }

    const cp = await prisma.claimProgress.findUnique({
      where: { reportId },
      select: { id: true, currentState: true },
    });
    if (!cp) {
      return NextResponse.json(
        { error: "ClaimProgress not found" },
        { status: 404 },
      );
    }

    const userRow = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, isJuniorTechnician: true },
    });
    if (!userRow) {
      return NextResponse.json(
        { error: "Acting user not found" },
        { status: 404 },
      );
    }

    const role = resolveProgressRole({
      userRole: session.user.role ?? "USER",
      isJuniorTechnician: userRow.isJuniorTechnician ?? false,
    });

    if (!canAttest(role, cp.currentState)) {
      return NextResponse.json(
        {
          error: `Role ${role} cannot attest in state ${cp.currentState}`,
        },
        { status: 403 },
      );
    }

    if (body.transitionId) {
      // Confirm the transition belongs to this claim — defends against
      // forged transitionId references on attestation writes.
      const trans = await prisma.progressTransition.findUnique({
        where: { id: body.transitionId },
        select: { claimProgressId: true },
      });
      if (!trans || trans.claimProgressId !== cp.id) {
        return NextResponse.json(
          { error: "transitionId does not belong to this claim" },
          { status: 400 },
        );
      }
    }

    const attestedAt = new Date();
    const integrityHash = computeAttestationIntegrityHash({
      attestorUserId: userId,
      attestationType: body.attestationType,
      claimProgressId: cp.id,
      attestedAt,
      signatureDataUrl: body.signatureDataUrl as string,
    });

    try {
      const row = await prisma.progressAttestation.create({
        data: {
          claimProgressId: cp.id,
          transitionId: body.transitionId ?? null,
          attestorUserId: userId,
          attestorRole: role,
          attestorName: userRow.name ?? session.user.name ?? "unknown",
          attestorEmail: userRow.email ?? session.user.email ?? "",
          attestationType: body.attestationType,
          attestationNote: body.attestationNote ?? null,
          signatureDataUrl: body.signatureDataUrl as string,
          integrityHash,
          attestedAt,
        },
        select: {
          id: true,
          attestationType: true,
          attestedAt: true,
          integrityHash: true,
        },
      });

      // M-17 telemetry — attestation.captured.
      void recordAttestationCaptured({
        claimProgressId: cp.id,
        transitionId: body.transitionId ?? null,
        userId,
        payload: {
          attestationType: body.attestationType,
          mimeType: sigCheck.mimeType,
          sizeBytes: sigCheck.sizeBytes,
        },
      });

      return NextResponse.json({ data: row });
    } catch (err) {
      console.error("[progress.attest] failed", err);
      return NextResponse.json(
        { error: "Failed to record attestation" },
        { status: 500 },
      );
    }
  });
}
