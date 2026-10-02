import { classifyIntegrationIdentity, getOAuthReadiness, isOAuthIntegration, type IntegrationIdentityInput } from "@/lib/integrations/identity";
import type { ConfiguredAiConnectionMetadata } from "./ai-connections";
import type { AiProvider } from "@/lib/workspace/provider-connections";
import type { UiAiKeyType } from "@/lib/workspace/ai-key-type";

export interface LegacyIntegrationMetadata extends IntegrationIdentityInput {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  lastSyncAt?: string;
  syncError?: string;
}
export interface AiIntegrationCard {
  id: string;
  name: string;
  description: string;
  provider: AiProvider;
  source: "canonical" | "legacy";
  status: "ACTIVE" | "FAILED" | "DISABLED";
  lastValidatedAt: string | null;
  keyType: UiAiKeyType | null;
}
const names: Record<AiProvider, string> = {
  ANTHROPIC: "Anthropic Claude", OPENAI: "OpenAI GPT", GOOGLE: "Google Gemini",
  GEMMA: "Self-hosted Gemma", OPENROUTER: "OpenRouter", ELEVENLABS: "ElevenLabs",
};
function keyType(provider: AiProvider): UiAiKeyType | null {
  return provider === "ANTHROPIC" ? "anthropic" : provider === "OPENAI" ? "openai" : provider === "GOOGLE" ? "gemini" : null;
}
/** Canonical state is authoritative, including a deliberate disable or failure. */
export function mergeAiIntegrationCards(legacy: LegacyIntegrationMetadata[], canonical: ConfiguredAiConnectionMetadata[]): AiIntegrationCard[] {
  const cards = new Map<AiProvider, AiIntegrationCard>();
  for (const row of legacy) {
    const identity = classifyIntegrationIdentity(row);
    if (identity.kind !== "AI" || !identity.provider) continue;
    const provider = identity.provider === "GEMINI" ? "GOOGLE" : identity.provider;
    const existing = cards.get(provider);
    if (existing) continue;
    cards.set(provider, {
      id: row.id, name: names[provider], provider, source: "legacy",
      description: "Saved AI key. Provider availability has not been checked.",
      status: row.status === "CONNECTED" ? "ACTIVE" : row.status === "DISCONNECTED" ? "DISABLED" : "FAILED",
      lastValidatedAt: null, keyType: keyType(provider),
    });
  }
  for (const row of canonical) {
    cards.set(row.provider, {
      id: row.id, name: names[row.provider], provider: row.provider, source: "canonical",
      description: "Workspace AI key. Provider availability has not been checked.",
      status: row.status, lastValidatedAt: row.lastValidatedAt, keyType: keyType(row.provider),
    });
  }
  return [...cards.values()];
}

export type OAuthCardState =
  | { status: "UNAVAILABLE" | "AMBIGUOUS" | "DISCONNECTED"; connected: false; syncError?: string }
  | { status: "ATTENTION"; connected: false; syncError: string }
  | { status: "CONNECTED" | "SYNCING" | "ERROR"; connected: true; lastSyncAt?: string; syncError?: string };
/** Identity is independent of readiness; never choose an arbitrary connection. */
export function describeOAuthCard(rows: LegacyIntegrationMetadata[], provider: string, truncated = false): OAuthCardState {
  const matches = rows.filter(row => isOAuthIntegration(row, provider));
  if (truncated) return { status: "UNAVAILABLE", connected: false };
  if (matches.length > 1) return { status: "AMBIGUOUS", connected: false, syncError: "Multiple workspace connections exist. Choosing one is not yet supported here; no connection has been selected." };
  const row = matches[0];
  if (!row) return { status: "DISCONNECTED", connected: false };
  const readiness = getOAuthReadiness(row, provider);
  if (!readiness.ready) {
    if (readiness.reason === "DISCONNECTED") return { status: "DISCONNECTED", connected: false };
    return { status: "ATTENTION", connected: false, syncError: readiness.reason === "ORGANISATION_REQUIRED"
      ? "No organisation is selected for this connection. Reconnect and authorise a single organisation before syncing."
      : "This connection needs authorisation before it can sync." };
  }
  return { status: row.status === "ERROR" ? "ERROR" : row.status === "SYNCING" ? "SYNCING" : "CONNECTED", connected: true, lastSyncAt: row.lastSyncAt, syncError: row.syncError };
}

/** A sync/import receipt must contain actual counts, including an explicit zero. */
export function isIntegrationCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
