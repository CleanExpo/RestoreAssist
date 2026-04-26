/**
 * POST /api/progress/[reportId]/pre-attest — RA-1708 / P0-4.
 *
 * Issues a short-lived consent token after the client has shown the user
 * a content summary AND the user has explicitly clicked "I have read and
 * agree to sign". The attest route then requires this token, validates
 * it (not expired, not consumed, matches user/report/type/contentHash),
 * marks it consumed, and binds IP + user-agent into the integrity hash.
 *
 * Together with the signature, this gives ETA 1999 (AU) §10 and ETA
 * 2002 (NZ) §4 sufficiency: identification (token + IP + UA + auth
 * session), consent (explicit click + bound contentHash), reliability
 * (sha256 chain).
 *
 * Body:
 *   {
 *     attestationType: AttestationType,
 *     contentSummary: string,        // exact prose the user read on screen
 *     consentAcknowledged: true       // must be literally true
 *   }
 *
 * Response: { consentToken: string, expiresAt: string, contentHash: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyRateLimit, getClientIp } from "@/lib/rate-limiter";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { canAttest, resolveProgressRole } from "@/lib/progress/permissions";
import { computeContentHash } from "@/lib/progress/signature";

const ALLOWED_TYPES = new Set([
  "TECHNICIAN_SIGN_OFF",
  "MANAGER_COUNTERSIGN",
  "CARRIER_ACCEPT",
  "LEGAL_CLEAR",
  "CUSTOMER_SIGN_OFF",
  "LABOUR_HIRE_SELF",
]);

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MIN_CONTENT_LENGTH = 8;
const MAX_CONTENT_LENGTH = 8192;

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
    prefix: "progress:pre-attest",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  const { reportId } = await params;

  let body: {
    attestationType?: string;
    contentSummary?: string;
    consentAcknowledged?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.attestationType || !ALLOWED_TYPES.has(body.attestationType)) {
    return NextResponse.json(
      {
        error: `attestationType must be one of ${[...ALLOWED_TYPES].join(", ")}`,
      },
      { status: 400 },
    );
  }
  if (body.consentAcknowledged !== true) {
    return NextResponse.json(
      {
        error:
          "consentAcknowledged must be literally true — the user must have clicked the consent control",
      },
      { status: 400 },
    );
  }
  if (
    typeof body.contentSummary !== "string" ||
    body.contentSummary.length < MIN_CONTENT_LENGTH ||
    body.contentSummary.length > MAX_CONTENT_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `contentSummary must be a string between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} chars`,
      },
      { status: 400 },
    );
  }

  // Confirm a ClaimProgress exists for this report and the user has
  // attestation rights for the current state. This blocks pre-issuing
  // tokens against reports the user can't actually sign on.
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
    select: { isJuniorTechnician: true },
  });
  const role = resolveProgressRole({
    userRole: session.user.role ?? "USER",
    isJuniorTechnician: userRow?.isJuniorTechnician ?? false,
  });
  if (!canAttest(role, cp.currentState)) {
    return NextResponse.json(
      {
        error: `Role ${role} cannot attest in state ${cp.currentState}`,
      },
      { status: 403 },
    );
  }

  const contentHash = computeContentHash(body.contentSummary);
  const ip = getClientIp(request) ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  try {
    const token = await prisma.attestationConsentToken.create({
      data: {
        userId,
        reportId,
        attestationType: body.attestationType,
        contentHash,
        ip,
        userAgent,
        expiresAt,
      },
      select: { id: true, expiresAt: true },
    });

    return NextResponse.json({
      consentToken: token.id,
      expiresAt: token.expiresAt.toISOString(),
      contentHash,
    });
  } catch (err) {
    console.error("[pre-attest] failed", err);
    return NextResponse.json(
      { error: "Failed to issue consent token" },
      { status: 500 },
    );
  }
}
