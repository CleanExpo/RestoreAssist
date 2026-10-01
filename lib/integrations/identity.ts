/** Public, browser-safe identity rules for legacy Integration records. */
export const OAUTH_PROVIDERS = ["XERO", "QUICKBOOKS", "MYOB", "SERVICEM8"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export type AiIntegrationProvider = "OPENAI" | "ANTHROPIC" | "GEMINI" | "OPENROUTER";

export interface IntegrationIdentityInput {
  provider?: string | null;
  name?: string | null;
  icon?: string | null;
  config?: unknown;
  tenantId?: string | null;
  realmId?: string | null;
  companyId?: string | null;
  tokenExpiresAt?: Date | string | null;
  status?: string | null;
  hasOAuthCredentials?: boolean;
  accessToken?: string | null;
}

const AI_NAMES: Record<string, AiIntegrationProvider> = {
  "openai gpt": "OPENAI", "openai api": "OPENAI", openai: "OPENAI",
  "anthropic claude": "ANTHROPIC", "anthropic api": "ANTHROPIC", "claude api": "ANTHROPIC",
  "google gemini": "GEMINI", "gemini api": "GEMINI", gemini: "GEMINI",
  openrouter: "OPENROUTER", "openrouter api": "OPENROUTER",
};
export const LEGACY_AI_NAMES = Object.keys(AI_NAMES);
const OAUTH_NAMES: Record<OAuthProvider, readonly string[]> = {
  XERO: ["xero"], QUICKBOOKS: ["quickbooks", "quickbooks online"],
  MYOB: ["myob"], SERVICEM8: ["servicem8", "service m8"],
};

export type IntegrationIdentity =
  | { kind: "AI"; provider: AiIntegrationProvider | null }
  | { kind: "OAUTH"; provider: OAuthProvider }
  | { kind: "UNSUPPORTED"; provider: null };

export function classifyIntegrationIdentity(row: IntegrationIdentityInput): IntegrationIdentity {
  const name = row.name?.trim().toLowerCase() ?? "";
  let config = row.config;
  // Legacy UI and route each encoded config once. Decode at most two layers.
  for (let layer = 0; layer < 2 && typeof config === "string"; layer++) {
    try { config = JSON.parse(config); } catch { config = null; }
  }
  const keyType = config && typeof config === "object" && "apiKeyType" in config
    ? String(config.apiKeyType).toUpperCase() : "";
  const configuredAi = ["OPENAI", "ANTHROPIC", "GEMINI", "OPENROUTER"].includes(keyType)
    ? keyType as AiIntegrationProvider : null;
  const namedAi = Object.hasOwn(AI_NAMES, name) ? AI_NAMES[name] : null;
  const typedAi = ["OPENAI", "ANTHROPIC", "GEMINI", "OPENROUTER"].includes(row.provider ?? "")
    ? row.provider as AiIntegrationProvider : null;
  // AI evidence always wins, including records historically mislabeled XERO.
  if (row.icon === "[ra:ai]" || namedAi || configuredAi || typedAi) {
    return { kind: "AI", provider: typedAi ?? namedAi ?? configuredAi };
  }
  if (!OAUTH_PROVIDERS.includes(row.provider as OAuthProvider)) {
    return { kind: "UNSUPPORTED", provider: null };
  }
  const provider = row.provider as OAuthProvider;
  const canonical = OAUTH_NAMES[provider].includes(name) || row.icon === `/integrations/${provider.toLowerCase()}.svg`;
  const evidence = Boolean(row.tokenExpiresAt || (
    provider === "QUICKBOOKS" ? row.realmId : provider === "SERVICEM8" ? row.companyId : row.tenantId
  ));
  // An arbitrary name plus the legacy default enum is not provider identity.
  return canonical || evidence ? { kind: "OAUTH", provider } : { kind: "UNSUPPORTED", provider: null };
}

export function isOAuthIntegration(row: IntegrationIdentityInput, expectedProvider?: string): boolean {
  const identity = classifyIntegrationIdentity(row);
  return identity.kind === "OAUTH" && (!expectedProvider || identity.provider === expectedProvider);
}

export type OAuthReadiness = { ready: true } | { ready: false; reason:
  "INVALID_IDENTITY" | "DISCONNECTED" | "CREDENTIALS_REQUIRED" | "ORGANISATION_REQUIRED" };

export function getOAuthReadiness(row: IntegrationIdentityInput, expectedProvider?: string): OAuthReadiness {
  if (!isOAuthIntegration(row, expectedProvider)) return { ready: false, reason: "INVALID_IDENTITY" };
  if (!["CONNECTED", "SYNCING", "ERROR"].includes(row.status ?? "")) return { ready: false, reason: "DISCONNECTED" };
  if (!(row.hasOAuthCredentials ?? Boolean(row.accessToken?.trim()))) return { ready: false, reason: "CREDENTIALS_REQUIRED" };
  if ((row.provider === "XERO" || row.provider === "MYOB") && !row.tenantId?.trim() || row.provider === "QUICKBOOKS" && !row.realmId?.trim()) {
    return { ready: false, reason: "ORGANISATION_REQUIRED" };
  }
  return { ready: true };
}
