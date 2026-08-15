/**
 * OAuth Connect Route
 * POST /api/integrations/oauth/[provider]/connect
 * Initiates OAuth flow for the specified provider
 *
 * REQUIRES: Active paid subscription
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateOAuthState,
  generatePKCE,
  PROVIDER_CONFIG,
  type IntegrationProvider,
} from "@/lib/integrations/oauth-handler";
import { getProviderAuthUrl } from "@/lib/integrations";
import {
  checkIntegrationAccess,
  createSubscriptionRequiredResponse,
} from "@/lib/integrations/subscription-guard";
import { isIntegrationDevMode } from "@/lib/integrations/dev-mode";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { requireAddon } from "@/lib/entitlements";
import {
  BOOKKEEPING_SKU,
  isBookkeepingProvider,
} from "@/lib/billing/bookkeeping-addon";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-1266: prevents duplicate OAuth state rows + duplicate Integration
  // records when the user double-clicks "Connect".
  return withIdempotency(request, userId, async () => {
    try {
      const subscriptionCheck = await checkIntegrationAccess(userId);
      if (!subscriptionCheck.isAllowed) {
        return NextResponse.json(
          createSubscriptionRequiredResponse(subscriptionCheck),
          { status: 403 },
        );
      }

      const { provider: providerParam } = await params;
      const provider = providerParam.toUpperCase() as IntegrationProvider;

      // Validate provider
      if (!PROVIDER_CONFIG[provider]) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Invalid provider: ${providerParam}`,
          status: 400,
        });
      }

      // ── Ascora is NOT served by this generic OAuth route ──────────────────
      // Ascora uses static API key auth, not OAuth, and has a canonical
      // implementation at /api/ascora/connect which enforces the SERVICE_CRM
      // add-on server-side and probes the key with a live request before
      // marking the integration CONNECTED.
      //
      // The shortcut that used to live here marked CONNECTED on the mere
      // presence of the ASCORA_API_KEY env var — no entitlement check and no
      // proof the key worked. It then handed the record to a generic sync that
      // authenticates with OAuth bearer tokens, so every sync died with "No
      // access token available" against an integration the UI showed as
      // connected. Refuse here rather than reimplement; one canonical path.
      //
      // The refusal must precede every Integration read and write below: a
      // rejected attempt that still created a DISCONNECTED ASCORA row would
      // seed the exact legacy record this route no longer knows how to serve.
      if (provider === "ASCORA") {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "Ascora does not use OAuth. Use /api/ascora/connect, which enforces the Service CRM add-on and verifies the API key.",
          status: 400,
        });
      }

      const config = PROVIDER_CONFIG[provider];

      // RA-6920 B3 — connecting Xero/QuickBooks/MYOB requires the BOOKKEEPING
      // add-on. Existing connections are grandfathered (see
      // scripts/grandfather-bookkeeping-addon.ts) so this only blocks NEW
      // connections for workspaces that never had one.
      if (isBookkeepingProvider(provider)) {
        const addonGate = await requireAddon(userId, BOOKKEEPING_SKU);
        if (!addonGate.allowed) return addonGate.response;
      }

      // Check if integration already exists for this user/provider
      let integration = await prisma.integration.findFirst({
        where: {
          userId: userId,
          provider,
        },
      });

      // Create integration record if it doesn't exist
      if (!integration) {
        integration = await prisma.integration.create({
          data: {
            userId: userId,
            provider,
            name: config.name,
            icon: config.icon,
            status: "DISCONNECTED",
          },
        });
      }

      // Generate OAuth state (RA-1285: now async — DB-backed nonce)
      const state = await generateOAuthState(userId, provider);

      // Generate PKCE if required
      let codeVerifier: string | undefined;
      let codeChallenge: string | undefined;

      if (config.usePKCE) {
        const pkce = generatePKCE();
        codeVerifier = pkce.codeVerifier;
        codeChallenge = pkce.codeChallenge;
      }

      // Build redirect URI
      const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
      const redirectUri = `${baseUrl}/api/integrations/oauth/${providerParam.toLowerCase()}/callback`;

      // Get auth URL
      const authUrl = getProviderAuthUrl(
        provider,
        integration.id,
        redirectUri,
        state,
        codeChallenge,
      );

      // Store state and code verifier in integration for callback validation
      await prisma.integration.update({
        where: { id: integration.id, userId },
        data: {
          config: JSON.stringify({
            oauthState: state,
            codeVerifier,
            redirectUri,
          }),
        },
      });

      // In dev mode, return a mock callback URL that will immediately complete
      if (isIntegrationDevMode()) {
        const mockCallbackUrl = `${baseUrl}/api/integrations/oauth/${providerParam.toLowerCase()}/callback?code=mock-auth-code&state=${encodeURIComponent(state)}`;
        return NextResponse.json({
          authUrl: mockCallbackUrl,
          integrationId: integration.id,
          devMode: true,
        });
      }

      return NextResponse.json({
        authUrl,
        integrationId: integration.id,
      });
    } catch (error) {
      return fromException(request, error, { stage: "integration-connect" });
    }
  });
}
