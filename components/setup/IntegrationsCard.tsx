'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, KeyRound } from 'lucide-react';
import {
  integrationConnectFailure,
  type IntegrationConnectFailure,
} from '@/lib/setup/integration-connect-error';

interface Provider {
  key: string;
  name: string;
  description: string;
  /**
   * `oauth` providers are served by /api/integrations/oauth/[provider]/connect.
   * `manual` providers need a credential the operator has to paste, so the
   * wizard hands them to the full Integrations page rather than pretending a
   * one-click connect exists.
   */
  mode: 'oauth' | 'manual';
}

/**
 * Where a `manual` provider is actually set up. Bypassed in `proxy.ts`'s
 * SETUP_GATE_BYPASS so it stays reachable while setup is still incomplete.
 */
const INTEGRATIONS_SETTINGS_URL = '/dashboard/integrations';

const PROVIDERS: Provider[] = [
  { key: 'xero',       name: 'Xero',       description: 'Invoice + payment sync',    mode: 'oauth'  },
  { key: 'myob',       name: 'MYOB',       description: 'AccountRight ledger sync',  mode: 'oauth'  },
  { key: 'quickbooks', name: 'QuickBooks', description: 'Customer + invoice sync',   mode: 'oauth'  },
  { key: 'servicem8',  name: 'ServiceM8',  description: 'Job import',                mode: 'oauth'  },
  // Ascora authenticates with a static API key, not OAuth — the OAuth route
  // rejects it outright ("Ascora does not use OAuth"), so a Connect button
  // pointed there could only ever fail.
  { key: 'ascora',     name: 'Ascora',     description: 'Work orders + line items — needs an API key', mode: 'manual' },
];

export function IntegrationsCard() {
  const [byokOpen, setByokOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<IntegrationConnectFailure | null>(null);

  // P1 (independent review, 2026-08-18): the success path deliberately leaves
  // `pending` set because the document is navigating away — but Back from the
  // provider's consent screen is the single most natural move in an OAuth
  // flow, and a bfcache restore brings this component back with its React
  // state intact. Without this, every tile stays disabled reading
  // "Connecting…" forever, with no failure surface to explain it: the exact
  // dead-click this card exists to remove, reintroduced on the success path.
  // `pageshow` also fires on a normal load, where `pending` is already null,
  // so the reset needs no `persisted` branch.
  useEffect(() => {
    const reset = () => setPending(null);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  async function handleConnect(provider: Provider) {
    // No re-entrancy check here on purpose. The only caller is the tile's
    // `onClick`, and every tile carries `disabled={pending !== null}` — React
    // decides whether to run `onClick` from the committed fiber props, so no
    // click (synthetic or assistive) reaches this function while a request is
    // in flight. A `if (pending) return` guard beside it survived every mutant
    // the suite could build, because it is unreachable by construction. If the
    // tiles ever stop being real disabled <button>s, the pending test goes red
    // and the guard has to come back.
    setPending(provider.key);
    setFailure(null);
    try {
      const res = await fetch(`/api/integrations/oauth/${provider.key}/connect`, {
        method: 'POST',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setFailure(integrationConnectFailure(res.status, body, provider.name));
        setPending(null);
        return;
      }

      const data = await res.json().catch(() => null);
      const authUrl = typeof data?.authUrl === 'string' ? data.authUrl : '';
      if (!authUrl) {
        setFailure({
          message: `${provider.name} didn't return a sign-in link. Try again, or connect it later from Settings.`,
        });
        setPending(null);
        return;
      }

      // Leave `pending` set: the document is navigating away, and re-enabling
      // the button would invite a second OAuth state row on the way out.
      window.location.href = authUrl;
    } catch {
      setFailure({
        message: `Couldn't reach RestoreAssist to connect ${provider.name}. Check your connection and try again.`,
      });
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your existing tools</CardTitle>
        <p className="text-sm text-muted-foreground">
          All optional. You can do this later from Settings.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PROVIDERS.map((p) => {
            const isPending = pending === p.key;
            const label = p.mode === 'manual' ? `Set up ${p.name}` : `Connect ${p.name}`;
            return (
              <button
                key={p.key}
                type="button"
                disabled={pending !== null}
                onClick={() => {
                  if (p.mode !== 'manual') return void handleConnect(p);
                  // Same-tab navigation: hold the other tiles so a fast second
                  // click cannot fire an OAuth POST on the way out.
                  setPending(p.key);
                  window.location.href = INTEGRATIONS_SETTINGS_URL;
                }}
                aria-label={label}
                className="rounded-md border border-border p-3 text-left transition hover:border-foreground/40 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-between gap-2"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-sm">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {isPending ? 'Connecting…' : p.description}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        {failure && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2"
          >
            <p className="text-destructive">{failure.message}</p>
            {failure.action && (
              <a
                href={failure.action.href}
                className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2"
              >
                {failure.action.label}
                <ChevronRight className="w-3 h-3" aria-hidden="true" />
              </a>
            )}
          </div>
        )}

        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setByokOpen((v) => !v)}
            aria-expanded={byokOpen}
            aria-controls="byok-section"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <KeyRound className="w-4 h-4" aria-hidden="true" />
            <span>BYOK AI keys (optional)</span>
            <ChevronRight className={`w-4 h-4 transition-transform ${byokOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
          </button>
          {byokOpen && (
            <div id="byok-section" className="mt-3 space-y-2 text-sm">
              <p className="text-muted-foreground">
                Add your own OpenAI / Anthropic / Gemini key to use premium models. We&apos;ll keep using our default Gemma if you skip this.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { window.location.href = '/dashboard/settings/ai-providers'; }}
              >
                Manage AI keys →
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
