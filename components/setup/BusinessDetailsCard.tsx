'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetupStore } from './store';
import { isValidAbn, normaliseAbn } from '@/lib/abn/checksum';

export function BusinessDetailsCard() {
  const status = useSetupStore((s) => s.sections.businessDetails);
  const org = useSetupStore((s) => s.org);
  const setSectionStatus = useSetupStore((s) => s.setSectionStatus);
  const [abn, setAbn] = useState<string>(org?.abn ?? '');
  const [website, setWebsite] = useState<string>(org?.website ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const normalised = normaliseAbn(abn);
  const canSubmit = !!normalised && isValidAbn(normalised) && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    // Optimistic UI: flip statuses immediately
    setSectionStatus('businessDetails', 'running');
    setSectionStatus('branding', website ? 'running' : 'manual');
    setSectionStatus('pricing', 'running');

    try {
      const res = await fetch('/api/setup/hydrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abn: normalised, website: website || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        setSubmitError(body.error ?? `Request failed (${res.status})`);
        // Revert section states on failure
        setSectionStatus('businessDetails', 'pending');
        setSectionStatus('branding', 'pending');
        setSectionStatus('pricing', 'pending');
      }
    } catch (err) {
      setSubmitError('Network error — check your connection and try again');
      setSectionStatus('businessDetails', 'pending');
      setSectionStatus('branding', 'pending');
      setSectionStatus('pricing', 'pending');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PENDING — form */}
        {status === 'pending' && (
          <>
            <div className="space-y-2">
              <label htmlFor="abn" className="text-sm font-medium">
                ABN <span className="text-muted-foreground">(11 digits)</span>
              </label>
              <Input
                id="abn"
                placeholder="e.g. 53 004 085 616"
                value={abn}
                onChange={(e) => setAbn(e.target.value)}
                aria-describedby="abn-help"
                autoComplete="off"
              />
              <p id="abn-help" className="text-xs text-muted-foreground">
                We'll auto-fill your business details from the Australian Business Register.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="website" className="text-sm font-medium">
                Website <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="website"
                type="url"
                placeholder="https://yourcompany.com.au"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                If provided, we'll pull your logo, brand colours, and "about us" copy automatically.
              </p>
            </div>
            {submitError && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {submitError}
              </div>
            )}
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              aria-label="Start setup"
              className="w-full"
            >
              {submitting ? 'Starting…' : 'Start setup'}
            </Button>
          </>
        )}

        {/* RUNNING — skeleton */}
        {status === 'running' && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground animate-pulse">
              Looking up your business in the Australian Business Register…
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
              <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
              <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
            </div>
          </div>
        )}

        {/* READY — show fetched data */}
        {status === 'ready' && org && (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Legal name</dt>
            <dd>{org.legalName || '—'}</dd>
            {org.tradingName && (
              <>
                <dt className="text-muted-foreground">Trading name</dt>
                <dd>{org.tradingName}</dd>
              </>
            )}
            <dt className="text-muted-foreground">ABN</dt>
            <dd className="font-mono text-xs">{org.abn || '—'}</dd>
            {org.acn && (
              <>
                <dt className="text-muted-foreground">ACN</dt>
                <dd className="font-mono text-xs">{org.acn}</dd>
              </>
            )}
            <dt className="text-muted-foreground">State</dt>
            <dd>{org.state || '—'}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <span className="inline-flex items-center gap-1 text-success dark:text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            </dd>
          </dl>
        )}

        {/* ERROR / MANUAL — fallback manual entry */}
        {(status === 'error' || status === 'manual') && (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
              We couldn't reach the Business Register. Fill in your details manually below and we'll re-try in the background.
            </div>
            <Input
              placeholder="Legal name"
              value={org?.legalName ?? ''}
              onChange={(e) => useSetupStore.getState().updateOrgField('legalName', e.target.value)}
            />
            <Input
              placeholder="ABN"
              value={org?.abn ?? ''}
              onChange={(e) => useSetupStore.getState().updateOrgField('abn', e.target.value)}
            />
            <Input
              placeholder="State (NSW, VIC, etc.)"
              value={org?.state ?? ''}
              onChange={(e) => useSetupStore.getState().updateOrgField('state', e.target.value)}
            />
            {/* TODO(Phase 7+): PATCH /api/setup/state on blur to persist manual edits */}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
