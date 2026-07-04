import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Bird Flu Readiness Site Documentation | RestoreAssist',
  description:
    'A calm, official-source documentation workflow for restoration, cleaning, IAQ and facility teams responding to Australian H5 bird flu enquiries.',
  alternates: { canonical: 'https://restoreassist.app/resources/avian-influenza-site-documentation' },
  openGraph: {
    title: 'Bird Flu Readiness Site Documentation | RestoreAssist',
    description:
      'Document hotline reporting, exclusions, PPE, cleaning, disinfection, dry-fog method limits and client-ready records without alarmist messaging.',
    type: 'article',
    url: 'https://restoreassist.app/resources/avian-influenza-site-documentation',
  },
};

const recordSections = [
  'Client, facility and site details',
  'Observation notes: sick or dead bird/animal seen, location, time and photos if safe',
  'Authority contact notes and Emergency Animal Disease Hotline reference if supplied',
  'Exclusion zone, access control and clean/dirty transition plan',
  'Worker roster, PPE issue, fit-check notes and hygiene controls',
  'Cleaning task records: source removal only when authorised, detergent cleaning and exceptions',
  'Disinfection task records: product, label, SDS, batch, dilution, dwell/contact time and operator',
  'Dry-fog method record if used: room volume, machine ID, vacant-space controls, re-entry criteria and limitations',
  'Waste movement notes under authority direction',
  'Client, insurer and authority-ready summary report',
];

const officialMessages = [
  'No contact: do not touch sick or dead birds or animals.',
  'Record what is seen only if it can be done safely.',
  'Report to the 24-hour Emergency Animal Disease Hotline: 1800 675 888.',
  'Use DAFF and Australian CDC wording: current human-health risk is low and detections are in wild migratory seabirds unless official updates change.',
];

export default function AvianInfluenzaDocumentationPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-white/10 bg-slate-950">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-200">
            RestoreAssist field workflow
          </p>
          <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
            Bird flu readiness documentation without panic messaging
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
            RestoreAssist helps restoration, cleaning, IAQ and facility teams document what they saw, who they notified, what controls were used and what remains outside scope. The message is simple: report first, protect workers, clean before disinfecting and document the facts.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="https://carsi.com.au/avian-influenza-readiness" className="rounded-lg bg-amber-400 px-5 py-3 text-center text-sm font-black text-slate-950 hover:bg-amber-300">
              CARSI readiness hub
            </a>
            <Link href="/resources" className="rounded-lg border border-white/20 bg-white/5 px-5 py-3 text-center text-sm font-bold text-white hover:bg-white/10">
              Browse resources
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6 md:p-8">
          <h2 className="text-2xl font-black text-emerald-100">Official message block</h2>
          <p className="mt-3 text-sm leading-7 text-emerald-50/90">
            Use this wording in field notes, client summaries and social assets. It reflects the Australian Government position and avoids unnecessary alarm.
          </p>
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {officialMessages.map((message) => (
              <li key={message} className="rounded-lg bg-white/10 p-4 text-sm leading-6 text-white">
                {message}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-12">
        <div className="rounded-2xl border border-white/10 bg-white p-6 text-slate-900 md:p-8">
          <h2 className="text-2xl font-black">Bird Flu Readiness Site Record</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            This template is designed for verifiable site documentation. It is not a diagnosis, government notification, veterinary assessment or clearance certificate.
          </p>
          <ol className="mt-6 grid gap-3 md:grid-cols-2">
            {recordSections.map((section, index) => (
              <li key={section} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                  {index + 1}
                </span>
                <span>{section}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-16 lg:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-black">For professional members</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Use RestoreAssist to record the difference between observation, advice, authorised work and work that has been excluded from scope. That difference protects the client, the worker and the industry.
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-black">Backlink structure</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Link this page from CARSI, DisasterRecovery.com.au and NRPG using the anchor <strong>RestoreAssist bird flu readiness documentation</strong>. Link back to the CARSI hub using <strong>Australian H5 bird flu readiness training</strong>.
          </p>
        </article>
      </section>
    </main>
  );
}
