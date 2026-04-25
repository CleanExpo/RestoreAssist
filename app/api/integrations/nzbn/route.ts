/**
 * GET /api/integrations/nzbn?nzbn=9429041249118
 *
 * Resolves an NZBN via the NZ Companies Office API.
 * Returns entity name, status, entity type, and GST number.
 *
 * Requires env var: NZBN_API_KEY
 *
 * P1-INT9 — RA-1128
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lookupNzbn, NzbnLookupError } from "@/lib/integrations/nzbn-lookup";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nzbn = new URL(request.url).searchParams.get("nzbn");
  if (!nzbn) {
    return NextResponse.json({ error: "nzbn query param required" }, { status: 400 });
  }

  try {
    const result = await lookupNzbn(nzbn);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NzbnLookupError) {
      const status =
        err.code === "NOT_FOUND" ? 404
        : err.code === "INVALID_NZBN" ? 400
        : err.code === "NO_API_KEY" ? 503
        : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
