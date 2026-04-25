/**
 * GET /api/integrations/abr?abn=51824753556
 *
 * Resolves an ABN via the Australian Business Register JSON API.
 * Returns entity name, GST status, entity type, and state.
 *
 * Requires env var: ABR_GUID
 *
 * P1-INT8 — RA-1128
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lookupAbn, AbrLookupError } from "@/lib/integrations/abr-lookup";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const abn = new URL(request.url).searchParams.get("abn");
  if (!abn) {
    return NextResponse.json({ error: "abn query param required" }, { status: 400 });
  }

  try {
    const result = await lookupAbn(abn);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AbrLookupError) {
      const status =
        err.code === "NOT_FOUND" ? 404
        : err.code === "INVALID_ABN" ? 400
        : err.code === "NO_GUID" ? 503
        : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
