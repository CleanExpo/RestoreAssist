/**
 * Legacy unbound attestation endpoint.
 *
 * When an operator applies an *imported* floor plan (URL scrape or client
 * upload) as a reference underlay, they must first affirm the client holds the
 * rights and that the import complies with the source's terms of use. This
 * This endpoint is retired because a standalone log was forgeable and not
 * bound to the exact stored bytes. The inspection-scoped import route owns the
 * durable attestation and custody transaction.
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-errors";

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Sign in to record an attestation.",
      status: 401,
    });
  }
  return apiError(req, {
    code: "CONFLICT",
    message:
      "Use the inspection-scoped floor-plan import. Attestations must be bound to stored image bytes.",
    status: 409,
  });
}
