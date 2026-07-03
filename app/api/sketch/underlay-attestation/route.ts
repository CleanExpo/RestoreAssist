/**
 * RA-6848 [C2] / RA-6849 [C3] — record an underlay rights attestation.
 *
 * When an operator applies an *imported* floor plan (URL scrape or client
 * upload) as a reference underlay, they must first affirm the client holds the
 * rights and that the import complies with the source's terms of use. This
 * route records that attestation server-side, fail-closed: an incomplete
 * attestation is rejected (400) and never logged as valid.
 *
 * Recording is a structured stdout event (captured by Vercel Observability) —
 * intentionally migration-free. A durable per-inspection attestation table is
 * deferred to the RA-6922 entitlement/DB layer and gated by RA-6850 [C4]; the
 * `UnderlayAttestationRecord` shape here is the contract that layer will persist.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-errors";
import {
  evaluateUnderlayAttestation,
  buildUnderlayAttestationRecord,
  type UnderlaySource,
} from "@/lib/sketch/underlay-attestation";

interface AttestationBody {
  source?: unknown;
  holdsRights?: unknown;
  compliesWithSourceTerms?: unknown;
  inspectionId?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Sign in to record an attestation.",
      status: 401,
    });
  }
  const userId = session.user.id;

  let body: AttestationBody;
  try {
    body = (await req.json()) as AttestationBody;
  } catch {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid JSON body.",
      status: 400,
    });
  }

  const source: UnderlaySource = body.source === "url" ? "url" : "upload";
  const input = {
    holdsRights: body.holdsRights === true,
    compliesWithSourceTerms: body.compliesWithSourceTerms === true,
  };

  const result = evaluateUnderlayAttestation(input);
  if (!result.ok) {
    return apiError(req, {
      code: "VALIDATION",
      message: result.reason ?? "Attestation incomplete.",
      status: 400,
    });
  }

  const record = buildUnderlayAttestationRecord(input, source);

  // Migration-free audit trail: structured stdout, captured by Vercel logs.
  console.info(
    JSON.stringify({
      event: "underlay_attestation_recorded",
      userId,
      inspectionId:
        typeof body.inspectionId === "string" ? body.inspectionId : null,
      ...record,
    }),
  );

  return NextResponse.json({ recorded: true, attestedAt: record.attestedAt });
}
