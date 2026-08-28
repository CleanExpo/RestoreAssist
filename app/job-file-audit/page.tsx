"use client";

import { useState } from "react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

type AuditPackage = "single" | "three";

const REVIEW_ITEMS = [
  "Water-damage assessment and initial condition records",
  "Moisture mapping, readings and drying-log completeness",
  "Before, during and completion photographs",
  "Technician notes, dates and job chronology",
  "Scope changes, authorisations and stakeholder communications",
  "Evidence supporting report statements and invoice line items",
];

const DELIVERABLES = [
  "Red / amber / green file-strength summary",
  "The three most important evidence gaps to fix first",
  "Chronology and documentation inconsistencies",
  "Questions a reviewer, estimator or insurer may reasonably ask",
  "Practical next actions to strengthen the file",
];

export default function JobFileAuditPage() {
  const [darkMode, setDarkMode] = useState(true);
  const [loading, setLoading] = useState<AuditPackage | null>(null);
  const [error, setError] = useState("");

  async function startCheckout(selectedPackage: AuditPackage) {
    setLoading(selectedPackage);
    setError("");
    try {
      const response = await fetch("/api/revenue/job-file-audit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: selectedPackage }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        message?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(
          data.message || data.error || "Unable to start secure checkout.",
        );
      }
      window.location.assign(data.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to start secure checkout.",
      );
      setLoading(null);
    }
  }

  return (
    <div className={darkMode ? "min-h-screen bg-brand-navy" : "min-h-screen bg-brand-cloud"}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      <main>
        <section className="px-6 pb-20 pt-40">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-4xl">
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">
                Restoration Job File Audit
              </p>
              <h1 className={`text-4xl font-bold leading-tight md:text-6xl ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}>
                Find the weak spots in the job file before somebody else does.
              </h1>
              <p className={`mt-6 max-w-3xl text-lg leading-8 md:text-xl ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}>
                A practical AU/NZ review of an existing restoration job file,
                focused on evidence, chronology, moisture documentation,
                photographs and report support. You receive clear findings and
                the next actions to strengthen the file.
              </p>
              <div className="mt-8 flex flex-wrap gap-3 text-sm font-medium">
                <span className="rounded-full border border-brand-bronze/40 px-4 py-2 text-brand-gold">
                  24-hour target turnaround
                </span>
                <span className="rounded-full border border-brand-bronze/40 px-4 py-2 text-brand-gold">
                  AU/NZ restoration focus
                </span>
                <span className="rounded-full border border-brand-bronze/40 px-4 py-2 text-brand-gold">
                  Human professional review
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className={darkMode ? "bg-brand-deep px-6 py-16" : "bg-white px-6 py-16"}>
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2">
            <div>
              <h2 className={`text-3xl font-bold ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}>
                What we review
              </h2>
              <div className="mt-6 space-y-3">
                {REVIEW_ITEMS.map((item, index) => (
                  <div key={item} className="flex gap-4 rounded-2xl border border-brand-slate/20 p-4">
                    <span className="font-semibold text-brand-gold">{String(index + 1).padStart(2, "0")}</span>
                    <p className={darkMode ? "text-brand-mist" : "text-brand-slate"}>{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className={`text-3xl font-bold ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}>
                What you receive
              </h2>
              <div className="mt-6 rounded-3xl border border-brand-bronze/30 bg-brand-bronze/10 p-6">
                <ul className="space-y-4">
                  {DELIVERABLES.map((item) => (
                    <li key={item} className={`border-b border-brand-bronze/20 pb-4 last:border-b-0 last:pb-0 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <p className={`mt-5 text-sm leading-6 ${darkMode ? "text-brand-slate" : "text-brand-slate"}`}>
                This is an operational documentation review. It is not legal
                advice, insurer approval, certification, or a guarantee that a
                claim or invoice will be accepted or paid.
              </p>
            </div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">Founding offer</p>
              <h2 className={`mt-3 text-3xl font-bold md:text-4xl ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}>
                Start with a real file, not another software demo.
              </h2>
              <p className={`mt-4 text-lg ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}>
                Pay securely, complete the intake, then we request the relevant
                report, photographs, moisture/drying records and supporting
                documentation through the approved file-sharing channel.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <article className="rounded-3xl border border-brand-slate/25 p-7">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-gold">Single audit</p>
                <p className={`mt-3 text-5xl font-bold ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}>A$149</p>
                <p className={`mt-1 text-sm ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}>ex GST</p>
                <p className={`mt-5 min-h-14 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}>
                  One restoration job-file review with a prioritised findings summary.
                </p>
                <button
                  type="button"
                  onClick={() => startCheckout("single")}
                  disabled={loading !== null}
                  className="mt-7 w-full rounded-xl bg-brand-cta px-5 py-3 font-semibold text-brand-cloud transition-colors hover:bg-brand-cta-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading === "single" ? "Opening secure checkout…" : "Buy one audit"}
                </button>
              </article>

              <article className="rounded-3xl border border-brand-gold/60 bg-brand-bronze/10 p-7">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-gold">Three-job pack</p>
                <p className={`mt-3 text-5xl font-bold ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}>A$399</p>
                <p className={`mt-1 text-sm ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}>ex GST</p>
                <p className={`mt-5 min-h-14 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}>
                  Three job-file reviews for teams that want to compare recurring evidence gaps.
                </p>
                <button
                  type="button"
                  onClick={() => startCheckout("three")}
                  disabled={loading !== null}
                  className="mt-7 w-full rounded-xl bg-brand-cta px-5 py-3 font-semibold text-brand-cloud transition-colors hover:bg-brand-cta-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading === "three" ? "Opening secure checkout…" : "Buy the three-job pack"}
                </button>
              </article>
            </div>

            {error ? (
              <p role="alert" className="mt-5 rounded-xl bg-destructive-subtle p-4 text-destructive-subtle-foreground">
                {error}
              </p>
            ) : null}
          </div>
        </section>

        <section className={darkMode ? "bg-brand-deep px-6 py-16" : "bg-white px-6 py-16"}>
          <div className="mx-auto max-w-4xl text-center">
            <h2 className={`text-3xl font-bold ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}>
              Built for restoration files where the evidence has to tell the story.
            </h2>
            <p className={`mx-auto mt-5 max-w-3xl leading-7 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}>
              Weak files usually do not fail because somebody forgot how to dry a
              building. They fail because readings, photos, notes, decisions and
              scope justification are scattered or incomplete. The audit makes
              those gaps visible while they can still be fixed.
            </p>
          </div>
        </section>
      </main>

      <Footer darkMode={darkMode} />
    </div>
  );
}
