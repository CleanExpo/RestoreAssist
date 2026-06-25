'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Loader2 } from 'lucide-react';

type Provider = 'ANTHROPIC' | 'OPENAI';

const PROVIDER_META: Record<Provider, { label: string; placeholder: string }> = {
  ANTHROPIC: {
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-api03-…',
  },
  OPENAI: {
    label: 'OpenAI (GPT)',
    placeholder: 'sk-proj-…',
  },
};

type CardState = 'idle' | 'saving' | 'success' | 'error';

export function AiKeyCard() {
  const [provider, setProvider] = useState<Provider>('ANTHROPIC');
  const [apiKey, setApiKey] = useState('');
  const [cardState, setCardState] = useState<CardState>('idle');

  const meta = PROVIDER_META[provider];

  async function handleValidateAndSave() {
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    setCardState('saving');

    try {
      // Step 1: save the key
      const saveRes = await fetch('/api/workspace/provider-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: trimmed }),
      });

      if (!saveRes.ok) {
        setCardState('error');
        return;
      }

      // Step 2: validate the saved key
      const validateRes = await fetch('/api/workspace/provider-connections/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      const validateJson = await validateRes.json();

      if (!validateRes.ok || !validateJson.valid) {
        setCardState('error');
        return;
      }

      setCardState('success');
    } catch {
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
          Anthropic OR OpenAI — either one is enough to operate RestoreAssist.
        </p>

        {/* Provider selector */}
        <div className="flex gap-2" role="group" aria-label="Select AI provider">
          {(Object.keys(PROVIDER_META) as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={provider === p}
              onClick={() => {
                setProvider(p);
                setCardState('idle');
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
            <CheckCircle2 size={16} className="shrink-0" />
            <span>Key validated — {meta.label} is ready to use.</span>
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

            {/* Error state */}
            {cardState === 'error' && (
              <div
                id="ai-key-error"
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                We couldn&apos;t save or validate that key. Please check the key and try again.
              </div>
            )}

            {/* Validate & save button */}
            <Button
              onClick={handleValidateAndSave}
              disabled={!apiKey.trim() || cardState === 'saving'}
              className="w-full"
            >
              {cardState === 'saving' ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-2" />
                  Validating…
                </>
              ) : (
                'Validate & save'
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
