"use client";

/**
 * Workstream C — unified Connections settings hub.
 *
 * Surfaces AI BYOK, Resend email, and cloud mirror (OneDrive/Drive) as
 * professional connection cards with live status. Detail pages remain the
 * place to configure each connection.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Brain,
  Cloud,
  Mail,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ConnState = "connected" | "missing" | "error" | "coming_soon" | "loading";

interface ConnectionCard {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: typeof Brain;
  state: ConnState;
  detail: string;
  manageLabel: string;
}

function toneFor(state: ConnState): StatusTone {
  switch (state) {
    case "connected":
      return "success";
    case "missing":
      return "warning";
    case "error":
      return "danger";
    case "coming_soon":
      return "neutral";
    default:
      return "info";
  }
}

function labelFor(state: ConnState): string {
  switch (state) {
    case "connected":
      return "Connected";
    case "missing":
      return "Not connected";
    case "error":
      return "Needs attention";
    case "coming_soon":
      return "Coming soon";
    default:
      return "Checking…";
  }
}

export default function ConnectionsSettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiState, setAiState] = useState<{
    state: ConnState;
    detail: string;
  }>({ state: "loading", detail: "Checking…" });
  const [emailState, setEmailState] = useState<{
    state: ConnState;
    detail: string;
  }>({ state: "loading", detail: "Checking…" });
  const [cloudState, setCloudState] = useState<{
    state: ConnState;
    detail: string;
  }>({ state: "loading", detail: "Checking…" });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const results = await Promise.allSettled([
      fetch("/api/workspace/provider-connections"),
      fetch("/api/workspace/email-provider"),
      fetch("/api/user/cloud-mirror"),
    ]);

    let anyOk = false;

    // AI providers
    const aiRes = results[0];
    if (aiRes.status === "fulfilled" && aiRes.value.ok) {
      anyOk = true;
      const data = await aiRes.value.json();
      const list = Array.isArray(data?.connections)
        ? data.connections
        : Array.isArray(data)
          ? data
          : [];
      const active = list.filter(
        (c: { status?: string }) => c.status === "ACTIVE",
      );
      const errored = list.filter(
        (c: { status?: string }) => c.status === "ERROR",
      );
      if (errored.length > 0 && active.length === 0) {
        setAiState({
          state: "error",
          detail: `${errored.length} provider${errored.length === 1 ? "" : "s"} in error`,
        });
      } else if (active.length > 0) {
        setAiState({
          state: "connected",
          detail: `${active.length} active provider${active.length === 1 ? "" : "s"}`,
        });
      } else {
        setAiState({
          state: "missing",
          detail: "Add a BYOK key to run AI features",
        });
      }
    } else if (aiRes.status === "fulfilled" && aiRes.value.status === 403) {
      setAiState({
        state: "missing",
        detail: "Owner access required to manage AI keys",
      });
    } else {
      setAiState({
        state: "error",
        detail: "Could not load AI provider status",
      });
    }

    // Resend
    const emailRes = results[1];
    if (emailRes.status === "fulfilled" && emailRes.value.ok) {
      anyOk = true;
      const data = await emailRes.value.json();
      if (data.connected) {
        setEmailState({
          state: "connected",
          detail: data.fromAddress
            ? `Sending as ${data.fromAddress}`
            : "Resend connected",
        });
      } else if (data.hasPlatformFallback) {
        setEmailState({
          state: "missing",
          detail: "Using platform fallback — add your Resend key for BYOK",
        });
      } else {
        setEmailState({
          state: "missing",
          detail: "Connect Resend to send client email",
        });
      }
    } else if (
      emailRes.status === "fulfilled" &&
      emailRes.value.status === 403
    ) {
      setEmailState({
        state: "missing",
        detail: "Owner access required for email BYOK",
      });
    } else {
      setEmailState({
        state: "error",
        detail: "Could not load email status",
      });
    }

    // Cloud mirror
    const cloudRes = results[2];
    if (cloudRes.status === "fulfilled" && cloudRes.value.ok) {
      anyOk = true;
      const data = await cloudRes.value.json();
      const provider = data.provider as string | null;
      const catalog = Array.isArray(data.catalog) ? data.catalog : [];
      const onedrive = catalog.find(
        (o: { id: string; enabled?: boolean }) => o.id === "onedrive",
      );
      if (provider === "onedrive") {
        setCloudState({
          state: "connected",
          detail: "Mirroring to OneDrive",
        });
      } else if (provider === "drive") {
        setCloudState({
          state: "connected",
          detail: "Mirroring to Google Drive",
        });
      } else if (onedrive && !onedrive.enabled) {
        setCloudState({
          state: "missing",
          detail: "OneDrive env not configured — Drive may still be available",
        });
      } else {
        setCloudState({
          state: "missing",
          detail: "Choose Drive or OneDrive for evidence mirroring",
        });
      }
    } else {
      setCloudState({
        state: "error",
        detail: "Could not load cloud mirror status",
      });
    }

    if (!anyOk) {
      setLoadError("Could not load connection status");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") void load();
  }, [status, router, load]);

  const cards: ConnectionCard[] = [
    {
      id: "ai",
      title: "AI providers",
      description:
        "Bring-your-own-key for Claude, OpenAI, Gemini, OpenRouter, or self-hosted Gemma.",
      href: "/dashboard/settings/ai-providers",
      icon: Brain,
      state: aiState.state,
      detail: aiState.detail,
      manageLabel: "Manage AI keys",
    },
    {
      id: "email",
      title: "Email (Resend)",
      description:
        "Org-owned Resend API key for invitations, pulse, and client notifications.",
      href: "/dashboard/settings/email",
      icon: Mail,
      state: emailState.state,
      detail: emailState.detail,
      manageLabel: "Manage Resend",
    },
    {
      id: "cloud",
      title: "Cloud mirror",
      description:
        "Mirror viewing-quality evidence to Google Drive or OneDrive after capture.",
      href: "/dashboard/settings/cloud-mirror",
      icon: Cloud,
      state: cloudState.state,
      detail: cloudState.detail,
      manageLabel: "Manage cloud mirror",
    },
    {
      id: "icloud",
      title: "iCloud",
      description:
        "Apple CloudKit mirroring is planned. Not available yet — we will not fake a connection.",
      href: "/dashboard/settings/cloud-mirror",
      icon: Cloud,
      state: "coming_soon",
      detail: "Requires CloudKit — Coming soon",
      manageLabel: "View cloud options",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link
              href="/dashboard/settings"
              className="hover:text-foreground underline-offset-2 hover:underline"
            >
              Settings
            </Link>
            <span className="mx-1.5">/</span>
            Connections
          </p>
          <h1 className="text-2xl font-semibold">Connections</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Professional status for AI, email, and cloud storage. Connect what
            you own — we never invent a green light.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw
            className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-start gap-2"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p>{loadError}</p>
            <button
              type="button"
              className="underline mt-1"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const isSoon = card.state === "coming_soon";
          return (
            <Card key={card.id} className={isSoon ? "opacity-90" : undefined}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      <Icon className="h-5 w-5 text-foreground/70" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{card.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {card.description}
                      </CardDescription>
                    </div>
                  </div>
                  <StatusBadge tone={toneFor(card.state)}>
                    {labelFor(card.state)}
                  </StatusBadge>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3 pt-0">
                <p className="text-sm text-muted-foreground">{card.detail}</p>
                <Button asChild size="sm" variant={isSoon ? "ghost" : "outline"}>
                  <Link href={card.href}>
                    {card.manageLabel}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Need a live capability check across the workspace? See{" "}
        <Link
          href="/dashboard/settings/health"
          className="underline underline-offset-2"
        >
          Workspace health
        </Link>
        .
      </p>
    </div>
  );
}
