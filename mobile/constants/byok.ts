// BYOK Configuration - HARD CODED - CEO APPROVED - NO EXCEPTIONS
// Source of truth: AI_Provider_Reference/BYOK_MASTER_ALLOWLIST.md

import { ALLOWED_MODELS, Provider, AllowedModel } from '@/shared/types';

export { ALLOWED_MODELS };

export function validateModel(provider: Provider, model: string): model is AllowedModel {
  const models = ALLOWED_MODELS[provider] as readonly string[];
  return models.includes(model);
}

export function getProviderFromModel(model: string): Provider | null {
  for (const [provider, models] of Object.entries(ALLOWED_MODELS)) {
    if ((models as readonly string[]).includes(model)) {
      return provider as Provider;
    }
  }
  return null;
}

export function getProviderDisplayName(provider: Provider): string {
  const names: Record<Provider, string> = {
    anthropic: 'Anthropic (Claude)',
    google: 'Google (Gemini)',
    openai: 'OpenAI (GPT)',
  };
  return names[provider];
}

export function getModelDisplayName(model: AllowedModel): string {
  const names: Record<AllowedModel, string> = {
    'claude-opus-4-6': 'Claude Opus 4.6 (Flagship)',
    'claude-sonnet-4-6': 'Claude Sonnet 4.6 (Premium)',
    'gemini-3.1-pro': 'Gemini 3.1 Pro (Flagship)',
    'gemini-3.1-flash': 'Gemini 3.1 Flash (Premium)',
    'gpt-5.4': 'GPT-5.4 (Flagship)',
    'gpt-5.4-mini': 'GPT-5.4 Mini (Premium)',
  };
  return names[model];
}
// Provider-specific auth header configuration
export const PROVIDER_AUTH = {
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    headerKey: 'x-api-key',
    headerPrefix: '', // No prefix - raw key
    extraHeaders: { 'anthropic-version': '2023-06-01' },
  },
  google: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    headerKey: 'x-goog-api-key',
    headerPrefix: '', // No prefix - raw key
    extraHeaders: {},
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    headerKey: 'Authorization',
    headerPrefix: 'Bearer ', // MUST include Bearer prefix
    extraHeaders: {},
  },
} as const;