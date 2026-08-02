'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RAIcon } from '@/components/brand/RAIcon';
import { useSetupStore, type SetupOrganization } from './store';
import { BusinessDetailsCard } from './BusinessDetailsCard';
import { BrandCard } from './BrandCard';
import { PricingCard } from './PricingCard';
import { IntegrationsCard } from './IntegrationsCard';
import { FeatureHealthCard } from './FeatureHealthCard';
import { VideoExplainer } from './VideoExplainer';
import { AiKeyCard } from './AiKeyCard';
import { SetupStepper, type SetupStepperItem } from './SetupStepper';

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
  const brandingComplete = !!(org?.logoUrl || org?.primaryColor);
  const pricingComplete = !!org?.pricingConfig;

  const steps: SetupStepperItem[] = [
    {
      key: 'welcome',
      title: 'Welcome',
      required: false,
      complete: true,
      description:
        'A two-minute tour of what RestoreAssist does and how setup works.',
      content: <VideoExplainer slug="remotion-onboarding-welcome" />,
    },
    {
      key: 'ai_key',
      title: 'Add your AI key',
      required: true,
      complete: hasApiKey,
      description:
        'Connect your own AI provider key — it powers report drafting and stays in your workspace.',
      content: <AiKeyCard onSaved={() => setHasApiKey(true)} />,
    },
    {
      key: 'business',
      title: 'Business details',
      required: true,
      complete: businessComplete,
      description:
        'Your legal name, ABN and state appear on every report and invoice you send.',
      content: <BusinessDetailsCard />,
    },
    {
      key: 'branding',
      title: 'Branding',
      required: false,
      complete: brandingComplete,
      description:
        'Preview your letterhead live — logo, colours, and a short company line for every client document.',
      content: <BrandCard />,
    },
    {
      key: 'pricing',
      title: 'Pricing',
      required: false,
      complete: pricingComplete,
      description:
        'Set your rate card once — estimates and invoices pick it up automatically.',
      content: <PricingCard />,
    },
    {
      key: 'integrations',
      title: 'Integrations',
      required: false,
      complete: false,
      description:
        'Connect the tools you already use and confirm every feature is healthy.',
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
      description:
        'Everything is in place — turn a job into an IICRC S500:2021 compliance report.',
      content: (
        <div className="overflow-hidden rounded-2xl border border-brand-navy/10 bg-white shadow-sm">
          <div className="bg-linear-to-br from-brand-navy to-brand-deep px-6 py-8 text-center text-white sm:px-10">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/20 ring-1 ring-brand-gold/40">
              <RAIcon name="success" size={24} decorative />
            </span>
            <h3 className="mt-4 text-xl font-semibold tracking-tight">
              You&apos;re ready to go
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/70">
              Use the button below to generate your first report. You can
              always come back and finish the optional steps later from your
              dashboard.
            </p>
          </div>
          <ul className="divide-y divide-brand-navy/5 px-6 py-2 sm:px-10">
            {[
              { label: 'AI key connected', done: hasApiKey },
              { label: 'Business details saved', done: businessComplete },
              { label: 'Branding applied', done: brandingComplete },
              { label: 'Pricing configured', done: pricingComplete },
            ].map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between py-3 text-sm"
              >
                <span className="text-brand-navy">{row.label}</span>
                <span
                  className={
                    row.done
                      ? 'rounded-full bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success-subtle-foreground'
                      : 'rounded-full bg-brand-cloud px-2.5 py-0.5 text-xs font-medium text-brand-slate'
                  }
                >
                  {row.done ? 'Done' : 'Later'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ),
    },
  ];

  return (
    <SetupStepper
      items={steps}
      onFinish={() => router.push('/dashboard/reports/new')}
    />
  );
}
