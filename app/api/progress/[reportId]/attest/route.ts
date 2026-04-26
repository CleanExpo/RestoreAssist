/**
 * POST /api/progress/[reportId]/attest — Pi-Sign in-house attestation.
 *
 * RA-1703 + RA-1708 (P0-4). Replaces DocuSign for V1. Captures a
 * base64-drawn signature from the client + a redeemed consent token
 * (issued by /api/progress/[reportId]/pre-attest) and writes a
 * ProgressAttestation row with a tamper-evident integrity hash that
 * binds attestor identity, signature, signer IP + UA, and the content
 * the user actually agreed to.
 *
 * Body:
 *   {
 *     attestationType: AttestationType,
 *     signatureDataUrl: string,        // data:image/png;base64,…
 *     consentToken: string,             // RA-1708 — issued by /pre-attest
 *     transitionId?: string,            // optional FK to ProgressTransition
 *     attestationNote?: string
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit, getClientIp } from "@/lib/rate-limiter";
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
      consentToken?: string;
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

    if (typeof body.consentToken !== "string" || body.consentToken.length < 8) {
      return NextResponse.json(
        {
          error:
            "consentToken is required — call POST /api/progress/[reportId]/pre-attest to obtain one (ETA 1999/2002 consent step)",
        },
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

    // RA-1708 / P0-4 — redeem the consent token. Validates user / report /
    // type binding, expiry, single-use; captures the contentHash signed.
    const token = await prisma.attestationConsentToken.findUnique({
      where: { id: body.consentToken },
    });
    if (!token) {
      return NextResponse.json(
        { error: "consentToken not recognised" },
        { status: 400 },
      );
    }
    if (token.userId !== userId) {
      return NextResponse.json(
        { error: "consentToken does not belong to this user" },
        { status: 403 },
      );
    }
    if (token.reportId !== reportId) {
      return NextResponse.json(
        { error: "consentToken bound to a different report" },
        { status: 400 },
      );
    }
    if (token.attestationType !== body.attestationType) {
      return NextResponse.json(
        {
          error:
            "consentToken bound to a different attestationType — re-issue via /pre-attest with the correct type",
        },
        { status: 400 },
      );
    }
    if (token.consumedAt) {
      return NextResponse.json(
        {
          error:
            "consentToken already consumed — issue a fresh one via /pre-attest",
        },
        { status: 409 },
      );
    }
    if (token.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "consentToken expired — issue a fresh one via /pre-attest" },
        { status: 400 },
      );
    }

    // Bind attest-time IP + UA into the integrity hash.
    const attestIp = getClientIp(request) ?? null;
    const attestUserAgent = request.headers.get("user-agent") ?? null;

    const attestedAt = new Date();
    const integrityHash = computeAttestationIntegrityHash({
      attestorUserId: userId,
      attestationType: body.attestationType,
      claimProgressId: cp.id,
      attestedAt,
      signatureDataUrl: body.signatureDataUrl as string,
      consentTokenId: token.id,
      signerIp: attestIp,
      signerUserAgent: attestUserAgent,
      contentHash: token.contentHash,
    });

    try {
      const row = await prisma.$transaction(async (tx) => {
        // Mark the token consumed before the row write so a concurrent
        // request can't redeem the same token twice.
        const consume = await tx.attestationConsentToken.updateMany({
          where: { id: token.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (consume.count === 0) {
          throw new Error("CONSENT_RACE");
        }
        return tx.progressAttestation.create({
          data: {
            claimProgressId: cp.id,
            transitionId: body.transitionId ?? null,
            attestorUserId: userId,
            attestorRole: role,
            attestorName: userRow.name ?? session.user.name ?? "unknown",
            attestorEmail: userRow.email ?? session.user.email ?? "",
            attestationType: body.attestationType as string,
            attestationNote: body.attestationNote ?? null,
            signatureDataUrl: body.signatureDataUrl as string,
            integrityHash,
            attestedAt,
            consentTokenId: token.id,
            signerIp: attestIp,
            signerUserAgent: attestUserAgent,
            contentHash: token.contentHash,
          },
          select: {
            id: true,
            attestationType: true,
            attestedAt: true,
            integrityHash: true,
          },
        });
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
      if (err instanceof Error && err.message === "CONSENT_RACE") {
        // Another concurrent request consumed this token first. Surface
        // a clean conflict instead of a 500 — the client can re-issue.
        return NextResponse.json(
          {
            error:
              "consentToken consumed concurrently — issue a fresh one via /pre-attest",
          },
          { status: 409 },
        );
      }
      console.error("[progress.attest] failed", err);
      return NextResponse.json(
        { error: "Failed to record attestation" },
        { status: 500 },
      );
    }
  });
}
