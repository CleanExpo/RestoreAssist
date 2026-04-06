"use client";

import { useEffect, useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type AiProvider = "ANTHROPIC" | "OPENAI" | "GOOGLE" | "GEMMA";
type ConnectionStatus = "ACTIVE" | "DISABLED" | "ERROR";

interface ProviderConnectionSummary {
  id: string;
  provider: AiProvider;
  status: ConnectionStatus;
  maskedKey: string;
  lastValidatedAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

interface WorkspaceStatus {
  workspaceId: string | null;
  status: string | null;
}

// ─── Provider metadata ────────────────────────────────────────────────────────

const PROVIDERS: {
  id: AiProvider;
  name: string;
  description: string;
  keyPlaceholder: string;
  docsUrl: string;
}[] = [
  {
    id: "ANTHROPIC",
    name: "Anthropic (Claude)",
    description:
      "Claude Haiku / Sonnet / Opus — used for scope generation, report drafting, and AI chat.",
    keyPlaceholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "OPENAI",
    name: "OpenAI (GPT)",
    description:
      "GPT-4o / GPT-4 Turbo — used as a fallback when Anthropic is unavailable.",
    keyPlaceholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "GOOGLE",
    name: "Google AI (Gemini)",
    description:
      "Gemini 2.0 Flash / Pro — used for multi-modal analysis and document understanding.",
    keyPlaceholder: "AIza...",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "GEMMA",
    name: "Self-hosted Gemma",
    description:
      "On-premises Gemma endpoint — used for air-gapped field deployments.",
    keyPlaceholder:
      "(no API key required — uses RESTOREASSIST_AI_ENDPOINT env var)",
    docsUrl: "",
  },
];

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  ACTIVE: "Active",
  DISABLED: "Disabled",
  ERROR: "Error",
};

const STATUS_COLOUR: Record<ConnectionStatus, string> = {
  ACTIVE:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  DISABLED:
    "bg-neutral-100 text-neutral-500 dark:bg-slate-800 dark:text-slate-400",
  ERROR: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AiProvidersPage() {
  const [wsStatus, setWsStatus] = useState<WorkspaceStatus | null>(null);
  const [connections, setConnections] = useState<ProviderConnectionSummary[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  // Per-provider UI state
  const [expanded, setExpanded] = useState<AiProvider | null>(null);
  const [inputKey, setInputKey] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<AiProvider | null>(null);
  const [validating, setValidating] = useState<AiProvider | null>(null);
  const [disabling, setDisabling] = useState<AiProvider | null>(null);

  // ── Load workspace status + connections ──────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [wsRes, connRes] = await Promise.all([
          fetch("/api/workspace/status"),
          fetch("/api/workspace/provider-connections"),
        ]);
        if (wsRes.ok) setWsStatus(await wsRes.json());
        if (connRes.ok) {
          const { connections } = await connRes.json();
          setConnections(connections ?? []);
        }
      } catch {
        toast.error("Failed to load AI provider settings");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const getConn = (provider: AiProvider) =>
    connections.find((c) => c.provider === provider) ?? null;

  // ── Save key ─────────────────────────────────────────────────────────────
  async function handleSave(provider: AiProvider) {
    const key = inputKey[provider]?.trim();
    if (!key && provider !== "GEMMA") {
      toast.error("Enter an API key first");
      return;
    }
    setSaving(provider);
    try {
      const res = await fetch("/api/workspace/provider-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key ?? "" }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to save key");
        return;
      }
      toast.success(`${provider} key saved`);
      setInputKey((prev) => ({ ...prev, [provider]: "" }));
      setConnections((prev) => {
        const filtered = prev.filter((c) => c.provider !== provider);
        return [...filtered, json.connection];
      });
    } catch {
      toast.error("Network error — key not saved");
    } finally {
      setSaving(null);
    }
  }

  // ── Validate key ─────────────────────────────────────────────────────────
  async function handleValidate(provider: AiProvider) {
    setValidating(provider);
    try {
      const res = await fetch("/api/workspace/provider-connections/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = await res.json();
      if (!res.ok || !json.valid) {
        toast.error(json.errorMessage ?? json.error ?? "Validation failed");
      } else {
        toast.success(`${provider} key validated (${json.latencyMs}ms)`);
      }
      // Refresh connections to get latest status
      const connRes = await fetch("/api/workspace/provider-connections");
      if (connRes.ok) {
        const { connections } = await connRes.json();
        setConnections(connections ?? []);
      }
    } catch {
      toast.error("Validation request failed");
    } finally {
      setValidating(null);
    }
  }

  // ── Disable connection ────────────────────────────────────────────────────
  async function handleDisable(provider: AiProvider) {
    setDisabling(provider);
    try {
      const res = await fetch("/api/workspace/provider-connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? "Failed to disable");
        return;
      }
      toast.success(`${provider} connection disabled`);
      setConnections((prev) =>
        prev.map((c) =>
          c.provider === provider ? { ...c, status: "DISABLED" } : c,
        ),
      );
    } catch {
      toast.error("Network error");
    } finally {
      setDisabling(null);
    }
  }

  // ── No workspace ─────────────────────────────────────────────────────────
  if (!loading && wsStatus?.status !== "READY") {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <Brain size={40} className="mx-auto text-neutral-300" />
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Workspace required
        </h2>
        <p className="text-sm text-neutral-500">
          BYOK AI providers are available on workspace plans. Upgrade your
          subscription to manage your own API keys.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white">
          AI Providers
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Bring your own API keys (BYOK) to use your preferred AI providers.
          Keys are AES-256-GCM encrypted at rest and never returned in API
          responses.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-neutral-400 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading providers…</span>
        </div>
      ) : (
        <div className="space-y-3">
          {PROVIDERS.map((p) => {
            const conn = getConn(p.id);
            const isExpanded = expanded === p.id;

            return (
              <div
                key={p.id}
                className="border rounded-xl overflow-hidden bg-white dark:bg-slate-900 dark:border-slate-700"
              >
                {/* Row header */}
                <button
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors text-left"
                  onClick={() => setExpanded(isExpanded ? null : p.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Brain
                      size={18}
                      className="text-[#1C2E47] dark:text-slate-300 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900 dark:text-white text-sm">
                        {p.name}
                      </p>
                      {conn && (
                        <p className="text-xs text-neutral-400 font-mono truncate max-w-xs mt-0.5">
                          {conn.maskedKey}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {conn && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOUR[conn.status]}`}
                      >
                        {STATUS_LABEL[conn.status]}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp size={16} className="text-neutral-400" />
                    ) : (
                      <ChevronDown size={16} className="text-neutral-400" />
                    )}
                  </div>
                </button>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t dark:border-slate-700 space-y-4 pt-4">
                    <p className="text-sm text-neutral-500">{p.description}</p>

                    {/* Last validated */}
                    {conn?.lastValidatedAt && (
                      <p className="text-xs text-neutral-400">
                        Last validated:{" "}
                        {new Date(conn.lastValidatedAt).toLocaleString("en-AU")}
                      </p>
                    )}
                    {conn?.lastError && (
                      <p className="text-xs text-red-500">
                        Last error: {conn.lastError}
                      </p>
                    )}

                    {/* Key input */}
                    {p.id !== "GEMMA" && (
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-neutral-600 dark:text-slate-300">
                          {conn ? "Replace API key" : "API key"}
                        </label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showKey[p.id] ? "text" : "password"}
                              value={inputKey[p.id] ?? ""}
                              onChange={(e) =>
                                setInputKey((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              placeholder={p.keyPlaceholder}
                              className="w-full text-sm px-3 py-2 pr-9 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-[#1C2E47] font-mono"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowKey((prev) => ({
                                  ...prev,
                                  [p.id]: !prev[p.id],
                                }))
                              }
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                            >
                              {showKey[p.id] ? (
                                <EyeOff size={15} />
                              ) : (
                                <Eye size={15} />
                              )}
                            </button>
                          </div>
                          <button
                            onClick={() => handleSave(p.id)}
                            disabled={
                              saving === p.id || !inputKey[p.id]?.trim()
                            }
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#1C2E47] hover:bg-[#263d5f] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            {saving === p.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Plus size={14} />
                            )}
                            Save
                          </button>
                        </div>
                        {p.docsUrl && (
                          <a
                            href={p.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Get your {p.name} API key →
                          </a>
                        )}
                      </div>
                    )}

                    {/* Gemma note */}
                    {p.id === "GEMMA" && (
                      <p className="text-xs text-neutral-500 bg-neutral-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                        Self-hosted Gemma is configured via the{" "}
                        <code className="font-mono">
                          RESTOREASSIST_AI_ENDPOINT
                        </code>{" "}
                        environment variable on your server — no key entry
                        required here.
                      </p>
                    )}

                    {/* Actions on existing connection */}
                    {conn && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleValidate(p.id)}
                          disabled={
                            validating === p.id || conn.status === "DISABLED"
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-neutral-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                        >
                          {validating === p.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RefreshCw size={12} />
                          )}
                          Validate key
                        </button>
                        {conn.status === "ACTIVE" && (
                          <button
                            onClick={() => handleDisable(p.id)}
                            disabled={disabling === p.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 transition-colors"
                          >
                            {disabling === p.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <X size={12} />
                            )}
                            Disable
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info footer */}
      <div className="text-xs text-neutral-400 border-t pt-4 space-y-1 dark:border-slate-700">
        <p>
          <Check size={11} className="inline mr-1 text-emerald-500" />
          Keys are encrypted with AES-256-GCM before storage — RestoreAssist
          never logs or transmits plaintext keys.
        </p>
        <p>
          <Check size={11} className="inline mr-1 text-emerald-500" />
          Your keys are used only for AI calls made within your workspace.
        </p>
      </div>
    </div>
  );
}
