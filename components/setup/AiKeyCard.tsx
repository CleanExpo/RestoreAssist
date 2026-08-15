'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  CatalogueModel,
  OpenRouterCatalogue,
} from '@/lib/workspace/openrouter-catalogue';

// Inline SVG marks (Phill Rule 1: no generic icon-library imports). Matches the
// inline-<svg> pattern used by the sibling VideoExplainer card.
function CheckCircleMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SpinnerMark({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

type Provider = 'ANTHROPIC' | 'OPENAI' | 'OPENROUTER';

const PROVIDER_META: Record<Provider, { label: string; placeholder: string }> = {
  ANTHROPIC: {
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-api03-…',
  },
  OPENAI: {
    label: 'OpenAI (GPT)',
    placeholder: 'sk-proj-…',
  },
  OPENROUTER: {
    label: 'OpenRouter (open models)',
    placeholder: 'sk-or-v1-…',
  },
};

// Mirrors the final fallback in `callAIProvider` (lib/ai-provider.ts) — a blank
// selection stores no slug, so routing lands on OPENROUTER_MODEL or this. Shown
// as the placeholder so the "leave it blank" path is not a mystery box.
const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-chat';

// Client-side bound on the catalogue request. Comfortably above the route's own
// 8s upstream timeout, so a slow-but-live upstream still populates the picker
// rather than being cut off by the browser.
const CATALOGUE_TIMEOUT_MS = 12_000;

// Mirrors MAX_MODEL_SLUG_LENGTH in app/api/workspace/provider-connections.
// The server is the authority; this stops an oversized slug being held in React
// state and serialised in the first place.
const MAX_MODEL_SLUG_LENGTH = 128;

type CardState = 'idle' | 'saving' | 'success' | 'error';

const DEFAULT_KEY_ERROR =
  "We couldn't save that key. Please check the key and try again.";

function friendlySaveError(status: number, code?: string): string {
  if (status === 402 || code === 'NO_WORKSPACE') {
    return 'Your workspace is still being set up. Refresh the page and try again.';
  }
  if (status === 403 || code === 'FORBIDDEN') {
    return "You don't have permission to save AI keys for this workspace.";
  }
  if (status === 400 || code === 'VALIDATION') {
    return 'That key looks incomplete. Paste the full API key and try again.';
  }
  return DEFAULT_KEY_ERROR;
}

export function AiKeyCard({ onSaved }: { onSaved?: () => void } = {}) {
  const [provider, setProvider] = useState<Provider>('ANTHROPIC');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [catalogue, setCatalogue] = useState<OpenRouterCatalogue | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const catalogueRequested = useRef(false);
  const [cardState, setCardState] = useState<CardState>('idle');
  const [errorMessage, setErrorMessage] = useState(DEFAULT_KEY_ERROR);

  const meta = PROVIDER_META[provider];

  // Unmount latch. Deliberately NOT tied to the fetch effect below: cancelling
  // on a provider change would strand the catalogue as permanently "loading"
  // if the operator toggled away and back mid-flight.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Load the live OpenRouter catalogue lazily — only once the operator has
  // actually chosen OpenRouter, so the common Anthropic/OpenAI path costs
  // nothing. The route never fails hard; `unavailable` degrades to free text.
  useEffect(() => {
    // The ref (not `catalogueLoading`) is the once-guard: putting the loading
    // flag in the dep array would re-run this effect the moment it flips.
    if (provider !== 'OPENROUTER' || catalogueRequested.current) return;
    catalogueRequested.current = true;

    setCatalogueLoading(true);

    // The route's own upstream timeout cannot rescue a browser request that
    // never reaches it or never completes. Without a client-side bound, a
    // stalled request leaves the picker disabled on "Loading models…" forever
    // — the one state the free-text fallback exists to prevent.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), CATALOGUE_TIMEOUT_MS);

    fetch('/api/workspace/openrouter-models', { signal: abort.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: OpenRouterCatalogue | null) => {
        if (!mounted.current) return;
        setCatalogue(
          json ?? { recommended: [], models: [], unavailable: true },
        );
      })
      .catch(() => {
        // Abort, network error, malformed body — all degrade to free text.
        if (mounted.current) {
          setCatalogue({ recommended: [], models: [], unavailable: true });
        }
      })
      .finally(() => {
        clearTimeout(timer);
        if (mounted.current) setCatalogueLoading(false);
      });
  }, [provider]);

  async function handleSave() {
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    setCardState('saving');
    setErrorMessage(DEFAULT_KEY_ERROR);

    try {
      // Save only for now — skip live provider validation so setup can continue
      // even when network/provider checks are flaky.
      const saveRes = await fetch('/api/workspace/provider-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: trimmed,
          // Only OpenRouter carries a routing slug; blank falls back server-side.
          ...(provider === 'OPENROUTER' && model.trim()
            ? { model: model.trim() }
            : {}),
        }),
      });

      if (!saveRes.ok) {
        const saveJson = (await saveRes.json().catch(() => null)) as {
          code?: string;
        } | null;
        setErrorMessage(friendlySaveError(saveRes.status, saveJson?.code));
        setCardState('error');
        return;
      }

      setCardState('success');
      onSaved?.();
    } catch {
      setErrorMessage(DEFAULT_KEY_ERROR);
      setCardState('error');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1 — Add your AI key</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Anthropic, OpenAI or OpenRouter — any one of them is enough to operate
          RestoreAssist.
        </p>

        {/* Provider selector */}
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Select AI provider"
        >
          {(Object.keys(PROVIDER_META) as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={provider === p}
              onClick={() => {
                setProvider(p);
                setCardState('idle');
                // The slug is OpenRouter-only; carrying it across a provider
                // switch would silently post a meaningless model.
                if (p !== 'OPENROUTER') setModel('');
              }}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                provider === p
                  ? 'bg-brand-navy text-white border-brand-navy'
                  : 'bg-white dark:bg-slate-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-slate-700 hover:border-brand-navy',
              ].join(' ')}
            >
              {PROVIDER_META[p].label}
            </button>
          ))}
        </div>

        {/* Success state */}
        {cardState === 'success' ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircleMark size={16} className="shrink-0" />
            <span>Key saved — {meta.label} is ready to use.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Key input */}
            <div className="space-y-1.5">
              <label htmlFor="ai-key-input" className="text-sm font-medium">
                API key
              </label>
              <Input
                id="ai-key-input"
                type="password"
                placeholder={meta.placeholder}
                value={apiKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setApiKey(e.target.value);
                  if (cardState === 'error') setCardState('idle');
                }}
                autoComplete="off"
                aria-describedby={cardState === 'error' ? 'ai-key-error' : undefined}
              />
            </div>

            {/* OpenRouter model picker — live catalogue, no pinned versions */}
            {provider === 'OPENROUTER' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="openrouter-model-select"
                  className="text-sm font-medium"
                >
                  Model{' '}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </label>

                {catalogueLoading ? (
                  <Input
                    id="openrouter-model-select"
                    type="text"
                    placeholder="Loading models…"
                    value={model}
                    disabled
                    readOnly
                    className="font-mono"
                  />
                ) : catalogue && !catalogue.unavailable ? (
                  <select
                    id="openrouter-model-select"
                    value={model}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setModel(e.target.value)
                    }
                    className="w-full rounded-md border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    <option value="">
                      Use the default ({OPENROUTER_DEFAULT_MODEL})
                    </option>
                    {catalogue.recommended.length > 0 && (
                      <optgroup label="Recommended open models">
                        {catalogue.recommended.map((m: CatalogueModel) => (
                          <option key={`rec-${m.id}`} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="All OpenRouter models">
                      {catalogue.models.map((m: CatalogueModel) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                ) : (
                  <Input
                    id="openrouter-model-select"
                    type="text"
                    placeholder={OPENROUTER_DEFAULT_MODEL}
                    value={model}
                    // Mirrors the server bound in POST provider-connections.
                    // The slice is the real guard: maxLength alone is bypassed
                    // by a paste in some engines and by any non-UI caller, and
                    // this value is serialised into an encrypted credential.
                    maxLength={MAX_MODEL_SLUG_LENGTH}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setModel(e.target.value.slice(0, MAX_MODEL_SLUG_LENGTH))
                    }
                    autoComplete="off"
                    className="font-mono"
                  />
                )}

                <p className="text-xs text-muted-foreground">
                  {catalogueLoading
                    ? 'Loading the current model list from OpenRouter…'
                    : catalogue?.unavailable
                      ? "We couldn't reach OpenRouter's model list — paste a slug, or leave it blank for the default."
                      : 'Leave blank to use the default. You can change this later in settings.'}
                </p>
              </div>
            )}

            {/* Error state */}
            {cardState === 'error' && (
              <div
                id="ai-key-error"
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {errorMessage}
              </div>
            )}

            {/* Validate & save button */}
            <Button
              onClick={handleSave}
              disabled={!apiKey.trim() || cardState === 'saving'}
              className="w-full"
            >
              {cardState === 'saving' ? (
                <>
                  <SpinnerMark size={14} className="animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                'Save key'
              )}
            </Button>

            {/* How-to affordance */}
            <p className="text-xs text-muted-foreground text-center">
              Need a key?{' '}
              <a
                href="/dashboard/settings/ai-providers"
                className="text-blue-600 hover:underline"
              >
                Here&apos;s how to get one
              </a>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
