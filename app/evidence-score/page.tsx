"use client";

import { useMemo, useState } from "react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

type Answer = 0 | 0.5 | 1;

type Question = {
  id: string;
  title: string;
  detail: string;
  gap: string;
};

const QUESTIONS: Question[] = [
  {
    id: "loss-baseline",
    title: "Loss details are captured clearly",
    detail:
      "The cause, affected areas, relevant classifications and initial site conditions are recorded in the job file.",
    gap: "Loss baseline and initial conditions are incomplete or unclear.",
  },
  {
    id: "initial-moisture",
    title: "Initial moisture evidence is complete",
    detail:
      "Initial readings and affected materials/areas are recorded well enough for another person to understand the starting condition.",
    gap: "Initial moisture evidence does not clearly establish the starting condition.",
  },
  {
    id: "daily-readings",
    title: "Progress readings are recorded consistently",
    detail:
      "Ongoing readings are dated and linked to identifiable areas or materials rather than existing as isolated numbers.",
    gap: "Progress readings have chronology or location gaps.",
  },
  {
    id: "photo-story",
    title: "Photos tell the story of the job",
    detail:
      "The file includes useful before, during and completion images that can be understood without relying on a technician's memory.",
    gap: "Photo evidence does not clearly show the job from initial condition through completion.",
  },
  {
    id: "equipment",
    title: "Equipment use is traceable",
    detail:
      "Placement, changes, additions or removals are recorded so the equipment history can be followed through the job.",
    gap: "Equipment placement or change history is difficult to trace.",
  },
  {
    id: "technician-notes",
    title: "Technician notes are attributable and useful",
    detail:
      "Notes are dated, attributable and describe observations and actions rather than relying on vague shorthand.",
    gap: "Technician notes are too vague, incomplete or difficult to attribute.",
  },
  {
    id: "scope-changes",
    title: "Scope changes and approvals are recorded",
    detail:
      "Changes to work, access, authorisations or stakeholder decisions are retained with enough context to explain why the job changed.",
    gap: "Scope changes, approvals or stakeholder decisions are not fully evidenced.",
  },
  {
    id: "completion",
    title: "Completion evidence is clear",
    detail:
      "The file shows the condition at completion and records the evidence used to support closing the restoration work.",
    gap: "The job file does not clearly support the condition at completion.",
  },
  {
    id: "invoice-traceability",
    title: "Invoice items can be traced back to evidence",
    detail:
      "Major labour, equipment, materials and activities can be matched to notes, photos, readings or other job records.",
    gap: "Some billable activity is difficult to trace back to supporting evidence.",
  },
  {
    id: "communications",
    title: "Important communications are retained",
    detail:
      "Key instructions, delays, access issues and stakeholder decisions are stored with the job rather than scattered across personal inboxes and messages.",
    gap: "Important job communications appear fragmented or missing from the file.",
  },
];

const OPTIONS: { label: string; value: Answer }[] = [
  { label: "Yes", value: 1 },
  { label: "Partly", value: 0.5 },
  { label: "No", value: 0 },
];

function scoreBand(score: number) {
  if (score >= 80) {
    return {
      label: "Strong",
      summary:
        "Your file has a solid evidence base. The remaining gaps are worth tightening before they become habits.",
    };
  }
  if (score >= 60) {
    return {
      label: "Exposed",
      summary:
        "Your file has useful evidence, but several gaps could make reporting, review or invoicing harder than it needs to be.",
    };
  }
  return {
    label: "High risk",
    summary:
      "Your file has material documentation gaps. Strengthening the evidence trail should be treated as an operational priority.",
  };
}

export default function EvidenceScorePage() {
  const [darkMode, setDarkMode] = useState(true);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [showResult, setShowResult] = useState(false);
  const [lead, setLead] = useState({ name: "", email: "", website: "" });
  const [leadStatus, setLeadStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [leadError, setLeadError] = useState("");

  const completed = Object.keys(answers).length;
  const score = useMemo(() => {
    if (!showResult) return 0;
    const total = QUESTIONS.reduce(
      (sum, question) => sum + (answers[question.id] ?? 0),
      0,
    );
    return Math.round((total / QUESTIONS.length) * 100);
  }, [answers, showResult]);

  const band = scoreBand(score);
  const gaps = useMemo(
    () =>
      QUESTIONS.filter((question) => (answers[question.id] ?? 0) < 1)
        .sort(
          (a, b) =>
            (answers[a.id] ?? 0) - (answers[b.id] ?? 0),
        )
        .slice(0, 3),
    [answers],
  );

  const setAnswer = (questionId: string, value: Answer) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setShowResult(false);
    setLeadStatus("idle");
  };

  const submitScore = () => {
    if (completed !== QUESTIONS.length) return;
    setShowResult(true);
    requestAnimationFrame(() => {
      document
        .getElementById("evidence-score-result")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const requestAudit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLeadStatus("submitting");
    setLeadError("");

    const gapText = gaps.length
      ? gaps.map((gap) => `- ${gap.gap}`).join("\n")
      : "- No material gaps identified by the self-assessment.";

    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lead.name.trim(),
          email: lead.email.trim(),
          subject: `Evidence Score audit request — ${score}/100 (${band.label})`,
          body: [
            "RestoreAssist Evidence Score lead",
            "",
            `Score: ${score}/100`,
            `Band: ${band.label}`,
            "Top gaps:",
            gapText,
            "",
            "Requested offer: A$149 ex GST human Restoration Job File Audit.",
          ].join("\n"),
          category: "general",
          website: lead.website,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Unable to submit your audit request.");
      }

      setLeadStatus("success");
    } catch (error) {
      setLeadStatus("error");
      setLeadError(
        error instanceof Error
          ? error.message
          : "Unable to submit your audit request.",
      );
    }
  };

  const panel = darkMode
    ? "border-brand-slate/30 bg-brand-navy/70"
    : "border-brand-slate/20 bg-brand-cloud";
  const heading = darkMode ? "text-brand-cloud" : "text-brand-navy";
  const body = darkMode ? "text-brand-mist" : "text-brand-slate";

  return (
    <div
      className={`min-h-screen ${darkMode ? "bg-brand-navy" : "bg-brand-cloud"}`}
    >
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      <main>
        <section className="px-6 pb-16 pt-40">
          <div className="mx-auto max-w-5xl text-center">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-brand-bronze">
              Free restoration documentation check
            </p>
            <h1
              className={`mx-auto max-w-4xl text-4xl font-bold leading-tight md:text-6xl ${heading}`}
            >
              How defensible is your restoration job file?
            </h1>
            <p className={`mx-auto mt-6 max-w-3xl text-lg md:text-xl ${body}`}>
              Answer ten practical questions and get an instant Evidence Score,
              your risk band and the three documentation gaps worth fixing
              first. No login required.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
              <span className={`rounded-full border px-4 py-2 ${panel} ${body}`}>
                Built for AU/NZ restoration teams
              </span>
              <span className={`rounded-full border px-4 py-2 ${panel} ${body}`}>
                About two minutes
              </span>
              <span className={`rounded-full border px-4 py-2 ${panel} ${body}`}>
                Practical operational review, not legal advice
              </span>
            </div>
          </div>
        </section>

        <section className="px-6 pb-20">
          <div className="mx-auto max-w-4xl space-y-5">
            {QUESTIONS.map((question, index) => (
              <article
                key={question.id}
                className={`rounded-2xl border p-5 md:p-7 ${panel}`}
              >
                <div className="flex gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-bronze font-semibold text-brand-cloud">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className={`text-lg font-semibold md:text-xl ${heading}`}>
                      {question.title}
                    </h2>
                    <p className={`mt-2 text-sm leading-6 md:text-base ${body}`}>
                      {question.detail}
                    </p>
                    <div
                      className="mt-5 grid grid-cols-3 gap-2"
                      role="group"
                      aria-label={question.title}
                    >
                      {OPTIONS.map((option) => {
                        const selected = answers[question.id] === option.value;
                        return (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => setAnswer(question.id, option.value)}
                            aria-pressed={selected}
                            className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors md:text-base ${
                              selected
                                ? "border-brand-bronze bg-brand-bronze text-brand-cloud"
                                : `${panel} ${heading} hover:border-brand-bronze`
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </article>
            ))}

            <div className={`rounded-2xl border p-5 md:p-7 ${panel}`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className={`font-semibold ${heading}`}>
                    {completed} of {QUESTIONS.length} answered
                  </p>
                  <p className={`mt-1 text-sm ${body}`}>
                    Complete all ten questions to calculate your score.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={submitScore}
                  disabled={completed !== QUESTIONS.length}
                  className="rounded-xl bg-brand-bronze px-6 py-3 font-semibold text-brand-cloud transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Calculate my Evidence Score
                </button>
              </div>
            </div>
          </div>
        </section>

        {showResult && (
          <section id="evidence-score-result" className="scroll-mt-28 px-6 pb-24">
            <div className="mx-auto max-w-4xl">
              <div className={`rounded-3xl border p-6 md:p-10 ${panel}`}>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-bronze">
                  Your Evidence Score
                </p>
                <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className={`text-6xl font-bold md:text-7xl ${heading}`}>
                      {score}
                      <span className={`text-2xl ${body}`}>/100</span>
                    </p>
                    <p className="mt-3 text-xl font-semibold text-brand-bronze">
                      {band.label}
                    </p>
                  </div>
                  <p className={`max-w-xl text-base leading-7 md:text-lg ${body}`}>
                    {band.summary}
                  </p>
                </div>

                <div className="mt-8 border-t border-brand-slate/20 pt-8">
                  <h2 className={`text-2xl font-bold ${heading}`}>
                    Fix these first
                  </h2>
                  {gaps.length ? (
                    <ol className="mt-5 space-y-3">
                      {gaps.map((gap, index) => (
                        <li
                          key={gap.id}
                          className={`rounded-xl border p-4 ${panel} ${body}`}
                        >
                          <span className={`font-semibold ${heading}`}>
                            {index + 1}. {gap.gap}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className={`mt-4 ${body}`}>
                      You selected Yes for every question. A human review can
                      still test whether the underlying evidence supports those
                      answers.
                    </p>
                  )}
                </div>

                <div className="mt-10 rounded-2xl border border-brand-bronze/50 bg-brand-bronze/10 p-5 md:p-7">
                  <h2 className={`text-2xl font-bold ${heading}`}>
                    Want a human to review the actual job file?
                  </h2>
                  <p className={`mt-3 leading-7 ${body}`}>
                    Founding offer: A$149 ex GST for one Restoration Job File
                    Audit. Send the existing report, photos and logs you already
                    have. We return a concise red/amber/green review of evidence
                    gaps, chronology, clarity and next actions.
                  </p>

                  <form
                    className="mt-6 grid gap-3 md:grid-cols-2"
                    onSubmit={requestAudit}
                  >
                    <label className="sr-only" htmlFor="evidence-name">
                      Your name
                    </label>
                    <input
                      id="evidence-name"
                      required
                      value={lead.name}
                      onChange={(event) =>
                        setLead((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Your name"
                      className={`rounded-xl border px-4 py-3 ${panel} ${heading}`}
                    />
                    <label className="sr-only" htmlFor="evidence-email">
                      Business email
                    </label>
                    <input
                      id="evidence-email"
                      type="email"
                      required
                      value={lead.email}
                      onChange={(event) =>
                        setLead((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      placeholder="Business email"
                      className={`rounded-xl border px-4 py-3 ${panel} ${heading}`}
                    />
                    <div
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        left: "-9999px",
                        width: "1px",
                        height: "1px",
                        overflow: "hidden",
                      }}
                    >
                      <label htmlFor="evidence-website">Website</label>
                      <input
                        id="evidence-website"
                        tabIndex={-1}
                        autoComplete="off"
                        value={lead.website}
                        onChange={(event) =>
                          setLead((current) => ({
                            ...current,
                            website: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={leadStatus === "submitting"}
                      className="rounded-xl bg-brand-bronze px-6 py-3 font-semibold text-brand-cloud disabled:opacity-50 md:col-span-2"
                    >
                      {leadStatus === "submitting"
                        ? "Submitting request…"
                        : "Request my A$149 job file audit"}
                    </button>
                    {leadStatus === "success" && (
                      <p
                        role="status"
                        className="text-sm font-medium text-success md:col-span-2"
                      >
                        Request received. The RestoreAssist team will follow up
                        using the email you supplied.
                      </p>
                    )}
                    {leadStatus === "error" && (
                      <p
                        role="alert"
                        className="text-sm font-medium text-destructive md:col-span-2"
                      >
                        {leadError}
                      </p>
                    )}
                  </form>
                </div>

                <p className={`mt-6 text-xs leading-5 ${body}`}>
                  This self-assessment is an operational screening tool. It does
                  not provide legal advice, guarantee payment, certify a job file
                  or replace qualified professional judgement.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer darkMode={darkMode} />
    </div>
  );
}
