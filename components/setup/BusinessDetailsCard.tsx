'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetupStore } from './store';
import { isValidAbn, normaliseAbn } from '@/lib/abn/checksum';

// Persists a single manually-entered org field — same PATCH endpoint the
// brand/pricing manual-fallback cards use (see BrandCard.tsx `patchState`).
async function patchState(
  field: string,
  value: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/setup/state', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  });
  if (!res.ok) {
    // PATCH /api/setup/state responds via `apiError` — nested `{ error: { message } }`,
    // not the flat `{ error: string }` shape /api/setup/hydrate uses.
    const body = await res.json().catch(() => null);
    return { ok: false, error: body?.error?.message ?? `Request failed (${res.status})` };
  }
  return { ok: true };
}

export function BusinessDetailsCard() {
  const status = useSetupStore((s) => s.sections.businessDetails);
  const org = useSetupStore((s) => s.org);
  const setSectionStatus = useSetupStore((s) => s.setSectionStatus);
  const updateOrgField = useSetupStore((s) => s.updateOrgField);
  const [abn, setAbn] = useState<string>(org?.abn ?? '');
  const [website, setWebsite] = useState<string>(org?.website ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [fieldError, setFieldError] = useState<Record<string, string | null>>({});

  // Manual-fallback persistence: local store update is optimistic, the PATCH
  // is what actually saves it — without this the field silently reverts to
  // whatever the server has (or nothing) on the next hydrate/refresh.
  //
  // Must check response.ok: this route rejects checksum-invalid ABNs with
  // 400 (see app/api/setup/state/route.ts), so an unchecked fetch here would
  // silently discard a typo'd ABN with zero user-visible feedback — the same
  // defect class this component was fixed to close. Mirrors handleSubmit's
  // res.ok / body.error handling below.
  const persistManualField = async (
    field: 'legalName' | 'abn' | 'state',
    value: string,
  ) => {
    setSaving((p) => ({ ...p, [field]: true }));
    setFieldError((p) => ({ ...p, [field]: null }));
    try {
      const result = await patchState(field, value || null);
      if (!result.ok) {
        setFieldError((p) => ({ ...p, [field]: result.error ?? 'Failed to save' }));
      }
    } finally {
      setSaving((p) => ({ ...p, [field]: false }));
    }
  };

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
              <span className="inline-flex items-center gap-1 text-success">
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
            <div className="space-y-1">
              <Input
                placeholder="Legal name"
                value={org?.legalName ?? ''}
                onChange={(e) => updateOrgField('legalName', e.target.value)}
                onBlur={(e) => void persistManualField('legalName', e.target.value)}
              />
              {fieldError.legalName && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldError.legalName}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Input
                placeholder="ABN"
                value={org?.abn ?? ''}
                onChange={(e) => updateOrgField('abn', e.target.value)}
                onBlur={(e) => void persistManualField('abn', e.target.value)}
              />
              {fieldError.abn && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldError.abn}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Input
                placeholder="State (NSW, VIC, etc.)"
                value={org?.state ?? ''}
                onChange={(e) => updateOrgField('state', e.target.value)}
                onBlur={(e) => void persistManualField('state', e.target.value)}
              />
              {fieldError.state && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldError.state}
                </p>
              )}
            </div>
            {(saving.legalName || saving.abn || saving.state) && (
              <span className="text-xs text-muted-foreground">Saving…</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
