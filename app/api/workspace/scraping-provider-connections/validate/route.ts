/**
 * RA-2966: Validate scraping provider key
 *
 * POST /api/workspace/scraping-provider-connections/validate
 *   Body: { provider: ScrapingProvider }
 *   Test-calls the provider's auth-only endpoint and updates lastValidatedAt /
 *   lastError on the connection row.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  validateScrapingProviderKey,
  type ScrapingProvider,
} from "@/lib/workspace/scraping-provider-connections";
import { checkPaymentGate } from "@/lib/workspace/payment-gate";
import { hasPermission } from "@/lib/workspace/permissions";

const VALID_PROVIDERS: ScrapingProvider[] = [
  "APIFY",
  "BRIGHTDATA",
  "ZYTE",
  "FIRECRAWL",
  "SHARED",
];

function isValidProvider(value: unknown): value is ScrapingProvider {
  return (
    typeof value === "string" &&
    VALID_PROVIDERS.includes(value as ScrapingProvider)
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gate = await checkPaymentGate(session.user.id);
    if (!gate.allowed) return gate.response;
    const { workspace } = gate;

    const allowed = await hasPermission(
      session.user.id,
      workspace.id,
      "workspace.settings",
    );
    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Forbidden — only workspace owners and managers may configure scraping providers",
        },
        { status: 403 },
      );
    }

    const body = (await req.json()) as { provider?: unknown };
    if (!isValidProvider(body.provider)) {
      return NextResponse.json(
        { error: "Invalid provider", validProviders: VALID_PROVIDERS },
        { status: 400 },
      );
    }

    const result = await validateScrapingProviderKey(
      workspace.id,
      body.provider,
    );

    return NextResponse.json({ result });
  } catch (error) {
    console.error(
      "[POST /api/workspace/scraping-provider-connections/validate]",
      error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
