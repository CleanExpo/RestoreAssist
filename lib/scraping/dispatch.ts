/**
 * RA-2975 — Scraping dispatch layer.
 *
 * Resolves the workspace's active scraping provider (RA-2966) and routes
 * an HTML fetch through the corresponding adapter. Falls back to the
 * caller-supplied SHARED fetch path when there is no configured BYOK provider.
 * A configured BYOK provider fails closed instead of crossing a credential or
 * contractual boundary. Platform Apify may fall back to shared fetch on:
 *   - No workspace
 *   - No active provider / provider = SHARED
 *   - Platform adapter throws (network, auth, bad response)
 *
 * On adapter failure the provider connection's `lastError` is updated so
 * the workspace admin sees what went wrong in the settings UI.
 */

import { prisma } from "../prisma";
import { getActiveScrapingProvider } from "../workspace/scraping-provider-connections";
import { fetchViaApify, resolveApifyToken } from "./providers/apify";
import { fetchViaBrightData } from "./providers/brightdata";
import { fetchViaFirecrawl } from "./providers/firecrawl";
import { fetchViaZyte } from "./providers/zyte";

export interface FetchResult {
  html: string;
  status: number;
}

export interface DispatchResult extends FetchResult {
  /** Which path served the request — for logging + telemetry. */
  providerUsed: "APIFY" | "BRIGHTDATA" | "ZYTE" | "FIRECRAWL" | "SHARED";
  /** True when a BYOK provider was attempted but fell back to SHARED. */
  fellBack: boolean;
}

type SharedFetchFn = (url: string) => Promise<FetchResult>;

/**
 * Resolve a user's workspace ID. Returns null if the user has no workspace.
 * Light-weight — does not call checkPaymentGate (which has billing-side
 * effects); we just need the ID to look up scraping credentials.
 */
async function resolveWorkspaceId(userId: string): Promise<string | null> {
  const workspace = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    select: { id: true },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  if (workspace) return workspace.id;

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, status: "ACTIVE" },
    select: { workspaceId: true },
    orderBy: { createdAt: "asc" },
  });
  return membership?.workspaceId ?? null;
}

async function recordProviderError(
  workspaceId: string,
  provider: "APIFY" | "BRIGHTDATA" | "ZYTE" | "FIRECRAWL",
  errorMessage: string,
): Promise<void> {
  try {
    await prisma.scrapingProviderConnection.updateMany({
      where: { workspaceId, provider },
      data: { lastError: errorMessage, lastValidatedAt: new Date() },
    });
  } catch (err) {
    console.error("[dispatch] failed to record provider error:", err);
  }
}

/**
 * Fetch HTML via the workspace's configured scraping provider. A BYOK failure
 * returns a synthetic 503; only platform/shared dispatch may fall back.
 */
async function fetchViaPlatformApify(url: string): Promise<FetchResult | null> {
  const token = resolveApifyToken();
  if (!token) return null;
  return fetchViaApify(url, token);
}

export async function fetchHtmlViaWorkspaceProvider(
  url: string,
  userId: string,
  sharedFetch: SharedFetchFn,
): Promise<DispatchResult> {
  const workspaceId = await resolveWorkspaceId(userId);
  const active = workspaceId
    ? await getActiveScrapingProvider(workspaceId)
    : null;

  if (active && active.provider !== "SHARED") {
    try {
      const result = await dispatchByProvider(url, active);
      return { ...result, providerUsed: active.provider, fellBack: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.warn(
        `[dispatch] BYOK provider ${active.provider} failed — trying platform Apify, then direct fetch: ${message}`,
      );
      if (workspaceId) {
        await recordProviderError(workspaceId, active.provider, message);
      }
      // A configured BYOK connection is a legal/account boundary. Do not
      // silently reroute its request through platform or shared credentials.
      return {
        html: "",
        status: 503,
        providerUsed: active.provider,
        fellBack: false,
      };
    }
  }

  try {
    const platform = await fetchViaPlatformApify(url);
    if (platform) {
      return {
        ...platform,
        providerUsed: "APIFY",
        fellBack: Boolean(active && active.provider !== "SHARED"),
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn(
      `[dispatch] platform Apify failed — falling back to direct fetch: ${message}`,
    );
  }

  const result = await sharedFetch(url);
  return {
    ...result,
    providerUsed: "SHARED",
    fellBack:
      Boolean(active && active.provider !== "SHARED") ||
      Boolean(resolveApifyToken()),
  };
}

async function dispatchByProvider(
  url: string,
  active: NonNullable<Awaited<ReturnType<typeof getActiveScrapingProvider>>>,
): Promise<FetchResult> {
  switch (active.provider) {
    case "APIFY":
      return fetchViaApify(url, active.apiKey);
    case "BRIGHTDATA":
      return fetchViaBrightData(
        url,
        active.apiKey,
        (active.config ?? null) as { zone?: string } | null,
      );
    case "ZYTE":
      return fetchViaZyte(url, active.apiKey);
    case "FIRECRAWL":
      return fetchViaFirecrawl(url, active.apiKey);
    case "SHARED":
      throw new Error("dispatchByProvider should not be called with SHARED");
    default: {
      const _exhaustive: never = active.provider;
      throw new Error(`Unknown scraping provider: ${_exhaustive as string}`);
    }
  }
}
