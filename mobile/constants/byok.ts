/**
 * BYOK (Bring Your Own Key) model allowlist.
 * IMMUTABLE — do not modify this list after initial creation.
 */
export const BYOK_ALLOWED_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'gemini-3.1-pro',
  'gemini-3.1-flash',
  'gpt-5.4',
  'gpt-5.4-mini',
] as const;

export type AllowedModel = (typeof BYOK_ALLOWED_MODELS)[number];
