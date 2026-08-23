"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Crown,
  RefreshCw,
  Loader2,
  ExternalLink,
  Download,
  BarChart2,
  Briefcase,
  Zap,
  Network,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { isCapacitorIOS } from "@/lib/capacitor";
import BillingGate from "@/components/capacitor/BillingGate";
import Image from "next/image";
import ImportModal from "@/components/integrations/ImportModal";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import {
  isUiAiKeyType,
  mismatchedKeyType,
  uiAiKeyTypeToProvider,
  UI_AI_KEY_TYPES,
  type UiAiKeyType,
} from "@/lib/workspace/ai-key-type";
import OpenRouterModelField from "@/components/integrations/OpenRouterModelField";
import { apiErrorMessage } from "@/lib/api-error-message";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/EmptyState";

interface Integration {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  apiKey?: string;
  config?: string;
  createdAt: string;
  updatedAt: string;
}

interface ExternalIntegration {
  provider: string;
  connected: boolean;
  // UNAVAILABLE is explicitly "this provider's status source did not answer",
  // which is not the same as DISCONNECTED. It is per-provider on purpose: the
  // OAuth providers and Ascora are served by different endpoints, so one
  // outage must never speak for the other's cards.
  status: "CONNECTED" | "DISCONNECTED" | "ERROR" | "SYNCING" | "UNAVAILABLE";
  lastSyncAt?: string;
  syncError?: string;
  counts?: {
    clients: number;
    jobs: number;
  };
}

type ProviderSlug = "xero" | "quickbooks" | "myob" | "servicem8" | "ascora";

const EXTERNAL_INTEGRATIONS: {
  slug: ProviderSlug;
  name: string;
  description: string;
  icon: string;
  logo: string;
  category: "bookkeeping" | "jobmanagement";
  comingSoon?: boolean;
  // RA-1248 — OAuth + token refresh implemented in lib/integrations/<slug>/
  // but not yet E2E-verified against a real production tenant. Signals to
  // users that the connection may still have rough edges.
  betaUnverified?: boolean;
}[] = [
  // RA-1257: descriptions rewritten as outcome-led benefit blurbs. Adoption
  // is a retention lever — tell users WHY each integration matters instead
  // of what it does technically. Xero listed first (largest AU market).
  {
    slug: "xero",
    name: "Xero",
    description:
      "Auto-sync invoices + payments — saves ~3 hrs/week of manual entry. Most popular for AU contractors.",
    icon: "[ra:invoice]",
    logo: "/integrations/xero.svg",
    category: "bookkeeping",
  },
  {
    slug: "myob",
    name: "MYOB",
    description:
      "Push invoices straight into your AccountRight ledger. No more CSV exports.",
    icon: "[ra:invoice]",
    logo: "/integrations/myob.svg",
    category: "bookkeeping",
    betaUnverified: true,
  },
  {
    slug: "quickbooks",
    name: "QuickBooks",
    description:
      "Customers + invoices stay in sync both ways — quote here, paid there.",
    icon: "[ra:invoice]",
    logo: "/integrations/quickbooks.svg",
    category: "bookkeeping",
    betaUnverified: true,
  },
  {
    slug: "servicem8",
    name: "ServiceM8",
    description:
      "Pull active jobs into RestoreAssist so technicians start with real data.",
    icon: "[ra:job]",
    logo: "/integrations/servicem8.svg",
    category: "jobmanagement",
    betaUnverified: true,
  },
  {
    slug: "ascora",
    name: "Ascora",
    description:
      "Import work orders + line-item history from Ascora for scope generation.",
    icon: "[ra:job]",
    logo: "/integrations/ascora.svg",
    category: "jobmanagement",
  },
];

/**
 * The AI providers this page can hold a BYOK key for, and the copy each one
 * renders. One table, so the picker options, the legacy Integration row this
 * page writes, and the AI-row recogniser below can never disagree — before
 * this, adding a provider meant editing five ternaries and a name set.
 *
 * `name` is what handleAddIntegration writes to the legacy Integration row; it
 * must stay within the `nameContains` filter in getIntegrationsForUser
 * (lib/ai-provider.ts) or the saved key becomes invisible to report generation.
 */
const AI_PROVIDER_META: Record<
  UiAiKeyType,
  {
    option: string;
    vendor: string;
    /** Indefinite article for `vendor`, so the refusal copy reads as English. */
    article: string;
    name: string;
    description: string;
  }
> = {
  anthropic: {
    option: "Anthropic Claude",
    vendor: "Anthropic",
    article: "an",
    name: "Anthropic Claude",
    description: "AI-powered report generation with Claude",
  },
  openai: {
    option: "OpenAI GPT",
    vendor: "OpenAI",
    article: "an",
    name: "OpenAI GPT",
    description: "AI-powered report generation with GPT",
  },
  gemini: {
    option: "Google Gemini",
    vendor: "Gemini",
    article: "a",
    name: "Google Gemini",
    description: "AI-powered report generation with Gemini",
  },
  openrouter: {
    option: "OpenRouter (open models)",
    vendor: "OpenRouter",
    article: "an",
    name: "OpenRouter",
    description: "AI-powered report generation with open models via OpenRouter",
  },
};

/**
 * The key type a stored AI row's name denotes — the inverse of
 * `AI_PROVIDER_META[t].name`, which is what this page wrote when the row was
 * created. Returns null for anything it does not recognise.
 */
function keyTypeForIntegrationName(name: string | null | undefined): UiAiKeyType | null {
  const n = (name ?? "").trim().toLowerCase();
  return (
    UI_AI_KEY_TYPES.find((t) => AI_PROVIDER_META[t].name.toLowerCase() === n) ??
    null
  );
}

/**
 * Refusal copy for a key whose own prefix contradicts the selected provider,
 * or null when there is no confident disagreement. Naming both vendors is the
 * point — the operator has to be told WHICH one to switch to.
 */
function keyProviderMismatchMessage(
  selected: UiAiKeyType,
  apiKey: string,
): string | null {
  const implied = mismatchedKeyType(selected, apiKey);
  if (!implied) return null;
  const found = AI_PROVIDER_META[implied];
  const picked = AI_PROVIDER_META[selected];
  return `That looks like ${found.article} ${found.vendor} key, but ${picked.option} is selected. Pick ${found.option}, or paste ${picked.article} ${picked.vendor} key.`;
}

/**
 * The legacy Integration table is shared bookkeeping: AI keys live there, and
 * so do external job/accounting providers. Its `provider` column cannot
 * discriminate them — an AI row can carry XERO — so categorise POSITIVELY by
 * the names this page itself writes in handleAddIntegration. Anything not on
 * this list is not an AI provider and must never render with AI key controls.
 */
const AI_INTEGRATION_NAMES = new Set(
  UI_AI_KEY_TYPES.map((t) => AI_PROVIDER_META[t].name.toLowerCase()),
);

/**
 * The OAuth providers' status lives in /api/integrations. Ascora's does not:
 * its canonical record is AscoraIntegration, read through GET
 * /api/ascora/connect (which never returns the key). A legacy Integration row
 * for ASCORA is stale bookkeeping and must not decide whether Ascora is
 * connected. Two sources, so two loaders that fail independently.
 */
async function loadGenericIntegrationStatuses() {
  const response = await fetch("/api/integrations");
  if (!response.ok) {
    throw new Error("External integration status request failed");
  }
  const data = await response.json();
  return Array.isArray(data?.integrations) ? data.integrations : [];
}

async function loadAscoraIntegrationStatus() {
  const response = await fetch("/api/ascora/connect");
  if (!response.ok) {
    throw new Error("Ascora status request failed");
  }
  const data = await response.json();
  return data?.integration ?? null;
}

interface SubscriptionStatus {
  subscriptionStatus?: "TRIAL" | "ACTIVE" | "CANCELED" | "EXPIRED" | "PAST_DUE";
  subscriptionPlan?: string;
}

export default function IntegrationsPage() {
  const confirm = useConfirmDialog();
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "true";
  const successMessage = searchParams.get("success");
  const errorMessage = searchParams.get("error");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  // Only rows this page recognises as AI providers render under "AI Providers"
  // with AI key controls. Excluding the known external providers is not enough
  // — any other row (a future provider, a hand-written record) would still
  // reach the AI card and its "Update Key" button under a Claude icon.
  const aiIntegrations = integrations.filter((i) =>
    AI_INTEGRATION_NAMES.has((i.name ?? "").trim().toLowerCase()),
  );
  const [externalIntegrations, setExternalIntegrations] = useState<
    Record<ProviderSlug, ExternalIntegration>
  >({} as Record<ProviderSlug, ExternalIntegration>);
  const [externalIntegrationsLoading, setExternalIntegrationsLoading] =
    useState(true);
  const [externalIntegrationsError, setExternalIntegrationsError] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [syncingProvider, setSyncingProvider] = useState<ProviderSlug | null>(
    null,
  );
  const [showApiModal, setShowApiModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIntegration, setSelectedIntegration] =
    useState<Integration | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyType, setApiKeyType] = useState<UiAiKeyType>("anthropic");
  // OpenRouter routing slug. Blank is valid — the server falls back to
  // OPENROUTER_MODEL. Ignored by the fixed-vendor providers.
  const [apiKeyModel, setApiKeyModel] = useState("");
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(
    null,
  );
  const [newApiKeyType, setNewApiKeyType] = useState<UiAiKeyType>("anthropic");
  const [newApiKey, setNewApiKey] = useState("");
  const [newApiKeyModel, setNewApiKeyModel] = useState("");
  // Ascora authenticates with a per-user static API key, so connecting it means
  // collecting that key here and POSTing it to the canonical route. The key is
  // held only for the duration of one attempt and is never rendered back.
  const [showAscoraModal, setShowAscoraModal] = useState(false);
  const [ascoraApiKey, setAscoraApiKey] = useState("");
  const [ascoraConnecting, setAscoraConnecting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // DR-NRPG state
  interface DrNrpgStatus {
    connected: boolean;
    webhookUrl?: string;
    lastSyncAt?: string;
  }
  const [drNrpg, setDrNrpg] = useState<DrNrpgStatus>({ connected: false });
  const [showDrNrpgModal, setShowDrNrpgModal] = useState(false);
  const [drNrpgApiKey, setDrNrpgApiKey] = useState("");
  const [drNrpgBaseUrl, setDrNrpgBaseUrl] = useState("");
  const [drNrpgConnecting, setDrNrpgConnecting] = useState(false);
  const [drNrpgWebhookUrl, setDrNrpgWebhookUrl] = useState("");
  const [drNrpgWebhookSecret, setDrNrpgWebhookSecret] = useState("");
  const [drNrpgCopied, setDrNrpgCopied] = useState<"url" | "secret" | null>(
    null,
  );

  // Show success/error messages from OAuth callback
  useEffect(() => {
    if (successMessage) {
      toast.success(successMessage);
      router.replace("/dashboard/integrations");
    }
    if (errorMessage) {
      toast.error(errorMessage);
      router.replace("/dashboard/integrations");
    }
  }, [successMessage, errorMessage, router]);

  // Fetch integrations and subscription status once authenticated — avoids
  // noisy 401s during the NextAuth loading → authenticated race on mount.
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetchIntegrations();
    fetchExternalIntegrations();
    fetchSubscriptionStatus();
    fetchDrNrpg();
  }, [sessionStatus]);

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch("/api/user/profile", {
        credentials: "include",
      });
      if (response.status === 401) return;
      if (response.ok) {
        const data = await response.json();
        setSubscription({
          subscriptionStatus: data.profile?.subscriptionStatus,
          subscriptionPlan: data.profile?.subscriptionPlan,
        });
      }
    } catch (error) {
      console.error("Error fetching subscription status:", error);
    }
  };

  const hasActiveSubscription = () => {
    return subscription?.subscriptionStatus === "ACTIVE";
  };

  const fetchExternalIntegrations = async () => {
    setExternalIntegrationsLoading(true);
    setExternalIntegrationsError(null);
    try {
      const results: Record<ProviderSlug, ExternalIntegration> = {} as Record<
        ProviderSlug,
        ExternalIntegration
      >;

      // allSettled, not await-in-sequence: an Ascora outage must not abort the
      // generic request, and neither failure may blank the other's cards.
      const [genericResult, ascoraResult] = await Promise.allSettled([
        loadGenericIntegrationStatuses(),
        loadAscoraIntegrationStatus(),
      ]);

      if (genericResult.status === "rejected") {
        console.error(
          "Error fetching external integrations:",
          genericResult.reason,
        );
      }
      if (ascoraResult.status === "rejected") {
        console.error("Error fetching Ascora status:", ascoraResult.reason);
      }

      // A successful response makes an absent provider confidently disconnected;
      // a failed one makes only that provider's own cards unavailable.
      for (const integration of EXTERNAL_INTEGRATIONS) {
        if (integration.slug === "ascora") {
          if (ascoraResult.status === "rejected") {
            results.ascora = {
              provider: integration.name,
              connected: false,
              status: "UNAVAILABLE",
            };
            continue;
          }
          const ascoraRecord = ascoraResult.value;
          results.ascora = {
            provider: integration.name,
            connected: Boolean(ascoraRecord?.isActive),
            status: ascoraRecord?.isActive ? "CONNECTED" : "DISCONNECTED",
            lastSyncAt: ascoraRecord?.lastSyncAt,
          };
          continue;
        }

        if (genericResult.status === "rejected") {
          results[integration.slug] = {
            provider: integration.name,
            connected: false,
            status: "UNAVAILABLE",
          };
          continue;
        }

        const found = genericResult.value.find(
          (i: { provider: string }) =>
            i.provider === integration.slug.toUpperCase(),
        );
        if (found) {
          // ERROR/SYNCING still have OAuth tokens — treat as connected so Sync
          // and Disconnect remain available (retry clears ERROR → CONNECTED).
          const hasLink =
            found.status === "CONNECTED" ||
            found.status === "ERROR" ||
            found.status === "SYNCING";
          results[integration.slug] = {
            provider: integration.name,
            connected: hasLink,
            status: found.status,
            lastSyncAt: found.lastSyncAt,
            syncError: found.syncError,
          };
        } else {
          results[integration.slug] = {
            provider: integration.name,
            connected: false,
            status: "DISCONNECTED",
          };
        }
      }

      setExternalIntegrations(results);

      // The banner reports which providers went dark; it never gates the cards
      // that answered. Per-card actionability comes from that card's own status.
      const unavailable = EXTERNAL_INTEGRATIONS.filter(
        (integration) => results[integration.slug].status === "UNAVAILABLE",
      ).map((integration) => integration.name);

      if (unavailable.length === EXTERNAL_INTEGRATIONS.length) {
        setExternalIntegrationsError(
          "Integration status is unavailable. Retry before connecting or disconnecting.",
        );
      } else if (unavailable.length > 0) {
        setExternalIntegrationsError(
          `Some integration statuses are unavailable (${unavailable.join(", ")}). Every other integration is unaffected.`,
        );
      }
    } catch (error) {
      // Backstop for an unexpected shape rather than a failed request. The
      // cards read their own status, so a total failure has to write
      // UNAVAILABLE into every one of them — a banner alone would leave stale
      // state looking actionable.
      console.error("Error fetching external integrations:", error);
      setExternalIntegrations(
        Object.fromEntries(
          EXTERNAL_INTEGRATIONS.map((integration) => [
            integration.slug,
            {
              provider: integration.name,
              connected: false,
              status: "UNAVAILABLE" as const,
            },
          ]),
        ) as Record<ProviderSlug, ExternalIntegration>,
      );
      setExternalIntegrationsError(
        "Integration status is unavailable. Retry before connecting or disconnecting.",
      );
    } finally {
      setExternalIntegrationsLoading(false);
    }
  };

  // OAuth providers only. Ascora is static-API-key and connects through
  // handleConnectAscora, which collects the key and drives /api/ascora/connect.
  const handleConnectExternal = async (slug: ProviderSlug) => {
    try {
      const response = await fetch(`/api/integrations/oauth/${slug}/connect`, {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authUrl) {
          window.location.href = data.authUrl;
        }
      } else if (response.status === 403) {
        // Subscription required - show upgrade modal
        const errorData = await response.json();
        if (errorData.upgradeRequired) {
          setShowUpgradeModal(true);
        } else {
          toast.error(apiErrorMessage(errorData) ?? "Access denied");
        }
      } else {
        const errorData = await response.json();
        toast.error(
          apiErrorMessage(errorData) ?? "Failed to initiate connection",
        );
      }
    } catch (error) {
      console.error("Error connecting:", error);
      toast.error("Failed to initiate connection");
    }
  };

  /**
   * Connect Ascora with a user-supplied API key.
   *
   * POSTs `{ apiKey }` to the canonical /api/ascora/connect, which enforces the
   * Service CRM add-on, probes the key against Ascora and stores it encrypted.
   * The key is cleared from component state on every completion path, and is
   * never written back into the UI or a URL.
   */
  const handleConnectAscora = async () => {
    const key = ascoraApiKey.trim();
    if (!key) {
      toast.error("API key is required");
      return;
    }

    setAscoraConnecting(true);
    try {
      const response = await fetch("/api/ascora/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setShowAscoraModal(false);
        toast.success("Ascora connected");
        fetchExternalIntegrations();
      } else {
        toast.error(apiErrorMessage(data) ?? "Failed to connect to Ascora");
      }
    } catch (error) {
      console.error("Error connecting Ascora:", error);
      toast.error("Failed to connect to Ascora");
    } finally {
      // The key never outlives the attempt it was entered for.
      setAscoraApiKey("");
      setAscoraConnecting(false);
    }
  };

  const handleDisconnectExternal = async (slug: ProviderSlug) => {
    try {
      // Ascora disconnects via DELETE on its canonical route.
      const response =
        slug === "ascora"
          ? await fetch("/api/ascora/connect", { method: "DELETE" })
          : await fetch(`/api/integrations/oauth/${slug}/disconnect`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });

      if (response.ok) {
        toast.success(
          `Disconnected from ${EXTERNAL_INTEGRATIONS.find((i) => i.slug === slug)?.name}`,
        );
        fetchExternalIntegrations();
      } else {
        const data = await response.json();
        toast.error(apiErrorMessage(data) ?? "Failed to disconnect");
      }
    } catch (error) {
      console.error("Error disconnecting:", error);
      toast.error("Failed to disconnect integration");
    }
  };

  const handleSyncExternal = async (slug: ProviderSlug) => {
    setSyncingProvider(slug);
    try {
      // Ascora syncs through its canonical static-key route; the generic
      // OAuth sync authenticates with bearer tokens Ascora never issues.
      const response = await fetch(
        slug === "ascora"
          ? "/api/ascora/sync"
          : `/api/integrations/oauth/${slug}/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ syncClients: true, syncJobs: true }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (slug === "ascora") {
          // The canonical route returns its own receipt — `message` on every
          // success branch, plus jobsImported / lineItemsForImport /
          // rateCardPartsUpserted. It never returns clientsSynced/jobsSynced,
          // so the generic renderer reports a real import as "0 clients and
          // 0 jobs". Zero counts are legitimate on an incremental run, so
          // nothing here treats them as failure.
          toast.success(
            typeof data.message === "string" && data.message
              ? data.message
              : `Imported ${data.jobsImported ?? 0} jobs, ${data.lineItemsForImport ?? 0} line items and ${data.rateCardPartsUpserted ?? 0} rate card parts`,
          );
        } else {
          const clientsCount = data.clientsSynced || 0;
          const jobsCount = data.jobsSynced || 0;
          toast.success(`Synced ${clientsCount} clients and ${jobsCount} jobs`);
        }
        fetchExternalIntegrations();
      } else if (response.status === 403) {
        // Subscription required
        const data = await response.json();
        if (data.upgradeRequired) {
          setShowUpgradeModal(true);
        } else {
          toast.error(apiErrorMessage(data) ?? "Access denied");
        }
      } else {
        const data = await response.json();
        toast.error(apiErrorMessage(data) ?? "Sync failed");
      }
    } catch (error) {
      console.error("Error syncing:", error);
      toast.error("Failed to sync integration");
    } finally {
      setSyncingProvider(null);
    }
  };

  const fetchDrNrpg = async () => {
    try {
      const res = await fetch("/api/dr-nrpg/connect");
      if (res.ok) {
        const data = await res.json();
        if (data.integration) {
          setDrNrpg({
            connected: data.integration.isActive,
            webhookUrl: data.integration.webhookUrl,
            lastSyncAt: data.integration.lastSyncAt,
          });
          setDrNrpgWebhookUrl(data.integration.webhookUrl ?? "");
        }
      }
    } catch {
      // non-critical
    }
  };

  const handleConnectDrNrpg = async () => {
    if (!drNrpgApiKey.trim()) {
      toast.error("API key is required");
      return;
    }
    setDrNrpgConnecting(true);
    try {
      const res = await fetch("/api/dr-nrpg/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drNrpgApiKey: drNrpgApiKey.trim(),
          drNrpgBaseUrl: drNrpgBaseUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setDrNrpgWebhookUrl(data.webhookUrl ?? "");
        setDrNrpgWebhookSecret(data.webhookSecret ?? "");
        setDrNrpg({ connected: true, webhookUrl: data.webhookUrl });
        toast.success(
          "DR-NRPG connected! Copy your webhook URL and secret below.",
        );
        setDrNrpgApiKey("");
      } else {
        toast.error(apiErrorMessage(data) ?? "Failed to connect");
      }
    } catch {
      toast.error("Failed to connect to DR-NRPG");
    } finally {
      setDrNrpgConnecting(false);
    }
  };

  const handleDisconnectDrNrpg = async () => {
    try {
      const res = await fetch("/api/dr-nrpg/connect", { method: "DELETE" });
      if (res.ok) {
        setDrNrpg({ connected: false });
        setDrNrpgWebhookUrl("");
        setDrNrpgWebhookSecret("");
        setShowDrNrpgModal(false);
        toast.success("DR-NRPG disconnected");
      }
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const copyToClipboard = async (text: string, type: "url" | "secret") => {
    try {
      await navigator.clipboard.writeText(text);
      setDrNrpgCopied(type);
      setTimeout(() => setDrNrpgCopied(null), 2000);
    } catch {
      toast.error("Copy failed — please copy manually");
    }
  };

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/integrations");
      if (response.ok) {
        const data = await response.json();
        setIntegrations(data.integrations);
      } else {
        toast.error("Failed to fetch integrations");
      }
    } catch (error) {
      console.error("Error fetching integrations:", error);
      toast.error("Failed to fetch integrations");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = (integration: Integration) => {
    if (!hasActiveSubscription()) {
      setShowUpgradeModal(true);
      return;
    }

    setSelectedIntegration(integration);
    setApiKey("");
    setApiKeyModel("");
    // Seed the picker from THIS row on every open, before the config is even
    // consulted. Without it the modal keeps whatever provider the previously
    // opened integration selected, because a row with absent, malformed or
    // legacy double-encoded config supplies no apiKeyType to overwrite it. The
    // save would then POST the credential under the stale provider and — since
    // the PUT now writes the label too — rename this row to match it. The
    // mismatch guard does not save us: it only fires on a RECOGNISED prefix, so
    // an enterprise or proxy key would sail through.
    setApiKeyType(keyTypeForIntegrationName(integration.name) ?? "anthropic");
    if (integration.config) {
      try {
        // Rows written before the double-encoding fix parse back to a STRING,
        // not an object. Narrow before reading, so a legacy row falls back to
        // the defaults instead of reading properties off a primitive.
        const parsed: unknown = JSON.parse(integration.config);
        const config = (
          parsed && typeof parsed === "object" ? parsed : {}
        ) as Record<string, unknown>;
        if (isUiAiKeyType(config.apiKeyType)) {
          setApiKeyType(config.apiKeyType);
        }
        // The stored slug is a routing hint, not a credential, so it is safe to
        // pre-fill. Only OpenRouter has one.
        if (typeof config.model === "string") {
          setApiKeyModel(config.model);
        }
      } catch {
        // Use default
      }
    }
    setShowApiModal(true);
  };

  const handleSaveConnection = async () => {
    if (!selectedIntegration) return;

    if (!apiKey) {
      toast.error("API key is required");
      return;
    }

    const mismatch = keyProviderMismatchMessage(apiKeyType, apiKey);
    if (mismatch) {
      toast.error(mismatch);
      return;
    }

    try {
      const providerRes = await fetch("/api/workspace/provider-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: uiAiKeyTypeToProvider(apiKeyType),
          apiKey,
          ...(apiKeyType === "openrouter" && apiKeyModel.trim()
            ? { model: apiKeyModel.trim() }
            : {}),
        }),
      });

      if (!providerRes.ok) {
        const err = await providerRes.json().catch(() => ({}));
        // apiErrorMessage covers both `error` shapes; this route can also
        // answer with a bare top-level `message`, so that fallback is kept.
        toast.error(
          apiErrorMessage(err) ??
            (typeof err.message === "string"
              ? err.message
              : "Failed to save API key"),
        );
        return;
      }

      const config = {
        apiKeyType: apiKeyType,
        ...(apiKeyType === "openrouter" && apiKeyModel.trim()
          ? { model: apiKeyModel.trim() }
          : {}),
      };

      const response = await fetch(
        `/api/integrations/${selectedIntegration.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...selectedIntegration,
            // The provider picker can CHANGE the row's provider, so the label
            // has to follow it. Spreading selectedIntegration alone would keep
            // the old name, leaving a card titled "Anthropic Claude" holding an
            // OpenRouter key — and the modal's own copy, which is derived from
            // apiKeyType, disagreeing with the card behind it. Only AI rows
            // reach here (the list is `aiIntegrations`), so overwriting the
            // name cannot touch an external provider's row.
            name: AI_PROVIDER_META[apiKeyType].name,
            description: AI_PROVIDER_META[apiKeyType].description,
            apiKey,
            // Sent as an OBJECT, not a string. Both `/api/integrations`
            // handlers do `config ? JSON.stringify(config) : null`, so passing
            // an already-serialised string double-encodes it — and the parse in
            // handleConnect then yields a string whose `.apiKeyType` is
            // undefined. That is why the provider pre-fill has silently never
            // worked; the model pre-fill would have inherited it. This page is
            // the only writer of `config` on those routes.
            config,
            status: "CONNECTED",
          }),
        },
      );

      if (response.ok) {
        const updatedIntegration = await response.json();
        setIntegrations(
          integrations.map((int) =>
            int.id === selectedIntegration.id ? updatedIntegration : int,
          ),
        );
        setShowApiModal(false);
        toast.success("Integration updated successfully");

        if (isOnboarding) {
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const onboardingResponse = await fetch("/api/onboarding/status");
          if (onboardingResponse.ok) {
            const onboardingData = await onboardingResponse.json();
            if (onboardingData.nextStep) {
              const nextStepRoute =
                onboardingData.steps[onboardingData.nextStep]?.route;
              if (nextStepRoute) {
                toast.success("Step 2 complete! Redirecting to next step...", {
                  duration: 2000,
                });
                setTimeout(() => {
                  router.push(`${nextStepRoute}?onboarding=true`);
                }, 2000);
                return;
              }
            } else {
              toast.success("Onboarding complete! Redirecting to reports...", {
                duration: 2000,
              });
              setTimeout(() => {
                router.push("/dashboard/reports/new");
              }, 2000);
              return;
            }
          }
        }

        const pricingResponse = await fetch("/api/pricing-config");
        if (pricingResponse.ok) {
          const pricingData = await pricingResponse.json();
          if (!pricingData.pricingConfig) {
            toast("Redirecting to pricing configuration...");
            setTimeout(() => {
              router.push("/dashboard/pricing-config");
            }, 500);
          }
        }
      } else {
        toast.success(
          "AI key saved. Open Settings → AI Providers to manage keys.",
        );
        setShowApiModal(false);
      }
    } catch (error) {
      console.error("Error updating integration:", error);
      toast.error("Failed to update integration");
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      const response = await fetch(`/api/integrations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "DISCONNECTED",
          apiKey: null,
        }),
      });

      if (response.ok) {
        const updatedIntegration = await response.json();
        setIntegrations(
          integrations.map((int) => (int.id === id ? updatedIntegration : int)),
        );
        toast.success("Integration disconnected");
      } else {
        toast.error("Failed to disconnect integration");
      }
    } catch (error) {
      console.error("Error disconnecting integration:", error);
      toast.error("Failed to disconnect integration");
    }
  };

  const handleAddIntegration = async () => {
    if (!newApiKey) {
      toast.error("API key is required");
      return;
    }

    const mismatch = keyProviderMismatchMessage(newApiKeyType, newApiKey);
    if (mismatch) {
      toast.error(mismatch);
      return;
    }

    const newModelSlug =
      newApiKeyType === "openrouter" ? newApiKeyModel.trim() : "";

    try {
      const providerRes = await fetch("/api/workspace/provider-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: uiAiKeyTypeToProvider(newApiKeyType),
          apiKey: newApiKey,
          ...(newModelSlug ? { model: newModelSlug } : {}),
        }),
      });

      if (!providerRes.ok) {
        const err = await providerRes.json().catch(() => ({}));
        // Same normalisation as handleSaveConnection: structured envelope
        // first, legacy top-level `message` second, static fallback last.
        toast.error(
          apiErrorMessage(err) ??
            (typeof err.message === "string"
              ? err.message
              : "Failed to save API key"),
        );
        return;
      }

      const integrationData = {
        name: AI_PROVIDER_META[newApiKeyType].name,
        description: AI_PROVIDER_META[newApiKeyType].description,
        icon: "[ra:ai]",
        apiKey: newApiKey,
        // An object, for the same reason as the PUT above — the route
        // serialises it.
        config: {
          apiKeyType: newApiKeyType,
          ...(newModelSlug ? { model: newModelSlug } : {}),
        },
        status: "CONNECTED",
      };

      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrationData),
      });

      if (response.ok) {
        const newIntegration = await response.json();
        setIntegrations([newIntegration, ...integrations]);
        setNewApiKey("");
        setNewApiKeyModel("");
        setNewApiKeyType("anthropic");
        setShowAddModal(false);
        toast.success("Integration added successfully");

        if (isOnboarding) {
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const onboardingResponse = await fetch("/api/onboarding/status");
          if (onboardingResponse.ok) {
            const onboardingData = await onboardingResponse.json();
            if (onboardingData.nextStep) {
              const nextStepRoute =
                onboardingData.steps[onboardingData.nextStep]?.route;
              if (nextStepRoute) {
                toast.success("Step 2 complete! Redirecting to next step...", {
                  duration: 2000,
                });
                setTimeout(() => {
                  router.push(`${nextStepRoute}?onboarding=true`);
                }, 2000);
                return;
              }
            } else {
              toast.success("Onboarding complete! Redirecting to reports...", {
                duration: 2000,
              });
              setTimeout(() => {
                router.push("/dashboard/reports/new");
              }, 2000);
              return;
            }
          }
        }

        const pricingResponse = await fetch("/api/pricing-config");
        if (pricingResponse.ok) {
          const pricingData = await pricingResponse.json();
          if (!pricingData.pricingConfig) {
            toast("Redirecting to pricing configuration...");
            setTimeout(() => {
              router.push("/dashboard/pricing-config");
            }, 500);
          }
        }
      } else {
        toast.success(
          "AI key saved. Open Settings → AI Providers to manage keys.",
        );
        setNewApiKey("");
        setNewApiKeyModel("");
        setNewApiKeyType("anthropic");
        setShowAddModal(false);
      }
    } catch (error) {
      console.error("Error adding integration:", error);
      toast.error("Failed to add integration");
    }
  };

  const handleDeleteIntegration = async (id: string) => {
    const ok = await confirm.ask({
      title: "Delete integration?",
      description: "Are you sure you want to delete this integration?",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    try {
      const response = await fetch(`/api/integrations/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setIntegrations(integrations.filter((int) => int.id !== id));
        toast.success("Integration deleted successfully");
      } else {
        toast.error("Failed to delete integration");
      }
    } catch (error) {
      console.error("Error deleting integration:", error);
      toast.error("Failed to delete integration");
    }
  };

  return (
    <div className="space-y-8">
      <confirm.Mount />
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Integrations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your tools and services to Restore Assist
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportModal(true)}
          >
            <Download />
            Import Data
          </Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-600 hover:to-cyan-600 text-white border-0 shadow-sm"
            onClick={() => setShowAddModal(true)}
          >
            <Plus />
            Add Integration
          </Button>
        </div>
      </div>

      {/* ── Loading ─────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-muted-foreground" size={28} />
        </div>
      ) : (
        <>
          {/* ── AI Providers ─────────────────────────── */}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/10 dark:bg-violet-500/15 border border-violet-500/20">
                <Zap
                  size={16}
                  className="text-violet-600 dark:text-violet-400"
                />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  AI Providers
                </h2>
                <p className="text-xs text-muted-foreground">
                  Connect your AI API keys for report generation
                </p>
              </div>
            </div>
            <Separator className="mt-4 mb-5" />

            {aiIntegrations.length === 0 ? (
              <EmptyState
                icon={<Zap size={32} aria-hidden />}
                title="No AI integrations yet"
                description="Add your first API key to enable AI-powered report generation."
                primaryAction={{
                  label: "Add API Key",
                  onClick: () => setShowAddModal(true),
                }}
              />
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {aiIntegrations.map((integration) => (
                  <Card
                    key={integration.id}
                    className="group transition-all duration-200 hover:shadow-md dark:hover:shadow-black/30"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden shadow-md shadow-black/10 dark:shadow-black/30 ring-1 ring-white/10">
                          <Image
                            src="/integrations/claude.svg"
                            alt={integration.name}
                            width={48}
                            height={48}
                            className="object-contain"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm">
                              {integration.name}
                            </CardTitle>
                            {integration.status === "CONNECTED" ? (
                              <Badge className="shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">
                                Connected
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="shrink-0 text-xs"
                              >
                                Disconnected
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="mt-0.5 text-xs">
                            {integration.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter className="pt-0 gap-2">
                      {integration.status === "CONNECTED" ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleConnect(integration)}
                          >
                            Update Key
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive-subtle-foreground border-destructive-subtle-foreground/30 hover:bg-destructive-subtle dark:hover:bg-rose-500/10"
                            onClick={() => handleDisconnect(integration.id)}
                          >
                            Disconnect
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              handleDeleteIntegration(integration.id)
                            }
                          >
                            <Trash2 className="text-destructive size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
                            onClick={() => handleConnect(integration)}
                          >
                            Connect
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              handleDeleteIntegration(integration.id)
                            }
                          >
                            <Trash2 className="text-destructive size-3.5" />
                          </Button>
                        </>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {externalIntegrationsError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                <span>{externalIntegrationsError}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void fetchExternalIntegrations()}
              >
                Retry status
              </Button>
            </div>
          )}

          {/* ── Bookkeeping ──────────────────────────── */}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/20">
                <BarChart2
                  size={16}
                  className="text-blue-600 dark:text-blue-400"
                />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Bookkeeping
                </h2>
                <p className="text-xs text-muted-foreground">
                  Sync clients and invoices from your accounting platform
                </p>
              </div>
            </div>
            <Separator className="mt-4 mb-5" />
            <div className="grid md:grid-cols-3 gap-4">
              {EXTERNAL_INTEGRATIONS.filter(
                (i) => i.category === "bookkeeping",
              ).map((integration) => {
                const status = externalIntegrations[integration.slug];
                // Deliberately NOT the global banner: this card is actionable
                // whenever ITS status source answered, even if another did not.
                const isStatusKnown =
                  !externalIntegrationsLoading &&
                  Boolean(status) &&
                  status.status !== "UNAVAILABLE";
                const isConnected = status?.connected;
                const isSyncing =
                  syncingProvider === integration.slug ||
                  status?.status === "SYNCING";
                const hasError = status?.status === "ERROR";
                return (
                  <Card
                    key={integration.slug}
                    className="group transition-all duration-200 hover:shadow-md dark:hover:shadow-black/30 hover:-translate-y-0.5"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden shadow-md shadow-black/10 dark:shadow-black/30 ring-1 ring-white/10">
                          <Image
                            src={integration.logo}
                            alt={integration.name}
                            width={48}
                            height={48}
                            className="object-contain"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <CardTitle className="text-sm">
                              {integration.name}
                            </CardTitle>
                            {isConnected && (
                              <Badge className="shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">
                                Connected
                              </Badge>
                            )}
                            {hasError && (
                              <Badge
                                variant="destructive"
                                className="shrink-0 text-xs"
                              >
                                Error
                              </Badge>
                            )}
                            {integration.comingSoon && !isConnected && (
                              <Badge
                                variant="secondary"
                                className="shrink-0 text-xs"
                              >
                                Soon
                              </Badge>
                            )}
                            {integration.betaUnverified && !isConnected && (
                              <Badge
                                variant="outline"
                                className="shrink-0 text-xs border-amber-400/50 text-amber-600 dark:text-amber-400"
                                title="OAuth implemented but not yet verified against production. Connect at your own risk — please report issues."
                              >
                                Beta
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="mt-0.5 text-xs leading-relaxed">
                            {integration.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    {isConnected && (status?.counts || status?.lastSyncAt) && (
                      <CardContent className="pt-0 pb-3">
                        <Separator className="mb-3" />
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {status?.counts && (
                            <p>
                              {status.counts.clients} clients ·{" "}
                              {status.counts.jobs} jobs
                            </p>
                          )}
                          {status?.lastSyncAt && (
                            <p>
                              Last synced{" "}
                              {new Date(status.lastSyncAt).toLocaleDateString(
                                "en-AU",
                              )}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    )}
                    {hasError && status?.syncError && (
                      <CardContent className="pt-0 pb-3">
                        <div className="p-2 bg-destructive-subtle border border-destructive-subtle-foreground/30 rounded-md text-xs text-destructive-subtle-foreground">
                          {status.syncError}
                        </div>
                      </CardContent>
                    )}
                    <CardFooter className="pt-0 gap-2">
                      {!isStatusKnown ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          disabled
                        >
                          {externalIntegrationsLoading
                            ? "Checking status…"
                            : "Status unavailable"}
                        </Button>
                      ) : isConnected ? (
                        <>
                          <Button
                            size="sm"
                            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-600 hover:to-cyan-600 text-white border-0 shadow-sm"
                            onClick={() => handleSyncExternal(integration.slug)}
                            disabled={isSyncing}
                          >
                            {isSyncing ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <RefreshCw />
                            )}
                            {isSyncing ? "Syncing..." : "Sync"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive-subtle-foreground border-destructive-subtle-foreground/30 hover:bg-destructive-subtle dark:hover:bg-rose-500/10"
                            onClick={() =>
                              handleDisconnectExternal(integration.slug)
                            }
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : integration.comingSoon || integration.betaUnverified ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          disabled
                          title={
                            integration.betaUnverified
                              ? "OAuth exists but is not production-verified (RA-1248). Contact support if you need early access."
                              : undefined
                          }
                        >
                          {integration.betaUnverified
                            ? "Beta — not verified"
                            : "Coming Soon"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
                          onClick={() =>
                            handleConnectExternal(integration.slug)
                          }
                        >
                          <ExternalLink />
                          Connect
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* ── Job Management ───────────────────────── */}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-orange-500/10 dark:bg-orange-500/15 border border-orange-500/20">
                <Briefcase
                  size={16}
                  className="text-orange-600 dark:text-orange-400"
                />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Job Management
                </h2>
                <p className="text-xs text-muted-foreground">
                  Connect your field service and CRM platforms
                </p>
              </div>
            </div>
            <Separator className="mt-4 mb-5" />
            <div className="grid md:grid-cols-3 gap-4">
              {EXTERNAL_INTEGRATIONS.filter(
                (i) => i.category === "jobmanagement",
              ).map((integration) => {
                const status = externalIntegrations[integration.slug];
                // Deliberately NOT the global banner: this card is actionable
                // whenever ITS status source answered, even if another did not.
                const isStatusKnown =
                  !externalIntegrationsLoading &&
                  Boolean(status) &&
                  status.status !== "UNAVAILABLE";
                const isConnected = status?.connected;
                const isSyncing =
                  syncingProvider === integration.slug ||
                  status?.status === "SYNCING";
                const hasError = status?.status === "ERROR";
                return (
                  <Card
                    key={integration.slug}
                    className="group transition-all duration-200 hover:shadow-md dark:hover:shadow-black/30 hover:-translate-y-0.5"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden shadow-md shadow-black/10 dark:shadow-black/30 ring-1 ring-white/10">
                          <Image
                            src={integration.logo}
                            alt={integration.name}
                            width={48}
                            height={48}
                            className="object-contain"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <CardTitle className="text-sm">
                              {integration.name}
                            </CardTitle>
                            {isConnected && (
                              <Badge className="shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">
                                Connected
                              </Badge>
                            )}
                            {hasError && (
                              <Badge
                                variant="destructive"
                                className="shrink-0 text-xs"
                              >
                                Error
                              </Badge>
                            )}
                            {integration.comingSoon && !isConnected && (
                              <Badge
                                variant="secondary"
                                className="shrink-0 text-xs"
                              >
                                Soon
                              </Badge>
                            )}
                            {integration.betaUnverified && !isConnected && (
                              <Badge
                                variant="outline"
                                className="shrink-0 text-xs border-amber-400/50 text-amber-600 dark:text-amber-400"
                                title="OAuth implemented but not yet verified against production. Connect at your own risk — please report issues."
                              >
                                Beta
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="mt-0.5 text-xs leading-relaxed">
                            {integration.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    {isConnected && (status?.counts || status?.lastSyncAt) && (
                      <CardContent className="pt-0 pb-3">
                        <Separator className="mb-3" />
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {status?.counts && (
                            <p>
                              {status.counts.clients} clients ·{" "}
                              {status.counts.jobs} jobs
                            </p>
                          )}
                          {status?.lastSyncAt && (
                            <p>
                              Last synced{" "}
                              {new Date(status.lastSyncAt).toLocaleDateString(
                                "en-AU",
                              )}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    )}
                    {hasError && status?.syncError && (
                      <CardContent className="pt-0 pb-3">
                        <div className="p-2 bg-destructive-subtle border border-destructive-subtle-foreground/30 rounded-md text-xs text-destructive-subtle-foreground">
                          {status.syncError}
                        </div>
                      </CardContent>
                    )}
                    <CardFooter className="pt-0 gap-2">
                      {!isStatusKnown ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          disabled
                        >
                          {externalIntegrationsLoading
                            ? "Checking status…"
                            : "Status unavailable"}
                        </Button>
                      ) : isConnected ? (
                        <>
                          <Button
                            size="sm"
                            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-600 hover:to-cyan-600 text-white border-0 shadow-sm"
                            onClick={() => handleSyncExternal(integration.slug)}
                            disabled={isSyncing}
                          >
                            {isSyncing ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <RefreshCw />
                            )}
                            {isSyncing ? "Syncing..." : "Sync"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive-subtle-foreground border-destructive-subtle-foreground/30 hover:bg-destructive-subtle dark:hover:bg-rose-500/10"
                            onClick={() =>
                              handleDisconnectExternal(integration.slug)
                            }
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : integration.comingSoon || integration.betaUnverified ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          disabled
                          title={
                            integration.betaUnverified
                              ? "OAuth exists but is not production-verified (RA-1248). Contact support if you need early access."
                              : undefined
                          }
                        >
                          {integration.betaUnverified
                            ? "Beta — not verified"
                            : "Coming Soon"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
                          onClick={() =>
                            // Ascora needs an API key, so it opens a dialog
                            // rather than starting an OAuth redirect.
                            integration.slug === "ascora"
                              ? setShowAscoraModal(true)
                              : handleConnectExternal(integration.slug)
                          }
                        >
                          <ExternalLink />
                          Connect
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}

              {/* Request Integration */}
              <Card className="border-dashed bg-muted/20 hover:bg-muted/40 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-12 h-12 shrink-0 rounded-xl bg-muted border border-border">
                      <Plus size={18} className="text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">
                        Request Integration
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Need another platform? Tell us what you use.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardFooter className="pt-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    asChild
                  >
                    <a href="/dashboard/feedback?topic=integration-request">
                      Request an integration
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
          {/* ── Referral Networks ───────────────────── */}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-teal-500/10 dark:bg-teal-500/15 border border-teal-500/20">
                <Network
                  size={16}
                  className="text-teal-600 dark:text-teal-400"
                />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Referral Networks
                </h2>
                <p className="text-xs text-muted-foreground">
                  Receive dispatched jobs from restoration referral networks
                </p>
              </div>
            </div>
            <Separator className="mt-4 mb-5" />
            <div className="grid md:grid-cols-3 gap-4">
              {/* DR-NRPG card */}
              <Card className="group transition-all duration-200 hover:shadow-md dark:hover:shadow-black/30 hover:-translate-y-0.5">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-12 h-12 shrink-0 rounded-xl bg-teal-500/10 border border-teal-500/20">
                      <Network
                        size={22}
                        className="text-teal-600 dark:text-teal-400"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <CardTitle className="text-sm">DR-NRPG</CardTitle>
                        {drNrpg.connected ? (
                          <Badge className="shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">
                            Connected
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="shrink-0 text-xs"
                          >
                            Not connected
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="mt-0.5 text-xs leading-relaxed">
                        Disaster Recovery NRPG — receive job dispatch events via
                        webhook
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                {drNrpg.connected && drNrpg.lastSyncAt && (
                  <CardContent className="pt-0 pb-3">
                    <Separator className="mb-3" />
                    <p className="text-xs text-muted-foreground">
                      Last job:{" "}
                      {new Date(drNrpg.lastSyncAt).toLocaleDateString("en-AU")}
                    </p>
                  </CardContent>
                )}
                <CardFooter className="pt-0 gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white border-0"
                    onClick={() => setShowDrNrpgModal(true)}
                  >
                    {drNrpg.connected ? (
                      "Settings"
                    ) : (
                      <>
                        <ExternalLink size={13} /> Connect
                      </>
                    )}
                  </Button>
                  {drNrpg.connected && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive-subtle-foreground border-destructive-subtle-foreground/30 hover:bg-destructive-subtle dark:hover:bg-rose-500/10"
                      onClick={handleDisconnectDrNrpg}
                    >
                      Disconnect
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* ── Ascora Modal ──────────────────────────── */}
      <Dialog
        open={showAscoraModal}
        onOpenChange={(open) => {
          setShowAscoraModal(open);
          // Closing the dialog discards the typed key rather than holding it
          // in memory until the next open.
          if (!open) setAscoraApiKey("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Ascora</DialogTitle>
            <DialogDescription>
              Paste the API key from Ascora (Administration → API Settings).
              RestoreAssist verifies it against Ascora before saving, and stores
              it encrypted — it is never shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="ascora-api-key"
            >
              Ascora API Key
            </label>
            <Input
              id="ascora-api-key"
              type="password"
              autoComplete="off"
              value={ascoraApiKey}
              onChange={(e) => setAscoraApiKey(e.target.value)}
              placeholder="Enter your Ascora API key"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAscoraModal(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
              onClick={handleConnectAscora}
              disabled={ascoraConnecting || !ascoraApiKey.trim()}
            >
              {ascoraConnecting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DR-NRPG Modal ─────────────────────────── */}
      <Dialog open={showDrNrpgModal} onOpenChange={setShowDrNrpgModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>DR-NRPG Integration</DialogTitle>
            <DialogDescription>
              {drNrpg.connected
                ? "Your webhook URL and secret for DR-NRPG. Re-enter your API key to rotate the webhook secret."
                : "Enter your DR-NRPG API key to connect. A webhook URL will be generated for you to configure in DR-NRPG."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                DR-NRPG API Key
              </label>
              <input
                type="password"
                value={drNrpgApiKey}
                onChange={(e) => setDrNrpgApiKey(e.target.value)}
                placeholder={
                  drNrpg.connected
                    ? "Enter new key to rotate secret"
                    : "Enter your DR-NRPG API key"
                }
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Base URL{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <input
                type="url"
                value={drNrpgBaseUrl}
                onChange={(e) => setDrNrpgBaseUrl(e.target.value)}
                placeholder="https://api.dr-nrpg.com.au"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Webhook details — shown after connecting OR if already connected */}
            {(drNrpgWebhookUrl ||
              (drNrpg.connected &&
                drNrpgWebhookUrl === "" &&
                drNrpg.webhookUrl)) && (
              <div className="rounded-md border border-teal-200 dark:border-teal-500/30 bg-teal-50 dark:bg-teal-500/10 p-3 space-y-2">
                <p className="text-xs font-medium text-teal-700 dark:text-teal-300">
                  Configure in DR-NRPG Dashboard
                </p>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Webhook URL</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1 truncate">
                      {drNrpgWebhookUrl || drNrpg.webhookUrl}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        copyToClipboard(
                          drNrpgWebhookUrl || drNrpg.webhookUrl!,
                          "url",
                        )
                      }
                    >
                      {drNrpgCopied === "url" ? (
                        <Check size={13} className="text-success" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </Button>
                  </div>
                </div>
                {drNrpgWebhookSecret && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      Webhook Secret{" "}
                      <span className="text-amber-600 dark:text-amber-400">
                        (save this now — not shown again)
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1 truncate font-mono">
                        {drNrpgWebhookSecret}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          copyToClipboard(drNrpgWebhookSecret, "secret")
                        }
                      >
                        {drNrpgCopied === "secret" ? (
                          <Check size={13} className="text-success" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Signature header:{" "}
                  <code className="text-xs">X-DRNRPG-Signature</code> · Format:{" "}
                  <code className="text-xs">sha256=&lt;hmac&gt;</code>
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDrNrpgModal(false)}>
              Close
            </Button>
            <Button
              className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white border-0"
              onClick={handleConnectDrNrpg}
              disabled={drNrpgConnecting || !drNrpgApiKey.trim()}
            >
              {drNrpgConnecting ? (
                <>
                  <Loader2 className="animate-spin" /> Connecting...
                </>
              ) : drNrpg.connected ? (
                "Update"
              ) : (
                "Connect"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── API Key Modal ──────────────────────────── */}
      <Dialog open={showApiModal} onOpenChange={setShowApiModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedIntegration?.name}</DialogTitle>
            <DialogDescription>
              Connect your API key to enable AI-powered report generation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                API Key Type
              </label>
              <select
                value={apiKeyType}
                onChange={(e) => {
                  setApiKeyType(e.target.value as UiAiKeyType);
                }}
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring text-foreground"
              >
                {UI_AI_KEY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {AI_PROVIDER_META[t].option}
                  </option>
                ))}
              </select>
            </div>
            {apiKeyType === "openrouter" && (
              <OpenRouterModelField
                fieldId="integration-openrouter-model"
                value={apiKeyModel}
                onChange={setApiKeyModel}
              />
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${AI_PROVIDER_META[apiKeyType].vendor} API key`}
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring placeholder:text-muted-foreground text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Your key is encrypted at rest. We never share it with third
                parties.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApiModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveConnection}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
            >
              Save Connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Upgrade Modal ── gated for iOS App Review (RA-1842) ────── */}
      <BillingGate fallback={null}>
        <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center shrink-0">
                  <Crown className="text-white" size={18} />
                </div>
                <DialogTitle>Upgrade Required</DialogTitle>
              </div>
              <DialogDescription>
                An active subscription is required to connect integrations and
                unlock all features — unlimited reports, priority support, and
                full API access.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowUpgradeModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowUpgradeModal(false);
                  if (!isCapacitorIOS()) {
                    router.push("/dashboard/pricing");
                  }
                }}
                className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white border-0"
              >
                Upgrade Now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </BillingGate>

      {/* ── Add Integration Modal ─────────────────── */}
      <Dialog
        open={showAddModal}
        onOpenChange={(open) => {
          if (!open) {
            setNewApiKey("");
            setNewApiKeyModel("");
            setNewApiKeyType("anthropic");
          }
          setShowAddModal(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Integration</DialogTitle>
            <DialogDescription>
              Connect an AI provider API key to enable report generation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                API Key Type
              </label>
              <select
                value={newApiKeyType}
                onChange={(e) => {
                  setNewApiKeyType(e.target.value as UiAiKeyType);
                }}
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring text-foreground"
              >
                {UI_AI_KEY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {AI_PROVIDER_META[t].option}
                  </option>
                ))}
              </select>
            </div>
            {newApiKeyType === "openrouter" && (
              <OpenRouterModelField
                fieldId="new-integration-openrouter-model"
                value={newApiKeyModel}
                onChange={setNewApiKeyModel}
              />
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                API Key
              </label>
              <input
                type="password"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder={`Enter your ${AI_PROVIDER_META[newApiKeyType].vendor} API key`}
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring placeholder:text-muted-foreground text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Your key is encrypted at rest. We never share it with third
                parties.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddModal(false);
                setNewApiKey("");
                setNewApiKeyModel("");
                setNewApiKeyType("anthropic");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddIntegration}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
            >
              Add Integration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          fetchExternalIntegrations();
        }}
      />
    </div>
  );
}
