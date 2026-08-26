'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * WelcomeOverview — the "what is this and why" panel on the first setup step.
 *
 * WHY THIS IS TEXT AND NOT ONLY A VIDEO
 * -------------------------------------
 * The Welcome step used to be a lone <VideoExplainer>. That video renders with
 * no audio track (see scripts/__tests__/remotion-narration-assets.test.ts), and
 * on mobile <VideoExplainer> starts muted regardless, so a new customer's first
 * screen explained nothing and then asked them for an AI provider key. Text
 * carries the explanation whether or not the video plays, has sound, or loads
 * at all.
 *
 * COPY DISCIPLINE
 * ---------------
 * Every capability named here is one the product actually has. There is
 * deliberately no monetary savings figure: an unsubstantiated "saves you
 * $X a year" is misleading conduct under Australian Consumer Law s18, and no
 * measured figure exists in this repo to cite. The value framing below is
 * about work removed, which is verifiable. Add a dollar claim only alongside
 * the evidence for it.
 */

// Inline SVG marks (Phill Rule 1: no generic icon-library imports).
function StepMark({ n }: { n: number }) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white"
      aria-hidden="true"
    >
      {n}
    </span>
  );
}

function TickMark({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

const FLOW = [
  {
    title: 'Capture on site',
    body: 'Photos, moisture readings and room sketches are recorded against the job while you are standing in it. It keeps working with no signal and syncs when you are back in range.',
  },
  {
    title: 'The job assembles itself',
    body: 'Every reading and photo stays attached to the room it came from, so the evidence trail builds as you work instead of being reconstructed afterwards.',
  },
  {
    title: 'Report and scope',
    body: 'Drafts are generated from what you actually captured, referenced against the IICRC standards, for you to review and correct. You approve every word before it leaves.',
  },
  {
    title: 'Quote, invoice, and share',
    body: 'Your rate card and GST are applied automatically. Clients and insurers follow progress through a portal link rather than by ringing you.',
  },
] as const;

const BEST_USE = [
  'Capture on site, not that evening. The evidence is only as good as the moment it was taken in.',
  'Set your rate card once during setup — every estimate and invoice picks it up from there.',
  'Read the drafts before sending. They are a starting point built from your evidence, not a finished document.',
] as const;

export function WelcomeOverview() {
  return (
    <Card className="overflow-hidden border-brand-navy/10 shadow-sm">
      <CardHeader className="space-y-1 border-b border-brand-navy/5 bg-[#F7F9FB] pb-4">
        <CardTitle className="text-lg">What RestoreAssist does</CardTitle>
        <p className="text-sm text-neutral-600">
          Two minutes now, so the rest of setup makes sense.
        </p>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        <p className="text-sm leading-relaxed text-neutral-700">
          RestoreAssist is a job system built for Australian restoration
          contractors. It carries one job from the first site visit through to
          the invoice — the photos, the moisture readings, the sketch, the
          report, the scope and the client updates all live on the same job
          rather than in a camera roll, a spreadsheet and a document folder.
        </p>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">
            How a job moves through it
          </h3>
          <ol className="space-y-3">
            {FLOW.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <StepMark n={i + 1} />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-neutral-900">
                    {step.title}
                  </p>
                  <p className="text-sm leading-relaxed text-neutral-600">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-lg border border-brand-navy/10 bg-[#F7F9FB] p-4">
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">
            Where the time goes back
          </h3>
          <p className="text-sm leading-relaxed text-neutral-700">
            The hours restoration businesses lose are rarely on the tools. They
            go on writing up reports after hours, chasing photos that were never
            labelled, rebuilding a scope from memory, and answering
            &ldquo;what is happening with my job?&rdquo; by phone. Every one of
            those is work this system is meant to remove, because the job was
            already recorded properly the first time.
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">
            Getting the best out of it
          </h3>
          <ul className="space-y-2">
            {BEST_USE.map((tip) => (
              <li key={tip} className="flex gap-2.5">
                <TickMark className="mt-0.5 shrink-0 text-brand-navy" />
                <span className="text-sm leading-relaxed text-neutral-600">
                  {tip}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-brand-navy/10 p-4">
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">
            Next: your own AI key
          </h3>
          <p className="text-sm leading-relaxed text-neutral-700">
            The drafting runs on an AI provider key that you own and pay for
            directly, rather than one of ours. That means your job data goes to
            your account under your provider&rsquo;s terms, you can see exactly
            what it costs, and you can revoke it at any time without asking us.
            The next step walks you through adding one.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
