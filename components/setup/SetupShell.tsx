'use client';
import { useEffect } from 'react';
import { useSetupStore, type SetupOrganization } from './store';
import { BusinessDetailsCard } from './BusinessDetailsCard';
import { BrandCard } from './BrandCard';
import { PricingCard } from './PricingCard';
import { StorageCard } from './StorageCard';
import { IntegrationsCard } from './IntegrationsCard';
import { FeatureHealthCard } from './FeatureHealthCard';
import { VideoExplainer } from './VideoExplainer';

type SectionKey = 'businessDetails' | 'branding' | 'pricing' | 'storage' | 'integrations';

function jobKindToSectionKey(kind: 'ABR' | 'WEBSITE' | 'PRICING'): SectionKey {
  if (kind === 'ABR') return 'businessDetails';
  if (kind === 'WEBSITE') return 'branding';
  return 'pricing';
}

function jobStatusToHydrationState(status: string): 'pending' | 'running' | 'ready' | 'error' | 'manual' {
  const s = status.toLowerCase();
  if (s === 'ready' || s === 'error' || s === 'manual' || s === 'running') return s as 'ready' | 'error' | 'manual' | 'running';
  return 'pending';
}

interface InitialPayload extends SetupOrganization {
  hydrationJobs: Array<{ kind: 'ABR' | 'WEBSITE' | 'PRICING'; status: string }>;
}

export function SetupShell({ initial }: { initial: InitialPayload }) {
  const setOrg = useSetupStore((s) => s.setOrg);
  const setSectionStatus = useSetupStore((s) => s.setSectionStatus);

  useEffect(() => {
    const { hydrationJobs, ...orgFields } = initial;
    setOrg(orgFields);
    for (const job of hydrationJobs) {
      setSectionStatus(jobKindToSectionKey(job.kind), jobStatusToHydrationState(job.status));
    }

    // SSE bridge — only subscribe if any non-terminal jobs
    const hasActive = hydrationJobs.some((j) => j.status === 'RUNNING');
    if (!hasActive) return;

    const es = new EventSource('/api/setup/hydrate/stream');
    es.onmessage = (e) => {
      try {
        const jobs: Array<{ kind: 'ABR' | 'WEBSITE' | 'PRICING'; status: string }> = JSON.parse(e.data);
        for (const job of jobs) {
          setSectionStatus(jobKindToSectionKey(job.kind), jobStatusToHydrationState(job.status));
        }
        // Re-fetch the canonical Organization snapshot whenever a job hits READY
        if (jobs.some((j) => j.status === 'READY')) {
          fetch('/api/setup/state')
            .then((r) => r.json())
            .then((data) => {
              if (data?.data?.organization) {
                const { hydrationJobs: _drop, pricingConfig: _p, ...orgOnly } = data.data.organization;
                setOrg({
                  ...orgOnly,
                  setupStartedAt: orgOnly.setupStartedAt ? new Date(orgOnly.setupStartedAt).toISOString() : null,
                  setupCompletedAt: orgOnly.setupCompletedAt ? new Date(orgOnly.setupCompletedAt).toISOString() : null,
                });
              }
            })
            .catch((err) => console.error('[setup] state refresh failed:', err));
        }
      } catch (err) {
        console.error('[setup] SSE parse error:', err);
      }
    };
    es.onerror = (err) => console.error('[setup] SSE error:', err);

    return () => es.close();
  }, [initial, setOrg, setSectionStatus]);

  return (
    <main className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Let&apos;s get you set up</h1>
      <p className="text-muted-foreground">Enter your ABN below — we&apos;ll do the rest.</p>
      <VideoExplainer slug="remotion-onboarding-welcome" />
      <BusinessDetailsCard />
      <BrandCard />
      <PricingCard />
      <StorageCard />
      <IntegrationsCard />
      <FeatureHealthCard />
    </main>
  );
}
