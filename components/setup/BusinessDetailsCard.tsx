'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetupStore } from './store';
import { isValidAbn, normaliseAbn } from '@/lib/abn/checksum';
import { normalizeNZBN, validateNZBN } from '@/lib/validation/nzbn-validator';
import { DEFAULT_ORGANIZATION_TIMEZONE, ORGANIZATION_TIMEZONES } from '@/lib/locale/organization-locale';
import { getGstTreatment } from '@/lib/gst-rules';

type SetupCountry = 'AU' | 'NZ';
type ManualField = 'legalName' | 'abn' | 'nzbn' | 'state';

async function patchState(fields: Record<string, string | null>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/setup/state', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return {
      ok: false,
      error: body?.error?.message ?? `Request failed (${res.status})`,
    };
  }
  return { ok: true };
}

export function BusinessDetailsCard() {
  const status = useSetupStore((s) => s.sections.businessDetails);
  const org = useSetupStore((s) => s.org);
  const setSectionStatus = useSetupStore((s) => s.setSectionStatus);
  const updateOrgField = useSetupStore((s) => s.updateOrgField);

  const [country, setCountry] = useState<SetupCountry>(org?.country ?? 'AU');
  const [timezone, setTimezone] = useState(org?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE[org?.country ?? 'AU']);
  const [legalName, setLegalName] = useState(org?.legalName ?? '');
  const [abn, setAbn] = useState(org?.abn ?? '');
  const [nzbn, setNzbn] = useState(org?.nzbn ?? '');
  const [region, setRegion] = useState(org?.state ?? '');
  const [website, setWebsite] = useState(org?.website ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [fieldError, setFieldError] = useState<Record<string, string | null>>({});

  const chooseCountry = (nextCountry: SetupCountry) => {
    const nextTimezone = DEFAULT_ORGANIZATION_TIMEZONE[nextCountry];
    setCountry(nextCountry);
    setTimezone(nextTimezone);
    updateOrgField('country', nextCountry);
    updateOrgField('timezone', nextTimezone);
  };

  const persistManualField = async (field: ManualField, value: string) => {
    setSaving((previous) => ({ ...previous, [field]: true }));
    setFieldError((previous) => ({ ...previous, [field]: null }));
    try {
      const result = await patchState({ [field]: value || null });
      if (!result.ok) {
        setFieldError((previous) => ({
          ...previous,
          [field]: result.error ?? 'Failed to save',
        }));
      }
    } finally {
      setSaving((previous) => ({ ...previous, [field]: false }));
    }
  };

  const persistCountry = async (nextCountry: SetupCountry) => {
    chooseCountry(nextCountry);
    const nextTimezone = DEFAULT_ORGANIZATION_TIMEZONE[nextCountry];
    const result = await patchState({
      country: nextCountry,
      timezone: nextTimezone,
      abn: nextCountry === 'NZ' ? null : (org?.abn ?? null),
      acn: nextCountry === 'NZ' ? null : (org?.acn ?? null),
      nzbn: nextCountry === 'AU' ? null : (org?.nzbn ?? null),
    });
    if (!result.ok) setSubmitError(result.error ?? 'Failed to save country');
  };

  const normalizedAbn = normaliseAbn(abn);
  const normalizedNzbn = normalizeNZBN(nzbn);
  const gstTreatment = getGstTreatment(country);
  const canSubmit = !submitting && (country === 'AU' ? !!normalizedAbn && isValidAbn(normalizedAbn) : !!legalName.trim() && !!region.trim() && validateNZBN(normalizedNzbn).valid);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (country === 'NZ') {
        const result = await patchState({
          country,
          timezone,
          legalName: legalName.trim(),
          nzbn: normalizedNzbn,
          state: region.trim(),
          website: website.trim() || null,
        });
        if (!result.ok) {
          setSubmitError(result.error ?? 'Failed to save business details');
          return;
        }

        updateOrgField('country', country);
        updateOrgField('timezone', timezone);
        updateOrgField('legalName', legalName.trim());
        updateOrgField('nzbn', normalizedNzbn);
        updateOrgField('state', region.trim());
        updateOrgField('website', website.trim() || null);
        setSectionStatus('businessDetails', 'ready');
        setSectionStatus('branding', 'manual');
        setSectionStatus('pricing', 'manual');
        return;
      }

      const localeResult = await patchState({ country, timezone });
      if (!localeResult.ok) {
        setSubmitError(localeResult.error ?? 'Failed to save country');
        return;
      }

      updateOrgField('country', country);
      updateOrgField('timezone', timezone);
      setSectionStatus('businessDetails', 'running');
      setSectionStatus('branding', website ? 'running' : 'manual');
      setSectionStatus('pricing', 'running');

      const res = await fetch('/api/setup/hydrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abn: normalizedAbn,
          website: website || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        setSubmitError(body.error ?? `Request failed (${res.status})`);
        setSectionStatus('businessDetails', 'pending');
        setSectionStatus('branding', 'pending');
        setSectionStatus('pricing', 'pending');
      }
    } catch {
      setSubmitError('Network error — check your connection and try again');
      setSectionStatus('businessDetails', 'pending');
      setSectionStatus('branding', 'pending');
      setSectionStatus('pricing', 'pending');
    } finally {
      setSubmitting(false);
    }
  };

  const countryField = (
    <div className="space-y-2">
      <label htmlFor="business-country" className="text-sm font-medium">
        Country
      </label>
      <select
        id="business-country"
        value={country}
        onChange={(event) => {
          const nextCountry = event.target.value as SetupCountry;
          if (status === 'pending') chooseCountry(nextCountry);
          else void persistCountry(nextCountry);
        }}
        className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="AU">Australia</option>
        <option value="NZ">New Zealand</option>
      </select>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'pending' && (
          <>
            {countryField}
            {country === 'AU' ? (
              <div className="space-y-2">
                <label htmlFor="abn" className="text-sm font-medium">
                  ABN <span className="text-muted-foreground">(11 digits)</span>
                </label>
                <Input id="abn" placeholder="e.g. 53 004 085 616" value={abn} onChange={(event) => setAbn(event.target.value)} aria-describedby="business-number-help" autoComplete="off" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="legal-name" className="text-sm font-medium">
                    Legal name
                  </label>
                  <Input id="legal-name" placeholder="Registered legal name" value={legalName} onChange={(event) => setLegalName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label htmlFor="nzbn" className="text-sm font-medium">
                    NZBN <span className="text-muted-foreground">(13 digits)</span>
                  </label>
                  <Input id="nzbn" placeholder="e.g. 9429 0312 3456 6" value={nzbn} onChange={(event) => setNzbn(event.target.value)} aria-describedby="business-number-help" autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="region" className="text-sm font-medium">
                    Region
                  </label>
                  <Input id="region" placeholder="e.g. Auckland" value={region} onChange={(event) => setRegion(event.target.value)} />
                </div>
              </>
            )}
            <p id="business-number-help" className="text-xs text-muted-foreground">
              {country === 'AU' ? "We'll auto-fill your business details from the Australian Business Register." : 'Enter the registered details shown for your New Zealand business.'}
            </p>
            <div className="space-y-2">
              <label htmlFor="timezone" className="text-sm font-medium">
                Timezone
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {ORGANIZATION_TIMEZONES[country].map((value) => (
                  <option key={value} value={value}>
                    {value.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Billing will use {gstTreatment.currency} and {gstTreatment.percentLabel} GST.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="website" className="text-sm font-medium">
                Website <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="website"
                type="url"
                placeholder={country === 'NZ' ? 'https://yourcompany.co.nz' : 'https://yourcompany.com.au'}
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                autoComplete="off"
              />
            </div>
            {submitError && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {submitError}
              </div>
            )}
            <Button onClick={handleSubmit} disabled={!canSubmit} aria-label={country === 'NZ' ? 'Save business details' : 'Start setup'} className="min-h-11 w-full">
              {submitting ? 'Saving…' : country === 'NZ' ? 'Save business details' : 'Start setup'}
            </Button>
          </>
        )}

        {status === 'running' && (
          <div className="space-y-3">
            <div className="animate-pulse text-sm text-muted-foreground">Looking up your business in the Australian Business Register…</div>
            <div className="space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          </div>
        )}

        {status === 'ready' && org && (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Country</dt>
            <dd>{org.country === 'NZ' ? 'New Zealand' : 'Australia'}</dd>
            <dt className="text-muted-foreground">Legal name</dt>
            <dd>{org.legalName || '—'}</dd>
            {org.tradingName && (
              <>
                <dt className="text-muted-foreground">Trading name</dt>
                <dd>{org.tradingName}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{org.country === 'NZ' ? 'NZBN' : 'ABN'}</dt>
            <dd className="font-mono text-xs">{(org.country === 'NZ' ? org.nzbn : org.abn) || '—'}</dd>
            {org.country === 'AU' && org.acn && (
              <>
                <dt className="text-muted-foreground">ACN</dt>
                <dd className="font-mono text-xs">{org.acn}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{org.country === 'NZ' ? 'Region' : 'State'}</dt>
            <dd>{org.state || '—'}</dd>
            <dt className="text-muted-foreground">Timezone</dt>
            <dd>{org.timezone.replace('_', ' ')}</dd>
            <dt className="text-muted-foreground">Tax</dt>
            <dd>
              {getGstTreatment(org.country).currency} · {getGstTreatment(org.country).percentLabel} GST
            </dd>
          </dl>
        )}

        {(status === 'error' || status === 'manual') && (
          <div className="space-y-3">
            {countryField}
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
              {country === 'AU'
                ? "We couldn't reach the Business Register. Enter your details manually and we'll retry in the background."
                : 'Enter the registered details for your New Zealand business.'}
            </div>
            <div className="space-y-1">
              <Input
                placeholder="Legal name"
                value={org?.legalName ?? ''}
                onChange={(event) => updateOrgField('legalName', event.target.value)}
                onBlur={(event) => void persistManualField('legalName', event.target.value)}
              />
              {fieldError.legalName && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldError.legalName}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Input
                placeholder={country === 'NZ' ? 'NZBN' : 'ABN'}
                value={country === 'NZ' ? (org?.nzbn ?? '') : (org?.abn ?? '')}
                onChange={(event) => updateOrgField(country === 'NZ' ? 'nzbn' : 'abn', event.target.value)}
                onBlur={(event) => void persistManualField(country === 'NZ' ? 'nzbn' : 'abn', event.target.value)}
              />
              {fieldError[country === 'NZ' ? 'nzbn' : 'abn'] && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldError[country === 'NZ' ? 'nzbn' : 'abn']}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Input
                placeholder={country === 'NZ' ? 'Region (Auckland, Canterbury, etc.)' : 'State (NSW, VIC, etc.)'}
                value={org?.state ?? ''}
                onChange={(event) => updateOrgField('state', event.target.value)}
                onBlur={(event) => void persistManualField('state', event.target.value)}
              />
              {fieldError.state && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldError.state}
                </p>
              )}
            </div>
            {Object.values(saving).some(Boolean) && <span className="text-xs text-muted-foreground">Saving…</span>}
            {submitError && (
              <p role="alert" className="text-xs text-destructive">
                {submitError}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
