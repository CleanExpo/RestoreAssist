'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type CheckStatus = 'green' | 'yellow' | 'red';

interface CheckResult {
  capability: string;
  label: string;
  status: CheckStatus;
  note?: string;
}

export function FeatureHealthCard({ postActivation = false }: { postActivation?: boolean } = {}) {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const fetchChecks = async () => {
      try {
        const r = await fetch('/api/setup/checks');
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        const next = Array.isArray(j?.data?.checks) ? j.data.checks : [];
        setChecks(next);
        setLoaded(true);

        // RA-4990 — stop polling once everything's green. /api/setup/checks
        // fires ~5 Prisma queries per call; on connection_limit=1 serverless
        // pools, the runaway 5s interval keeps the pool perpetually busy and
        // exhausts neighbours (OAuth-callback writes, status reads, ABR jobs).
        // Once the wizard is in steady-state green, no more polling is needed
        // — the user clicks Activate to leave the page, which clears the
        // interval via the cleanup function below.
        const allGreen =
          next.length > 0 && next.every((c: CheckResult) => c.status === 'green');
        if (allGreen && intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      } catch (err) {
        console.error('[setup] checks fetch failed:', err);
      }
    };

    void fetchChecks();
    intervalId = window.setInterval(() => void fetchChecks(), 5000);
    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, []);

  const reds = checks.filter((c) => c.status === 'red');
  const yellows = checks.filter((c) => c.status === 'yellow');
  const greens = checks.filter((c) => c.status === 'green');

  const activate = async () => {
    setActivating(true);
    setActivateError(null);
    try {
      const r = await fetch('/api/setup/activate', { method: 'POST' });
      if (r.ok) {
        const j = await r.json();
        window.location.href = j?.data?.redirectTo ?? '/dashboard?firstRun=1';
      } else {
        const j = await r.json().catch(() => ({}));
        setActivateError(j?.error ?? `Activation failed (${r.status})`);
        setActivating(false);
      }
    } catch (err) {
      setActivateError('Network error during activation');
      setActivating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{postActivation ? 'Workspace health' : 'Ready to activate'}</CardTitle>
        {loaded && (
          <p className="text-sm text-muted-foreground">
            {greens.length} of {checks.length} verified
            {yellows.length > 0 && ` · ${yellows.length} optional skipped`}
            {reds.length > 0 && ` · ${reds.length} need attention`}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!loaded && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                <div className="h-3 w-3 bg-muted rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {loaded && checks.length === 0 && (
          <p className="text-sm text-muted-foreground">No capabilities reported yet.</p>
        )}

        {loaded && checks.length > 0 && (
          <ul className="space-y-2">
            {checks.map((c) => (
              <li key={c.capability} className="flex items-start justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <StatusPill status={c.status} />
                  <span>{c.label}</span>
                </span>
                {c.note && (
                  <span className="text-xs text-muted-foreground text-right max-w-[60%]">{c.note}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {!postActivation && loaded && (
          <div className="pt-2 space-y-2">
            <Button
              size="lg"
              className="w-full"
              disabled={reds.length > 0 || activating}
              onClick={activate}
              aria-label="Activate my workspace"
            >
              {activating ? 'Activating…' : 'Activate my workspace'}
            </Button>
            {yellows.length > 0 && reds.length === 0 && (
              <p className="text-xs text-muted-foreground text-center">
                You can activate now and connect {yellows.map((y) => y.label).join(', ')} later from Settings.
              </p>
            )}
            {activateError && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                {activateError}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: CheckStatus }) {
  const cls =
    status === 'green' ? 'bg-emerald-500'
    : status === 'yellow' ? 'bg-amber-500'
    : 'bg-rose-500';
  const labels = { green: 'OK', yellow: 'Optional', red: 'Needs attention' };
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${cls}`}
      aria-label={labels[status]}
      role="img"
    />
  );
}
