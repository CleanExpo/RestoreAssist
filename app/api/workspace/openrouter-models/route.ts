/**
 * GET /api/workspace/openrouter-models
 *
 * Returns the live OpenRouter model catalogue that backs the onboarding
 * "Add your AI key" model picker (Phase 3 — multi-provider BYOK).
 *
 * The upstream index is public, so no BYOK key is read or sent. The route is
 * still session-gated: it exists only to serve signed-in setup, and leaving it
 * open would make the app a free CORS proxy for OpenRouter.
 *
 * Never 5xxs on an upstream failure — it returns `unavailable: true` so the
 * picker degrades to a free-text slug field instead of blocking onboarding.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  fetchOpenRouterCatalogue,
  type OpenRouterCatalogue,
} from "@/lib/workspace/openrouter-catalogue";
import { apiError, fromException } from "@/lib/api-errors";
import { reportError } from "@/lib/observability";

const UNAVAILABLE: OpenRouterCatalogue = {
  recommended: [],
  models: [],
  unavailable: true,
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // The catalogue helper is written not to throw, but the route must not
    // DEPEND on that: a 5xx here would surface as a broken onboarding step for
    // an optional convenience. Any failure degrades to the same `unavailable`
    // payload the card already handles, and is reported for observability so
    // the degradation is never silent.
    let catalogue: OpenRouterCatalogue;
    try {
      catalogue = await fetchOpenRouterCatalogue();
    } catch (error) {
      reportError(error, {
        route: "/api/workspace/openrouter-models",
        stage: "catalogue",
      });
      catalogue = UNAVAILABLE;
    }

    return NextResponse.json(catalogue);
  } catch (error) {
    return fromException(req, error, { stage: "openrouter-models" });
  }
}
