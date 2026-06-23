"use client";

import { useState } from "react";
import {
  X,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4;

interface PropertyDataSetupWizardProps {
  onClose: () => void;
  onComplete: () => void;
}

const STEPS = [
  { id: 1, label: "Overview" },
  { id: 2, label: "Install Extension" },
  { id: 3, label: "Test Connection" },
  { id: 4, label: "Done" },
];

export function PropertyDataSetupWizard({
  onClose,
  onComplete,
}: PropertyDataSetupWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "fail">(
    "idle",
  );
  const [testError, setTestError] = useState<string | null>(null);

  // RA-1760 — the wizard used to await a setTimeout and then claim
  // success regardless of state. Now it actually probes:
  //
  //   1. GET /api/properties/scrape/health — confirms the server side
  //      is wired up before we tell the user the scraper works.
  //   2. POST /api/properties/scrape against a known sentinel address
  //      to confirm the full stack (auth, rate-limit, scraper, parser)
  //      can produce a usable payload. Validates the response shape
  //      so an empty/HTML-error JSON doesn't slip through as success.
  //
  // Override the sentinel via NEXT_PUBLIC_PROPERTY_TEST_ADDRESS for
  // CI/staging where the default may not resolve.
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult("idle");
    setTestError(null);
    try {
      // ── Stage 1: server health ──────────────────────────────────
      const h = await fetch("/api/properties/scrape/health");
      if (!h.ok) {
        const body = (await h.json().catch(() => ({}))) as {
          reason?: string;
          status?: string;
        };
        setTestResult("fail");
        setTestError(
          body.reason ?? `Scraper not configured (health returned ${h.status})`,
        );
        return;
      }

      // ── Stage 2: real scrape against a sentinel address ─────────
      const sentinel =
        process.env.NEXT_PUBLIC_PROPERTY_TEST_ADDRESS ??
        "123 Test Street, Sydney NSW 2000";
      const r = await fetch("/api/properties/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: sentinel }),
      });

      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          error?: { message?: string } | string;
        };
        const msg =
          typeof body.error === "string"
            ? body.error
            : (body.error?.message ?? `Scrape returned ${r.status}`);
        setTestResult("fail");
        setTestError(msg);
        return;
      }

      const json = (await r.json()) as {
        data?: { bedrooms?: number; floorAreaM2?: number };
      };
      const data = json.data;
      if (data == null || (data.bedrooms == null && data.floorAreaM2 == null)) {
        setTestResult("fail");
        setTestError(
          "Scraper returned no usable fields — no bedrooms or floorAreaM2 in payload",
        );
        return;
      }

      setTestResult("success");
    } catch (err) {
      setTestResult("fail");
      setTestError(err instanceof Error ? err.message : "Network error");
    } finally {
      setTesting(false);
    }
  };

  const handleNext = () => {
    if (step < 4) setStep((s) => (s + 1) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 max-w-lg w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Property Data Setup
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Step {step} of 4 — {STEPS[step - 1].label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100 dark:bg-slate-700">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        {/* Step content */}
        <div className="p-6 min-h-[280px] flex flex-col justify-between">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-2xl flex-shrink-0">
                  
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Auto-fill property details
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Instantly populate inspections with real property data
                  </p>
                </div>
              </div>
              <div className="space-y-3 mt-2">
                {[
                  ["", "Floor plan image as canvas underlay"],
                  ["", "Bedrooms, bathrooms, land size"],
                  ["", "Verified property address"],
                  ["", "24-hour cache — no repeat scraping"],
                ].map(([icon, text]) => (
                  <div
                    key={text as string}
                    className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300"
                  >
                    <span className="text-base">{icon}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-500 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 mt-2">
                Data is sourced from OnTheHouse.com.au via your browser session.
                No API fees. No third-party account required.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-slate-700 dark:text-slate-300">
                Property data is fetched via <strong>Claude in Chrome</strong> —
                a browser extension that connects your browser to RestoreAssist.
              </p>
              <ol className="space-y-3">
                {[
                  "Open the Chrome Web Store link below",
                  'Search for "Claude in Chrome" and install',
                  "Pin the extension to your toolbar",
                  "Sign in with your RestoreAssist account",
                ].map((instruction, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300"
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    {instruction}
                  </li>
                ))}
              </ol>
              <a
                href="https://chromewebstore.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg text-white text-sm font-medium hover:shadow-lg hover:shadow-blue-500/30 transition-all mt-2"
              >
                <ExternalLink size={16} />
                Open Chrome Web Store
              </a>
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                <HelpCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  If you already have Claude in Chrome installed, you can skip
                  this step and proceed to test the connection.
                </span>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-slate-700 dark:text-slate-300">
                Click below to test the connection to your Claude in Chrome
                extension.
              </p>
              <div
                className={`rounded-xl border-2 p-6 flex flex-col items-center gap-3 transition-all ${
                  testResult === "success"
                    ? "border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                    : testResult === "fail"
                      ? "border-rose-400 dark:border-rose-500 bg-rose-50 dark:bg-rose-500/10"
                      : "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30"
                }`}
              >
                {testing ? (
                  <Loader2 size={32} className="animate-spin text-blue-500" />
                ) : testResult === "success" ? (
                  <CheckCircle2 size={32} className="text-emerald-500" />
                ) : testResult === "fail" ? (
                  <WifiOff size={32} className="text-rose-500" />
                ) : (
                  <Wifi
                    size={32}
                    className="text-slate-400 dark:text-slate-500"
                  />
                )}
                <p
                  className={`text-sm font-medium ${
                    testResult === "success"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : testResult === "fail"
                        ? "text-rose-700 dark:text-rose-400"
                        : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {testing
                    ? "Testing connection…"
                    : testResult === "success"
                      ? "Scraper reachable — ready to use"
                      : testResult === "fail"
                        ? "Connection test failed"
                        : "Connection not tested yet"}
                </p>
                {testResult === "fail" && testError && (
                  <p
                    role="alert"
                    className="text-xs text-rose-600 dark:text-rose-400 text-center px-2"
                  >
                    {testError}
                  </p>
                )}
              </div>
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {testing
                  ? "Testing…"
                  : testResult !== "idle"
                    ? "Retest Connection"
                    : "Test Connection"}
              </button>
              {testResult === "fail" && (
                <p className="text-xs text-slate-500 dark:text-slate-500 text-center">
                  Go back to Step 2 and ensure the extension is installed and
                  signed in.
                </p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 size={36} className="text-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Property Data Connected
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  You can now use the "Lookup Property Data" button inside any
                  inspection to auto-fill property details and floor plans.
                </p>
              </div>
              <div className="w-full p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg text-xs text-blue-700 dark:text-blue-400 text-left">
                <strong>Next step:</strong> Open an inspection, enter the
                property address, then tap "Lookup Property Data". RestoreAssist
                will pull beds, baths, land size, and any available floor plan
                image automatically.
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
            <button
              onClick={handleBack}
              disabled={step === 1}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors"
            >
              <ArrowLeft size={16} />
              Back
            </button>

            {step < 4 ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-blue-500/30 transition-all"
              >
                {step === 3 && testResult === "idle" ? "Skip" : "Next"}
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-emerald-500/30 transition-all"
              >
                Finish Setup
                <CheckCircle2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
