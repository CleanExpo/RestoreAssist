/**
 * BYOK (Bring Your Own Key) model allowlist.
 * Updated for Sprint H (RA-403): gemma-4-31b-it added as self-hosted tier.
 */
export const BYOK_ALLOWED_MODELS = [
  // Self-hosted tier — no API key needed (RestoreAssist AI Included)
  "gemma-4-31b-it",
  // BYOK providers — customer supplies their own API key
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "gemini-3.1-pro",
  "gemini-3.1-flash",
  "gpt-5.4",
  "gpt-5.4-mini",
] as const;

export type AllowedModel = (typeof BYOK_ALLOWED_MODELS)[number];
