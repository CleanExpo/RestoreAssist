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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check subscription status - external integrations require paid subscription
    const subscriptionCheck = await checkIntegrationAccess(session.user.id);
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
      return NextResponse.json(
        { error: `Invalid provider: ${providerParam}` },
        { status: 400 },
      );
    }

    const config = PROVIDER_CONFIG[provider];

    // Check if integration already exists for this user/provider
    let integration = await prisma.integration.findFirst({
      where: {
        userId: session.user.id,
        provider,
      },
    });

    // Create integration record if it doesn't exist
    if (!integration) {
      integration = await prisma.integration.create({
        data: {
          userId: session.user.id,
          provider,
          name: config.name,
          icon: config.icon,
          status: "DISCONNECTED",
        },
      });
    }

    // ── Ascora shortcut: static API key auth, no OAuth redirect needed ────
    // Ascora uses a simple API key in the `Auth:` header (not OAuth).
    // The key is stored in ASCORA_API_KEY env var. "Connecting" just means
    // marking the Integration record as CONNECTED so the orchestrator finds it.
    if (provider === "ASCORA") {
      if (!process.env.ASCORA_API_KEY) {
        return NextResponse.json(
          {
            error:
              "ASCORA_API_KEY is not configured. Add it in Vercel environment variables under Administration → API Settings in Ascora.",
          },
          { status: 500 },
        );
      }

      await prisma.integration.update({
        where: { id: integration.id },
        data: { status: "CONNECTED", syncError: null },
      });

      // Return a redirect URL that the frontend can navigate to directly
      const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
      return NextResponse.json({
        authUrl: `${baseUrl}/dashboard/integrations?success=ascora`,
        integrationId: integration.id,
        connected: true,
      });
    }

    // Generate OAuth state (RA-1285: now async — DB-backed nonce)
    const state = await generateOAuthState(session.user.id, provider);

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
      where: { id: integration.id },
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
    console.error("OAuth connect error:", error);
    return NextResponse.json(
      { error: "Failed to initiate OAuth flow" },
      { status: 500 },
    );
  }
}
