'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSetupStore, type SetupOrganization } from './store';
import { BusinessDetailsCard } from './BusinessDetailsCard';
import { BrandCard } from './BrandCard';
import { PricingCard } from './PricingCard';
import { StorageCard } from './StorageCard';
import { DatabaseCard } from './DatabaseCard';
import { IntegrationsCard } from './IntegrationsCard';
import { FeatureHealthCard } from './FeatureHealthCard';
import { VideoExplainer } from './VideoExplainer';
import { AiKeyCard } from './AiKeyCard';
import { SetupStepper, type SetupStepperItem } from './SetupStepper';
import { Button } from '@/components/ui/button';

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
  const org = useSetupStore((s) => s.org);
  const router = useRouter();

  // AI-key completion is the one gate the store doesn't already carry, so read
  // it from the canonical onboarding status (same signal the setup gate uses).
  const [hasApiKey, setHasApiKey] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/onboarding/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.steps?.ai_provider) {
          setHasApiKey(!!d.steps.ai_provider.completed);
        }
      })
      .catch(() => {
        /* offline / not ready — leave the AI-key step locked */
      });
    return () => {
      active = false;
    };
  }, []);

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
            .then(async (r) => {
              if (!r.ok) throw new Error(`state refetch ${r.status}`);
              return r.json();
            })
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
            .catch((err) => {
              console.error('[setup] state refresh failed:', err);
              // Surface to the user rather than freezing mid-hydrate.
              setSectionStatus(jobKindToSectionKey('ABR'), 'error');
            });
        }
      } catch (err) {
        console.error('[setup] SSE parse error:', err);
      }
    };
    es.onerror = (err) => console.error('[setup] SSE error:', err);

    return () => es.close();
  }, [initial, setOrg, setSectionStatus]);

  // Locked one-step-at-a-time flow (Phase 4). Completion for the two required
  // steps (AI key + business details) gates progression; optional steps never
  // block. The flow ends on a "first report" step whose CTA is enabled once the
  // required steps are done.
  const businessComplete = !!(org?.legalName && org?.abn && org?.state);
  const steps: SetupStepperItem[] = [
    {
      key: 'welcome',
      title: 'Welcome',
      required: false,
      complete: true,
      content: <VideoExplainer slug="remotion-onboarding-welcome" />,
    },
    {
      key: 'ai_key',
      title: 'Add your AI key',
      required: true,
      complete: hasApiKey,
      content: <AiKeyCard />,
    },
    {
      key: 'business',
      title: 'Business details',
      required: true,
      complete: businessComplete,
      content: <BusinessDetailsCard />,
    },
    {
      key: 'branding',
      title: 'Branding',
      required: false,
      complete: !!(org?.logoUrl || org?.primaryColor),
      content: <BrandCard />,
    },
    {
      key: 'pricing',
      title: 'Pricing',
      required: false,
      complete: !!org?.pricingConfig,
      content: <PricingCard />,
    },
    {
      key: 'storage',
      title: 'Storage',
      required: false,
      complete: false,
      content: (
        <div className="space-y-6">
          <StorageCard />
          <DatabaseCard />
        </div>
      ),
    },
    {
      key: 'integrations',
      title: 'Integrations',
      required: false,
      complete: false,
      content: (
        <div className="space-y-6">
          <IntegrationsCard />
          <FeatureHealthCard />
        </div>
      ),
    },
    {
      key: 'first_report',
      title: 'Your first report',
      required: false,
      complete: false,
      content: (
        <div className="rounded-xl border p-6 space-y-3 text-center">
          <h2 className="text-lg font-semibold">You&apos;re ready — let&apos;s make your first report</h2>
          <p className="text-sm text-muted-foreground">
            Turn a job into an IICRC S500:2021 compliance report. You can always
            come back and finish the optional steps later.
          </p>
          <Button asChild>
            <Link href="/dashboard/reports/new">Generate your first report</Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <main className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Let&apos;s get you set up</h1>
        <p className="text-muted-foreground">
          One step at a time — we&apos;ll have you generating your first report in
          minutes.
        </p>
      </div>
      <SetupStepper
        items={steps}
        onFinish={() => router.push('/dashboard/reports/new')}
      />
    </main>
  );
}
