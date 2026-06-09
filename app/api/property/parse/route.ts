import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { parseOnTheHouseHTML } from "@/lib/property-data-parser";
import { normalizeScrapedProperty } from "@/lib/property/provider";

// POST /api/property/parse — extract structured property metadata from supplied
// property-page HTML (spec §7, metadata-first). Ungated: the operator/client
// provides the HTML; we parse it. Automated BYOK-Apify fetching is the separate
// gated follow-up (spec §6.4/§9 spike).
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }

    const body = await request.json();
    const { html, sourceUrl } = body;

    if (typeof html !== "string" || html.trim().length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "html (non-empty string) is required",
        status: 422,
      });
    }
    if (typeof sourceUrl !== "string" || sourceUrl.trim().length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "sourceUrl (string) is required",
        status: 422,
      });
    }

    const scraped = parseOnTheHouseHTML(html, sourceUrl);
    const property = normalizeScrapedProperty(scraped, "operator-parse");

    return NextResponse.json({ property });
  } catch (error) {
    return fromException(request, error, { stage: "property-parse" });
  }
}
