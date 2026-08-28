"use client";

import { useEffect, useState } from "react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

const EMPTY_FORM = {
  name: "",
  email: "",
  businessName: "",
  phone: "",
  jobReference: "",
  jobSummary: "",
  website: "",
};

export default function JobFileAuditIntakePage() {
  const [darkMode, setDarkMode] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSessionId(params.get("session_id") ?? "");
  }, []);

  function updateField(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitIntake(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      if (!sessionId) {
        throw new Error(
          "Payment session not found. Return to the Job File Audit page and complete checkout first.",
        );
      }

      const response = await fetch("/api/revenue/job-file-audit/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...form }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        issues?: Array<{ message?: string }>;
      };

      if (!response.ok) {
        const firstIssue = data.issues?.[0]?.message;
        throw new Error(
          firstIssue || data.message || data.error || "Unable to submit intake.",
        );
      }

      setStatus("success");
      setMessage(
        data.message ||
          "Payment verified and intake received. We will send the secure file-request instructions next.",
      );
      setForm(EMPTY_FORM);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Unable to submit intake.",
      );
    }
  }

  return (
    <div className={darkMode ? "min-h-screen bg-brand-navy" : "min-h-screen bg-brand-cloud"}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      <main className="px-6 pb-20 pt-40">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">
            Paid Job File Audit
          </p>
          <h1 className={`mt-4 text-4xl font-bold md:text-5xl ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}>
            Payment received. Tell us which file you want reviewed.
          </h1>
          <p className={`mt-5 text-lg leading-7 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}>
            Once this intake is submitted, we will send the secure file-request
            instructions for the report, photographs, moisture/drying records
            and relevant supporting documents.
          </p>

          <form onSubmit={submitIntake} className="mt-10 space-y-5 rounded-3xl border border-brand-slate/25 p-6 md:p-8">
            <div className="grid gap-5 md:grid-cols-2">
              <label className={darkMode ? "text-brand-cloud" : "text-brand-navy"}>
                <span className="mb-2 block text-sm font-semibold">Your name</span>
                <input
                  required
                  name="name"
                  value={form.name}
                  onChange={updateField}
                  maxLength={200}
                  className="w-full rounded-xl border border-brand-slate/30 bg-transparent px-4 py-3 outline-none focus:border-brand-gold"
                />
              </label>

              <label className={darkMode ? "text-brand-cloud" : "text-brand-navy"}>
                <span className="mb-2 block text-sm font-semibold">Business name</span>
                <input
                  required
                  name="businessName"
                  value={form.businessName}
                  onChange={updateField}
                  maxLength={200}
                  className="w-full rounded-xl border border-brand-slate/30 bg-transparent px-4 py-3 outline-none focus:border-brand-gold"
                />
              </label>

              <label className={darkMode ? "text-brand-cloud" : "text-brand-navy"}>
                <span className="mb-2 block text-sm font-semibold">Email</span>
                <input
                  required
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={updateField}
                  maxLength={320}
                  className="w-full rounded-xl border border-brand-slate/30 bg-transparent px-4 py-3 outline-none focus:border-brand-gold"
                />
              </label>

              <label className={darkMode ? "text-brand-cloud" : "text-brand-navy"}>
                <span className="mb-2 block text-sm font-semibold">Phone</span>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={updateField}
                  maxLength={80}
                  className="w-full rounded-xl border border-brand-slate/30 bg-transparent px-4 py-3 outline-none focus:border-brand-gold"
                />
              </label>
            </div>

            <label className={`block ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}>
              <span className="mb-2 block text-sm font-semibold">Job or claim reference</span>
              <input
                name="jobReference"
                value={form.jobReference}
                onChange={updateField}
                maxLength={200}
                className="w-full rounded-xl border border-brand-slate/30 bg-transparent px-4 py-3 outline-none focus:border-brand-gold"
              />
            </label>

            <label className={`block ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}>
              <span className="mb-2 block text-sm font-semibold">What do you want us to pay attention to?</span>
              <textarea
                required
                name="jobSummary"
                value={form.jobSummary}
                onChange={updateField}
                minLength={20}
                maxLength={5000}
                rows={7}
                placeholder="Example: insurer queried the drying duration; I want the moisture chronology and supporting photographs checked before I respond."
                className="w-full resize-y rounded-xl border border-brand-slate/30 bg-transparent px-4 py-3 outline-none focus:border-brand-gold"
              />
            </label>

            <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden">
              <label htmlFor="audit-website">Website</label>
              <input
                id="audit-website"
                tabIndex={-1}
                autoComplete="off"
                name="website"
                value={form.website}
                onChange={updateField}
              />
            </div>

            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full rounded-xl bg-brand-cta px-6 py-3 font-semibold text-brand-cloud transition-colors hover:bg-brand-cta-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "submitting" ? "Verifying payment and submitting…" : "Submit paid audit intake"}
            </button>

            {message ? (
              <p
                role={status === "error" ? "alert" : "status"}
                className={
                  status === "error"
                    ? "rounded-xl bg-destructive-subtle p-4 text-destructive-subtle-foreground"
                    : "rounded-xl bg-success-subtle p-4 text-success-subtle-foreground"
                }
              >
                {message}
              </p>
            ) : null}
          </form>

          <p className={`mt-6 text-sm leading-6 ${darkMode ? "text-brand-slate" : "text-brand-slate"}`}>
            Do not place sensitive claim documents into this form. The secure
            file-request step follows after intake verification.
          </p>
        </div>
      </main>

      <Footer darkMode={darkMode} />
    </div>
  );
}
