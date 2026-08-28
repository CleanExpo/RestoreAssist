'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { activationErrorMessage } from '@/lib/setup/activation-error';
import { RAIcon } from '@/components/brand/RAIcon';
import { useSetupStore, type SetupOrganization } from './store';
import { BusinessDetailsCard } from './BusinessDetailsCard';
import { BrandCard } from './BrandCard';
import { PricingCard } from './PricingCard';
import { IntegrationsCard } from './IntegrationsCard';
import { FeatureHealthCard } from './FeatureHealthCard';
import { VideoExplainer } from './VideoExplainer';
import { WelcomeOverview } from './WelcomeOverview';
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
  const { update: refreshSession } = useSession();

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
    const hasBusinessHydration = hydrationJobs.some((job) => job.kind === 'ABR');
    if (!hasBusinessHydration && orgFields.country === 'NZ' && orgFields.legalName && orgFields.nzbn && orgFields.state && orgFields.timezone) {
      setSectionStatus('businessDetails', 'ready');
    }

    // SSE bridge — only subscribe if any non-terminal jobs
    const hasActive = hydrationJobs.some((j) => j.status === 'RUNNING');
    if (!hasActive) return;

    const es = new EventSource('/api/setup/hydrate/stream');
    es.onmessage = (e) => {
      try {
        const jobs: Array<{
          kind: 'ABR' | 'WEBSITE' | 'PRICING';
          status: string;
        }> = JSON.parse(e.data);
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
  const businessIdentifier = org?.country === 'NZ' ? org.nzbn : org?.abn;
  const businessComplete = !!(org?.legalName && businessIdentifier && org.state && org.timezone);
  const brandingComplete = !!(org?.logoUrl || org?.primaryColor);
  const pricingComplete = !!org?.pricingConfig;

  const steps: SetupStepperItem[] = [
    {
      key: 'welcome',
      title: 'Welcome',
      required: false,
      complete: true,
      description: 'What RestoreAssist does, how a job moves through it, and what setup asks of you.',
      // The overview leads. The video is a supplement, not the explanation:
      // it currently renders with no audio track and starts muted on mobile,
      // so a customer who never hears it still gets the whole picture here.
      content: (
        <div className="space-y-6">
          <WelcomeOverview />
          <VideoExplainer slug="remotion-onboarding-welcome" />
        </div>
      ),
    },
    {
      key: 'ai_key',
      title: 'Add your AI key',
      required: true,
      complete: hasApiKey,
      description: 'Connect your own AI provider key — it powers report drafting and stays in your workspace.',
      content: <AiKeyCard onSaved={() => setHasApiKey(true)} />,
    },
    {
      key: 'business',
      title: 'Business details',
      required: true,
      complete: businessComplete,
      description: 'Your legal name, business number, region and timezone keep reports and invoices locally correct.',
      content: <BusinessDetailsCard />,
    },
    {
      key: 'branding',
      title: 'Branding',
      required: false,
      complete: brandingComplete,
      description: 'Preview your letterhead live — logo, colours, and a short company line for every client document.',
      content: <BrandCard />,
    },
    {
      key: 'pricing',
      title: 'Pricing',
      required: false,
      complete: pricingComplete,
      description: 'Set your rate card once — estimates and invoices pick it up automatically.',
      content: <PricingCard />,
    },
    {
      key: 'integrations',
      title: 'Integrations',
      required: false,
      complete: false,
      description: 'Connect the tools you already use and confirm every feature is healthy.',
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
      description: 'Everything is in place — turn a job into an IICRC S500:2021 compliance report.',
      content: (
        <div className="overflow-hidden rounded-2xl border border-brand-navy/10 bg-white shadow-sm">
          <div className="bg-linear-to-br from-brand-navy to-brand-deep px-6 py-8 text-center text-white sm:px-10">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/20 ring-1 ring-brand-gold/40">
              <RAIcon name="success" size={24} decorative />
            </span>
            <h3 className="mt-4 text-xl font-semibold tracking-tight">You&apos;re ready to go</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/70">
              Use the button below to generate your first report. You can always come back and finish the optional steps later from your dashboard.
            </p>
          </div>
          <ul className="divide-y divide-brand-navy/5 px-6 py-2 sm:px-10">
            {[
              { label: 'AI key connected', done: hasApiKey },
              { label: 'Business details saved', done: businessComplete },
              { label: 'Branding applied', done: brandingComplete },
              { label: 'Pricing configured', done: pricingComplete },
            ].map((row) => (
              <li key={row.label} className="flex items-center justify-between py-3 text-sm">
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

  // Phase 4 — the terminal CTA is the finish path essentially every operator
  // takes, so it has to be the one that actually completes setup. Two things
  // must happen before we navigate, or turning `SETUP_WIZARD_ENABLED` on traps
  // the user in a redirect loop:
  //
  //  1. `POST /api/setup/activate` sets `Organization.setupCompletedAt`.
  //     Previously the ONLY caller was the Activate button inside
  //     FeatureHealthCard, which lives in the *optional* Integrations step —
  //     so an operator who took the wizard at its word and skipped the
  //     optional steps never activated at all, and the setup gate in
  //     `proxy.ts` bounced every dashboard path straight back to /setup.
  //
  //  2. The NextAuth JWT has to be re-minted. The gate reads
  //     `setupCompletedAt` off the token, and only a NextAuth route can
  //     rewrite that cookie — a server-component redirect cannot. Since
  //     `/setup` itself redirects to /dashboard once the DB row is set, a
  //     stale token turns the bounce into a /setup ↔ /dashboard ping-pong
  //     that ends in ERR_TOO_MANY_REDIRECTS. `update()` triggers the jwt()
  //     callback with `trigger: "update"`, which refreshes the claim.
  //
  // The navigation is a full document load, not a router.push, so the request
  // that follows is guaranteed to carry the refreshed cookie.
  const handleFinish = async () => {
    const res = await fetch('/api/setup/activate', { method: 'POST' });

    // 409 CONFLICT is "setup already activated" — the state we wanted, reached
    // by the operator having pressed Activate in the optional Integrations
    // step first. Treat it as success, not as a dead end.
    if (!res.ok && res.status !== 409) {
      const body = await res.json().catch(() => null);
      throw new Error(activationErrorMessage(res.status, body));
    }

    await refreshSession();
    window.location.assign('/dashboard/reports/new');
  };

  return <SetupStepper items={steps} onFinish={handleFinish} />;
}
