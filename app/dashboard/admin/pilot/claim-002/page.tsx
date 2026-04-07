"use client";

/**
 * CLAIM-002 Cost Observation Entry — Admin
 *
 * Route: /dashboard/admin/pilot/claim-002
 * Auth:  ADMIN role required
 *
 * CLAIM-002 is the only HYPOTHESIS claim that cannot be auto-collected:
 * it requires per-claim total cost figures from insurer settlement data.
 *
 * This form records cost_impact observations for CLAIM-002 via
 * POST /api/pilot/observations. The measurement engine then runs a
 * Welch t-test across NIR vs control groups.
 *
 * Expected source: insurer-provided claim settlement data (CSV export
 * from Guidewire ClaimCenter or equivalent). Batch entry is supported
 * via the JSON bulk upload field.
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart2,
  Plus,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Trash2,
  Info,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type EntryGroup = "nir" | "control";

interface CostEntry {
  claimRef: string;
  group: EntryGroup;
  totalCostAUD: string;
  notes: string;
}

type BatchLine = {
  claimRef: string;
  group: EntryGroup;
  totalCostAUD: number;
  notes?: string;
};

const BLANK_ENTRY: CostEntry = {
  claimRef: "",
  group: "nir",
  totalCostAUD: "",
  notes: "",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Claim002CostEntryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [entries, setEntries] = useState<CostEntry[]>([{ ...BLANK_ENTRY }]);
  const [batchJson, setBatchJson] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  if (status === "loading") return null;
  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }
  if ((session?.user as { role?: string })?.role !== "ADMIN") {
    router.push("/dashboard");
    return null;
  }

  // ── Entry manipulation ──────────────────────────────────────────────────────

  const updateEntry = (idx: number, field: keyof CostEntry, value: string) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
    );
  };

  const addEntry = () => setEntries((prev) => [...prev, { ...BLANK_ENTRY }]);

  const removeEntry = (idx: number) =>
    setEntries((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev,
    );

  // ── Validation ──────────────────────────────────────────────────────────────

  const validateEntries = (toValidate: CostEntry[]): string[] => {
    const errs: string[] = [];
    toValidate.forEach((e, i) => {
      const row = `Row ${i + 1}`;
      const cost = parseFloat(e.totalCostAUD);
      if (isNaN(cost) || cost <= 0)
        errs.push(`${row}: Total cost must be a positive number (AUD).`);
      if (cost > 1_000_000)
        errs.push(`${row}: Cost seems too high (>$1M). Please verify.`);
    });
    return errs;
  };

  // ── Manual entry submit ─────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const errs = validateEntries(entries);
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSubmitting(true);
    setSuccessCount(null);

    let succeeded = 0;
    const failed: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      try {
        const res = await fetch("/api/pilot/observations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claimId: "CLAIM-002",
            observationType: "cost_impact",
            value: parseFloat(e.totalCostAUD),
            group: e.group,
            notes:
              [e.claimRef ? `Claim ref: ${e.claimRef}` : "", e.notes]
                .filter(Boolean)
                .join(" | ") || undefined,
          }),
        });
        if (res.ok) {
          succeeded++;
        } else {
          const body = await res.json().catch(() => ({}));
          failed.push(`Row ${i + 1}: ${body.error ?? `HTTP ${res.status}`}`);
        }
      } catch {
        failed.push(`Row ${i + 1}: Network error`);
      }
    }

    setSubmitting(false);
    if (failed.length > 0) {
      setErrors(failed);
    } else {
      setSuccessCount(succeeded);
      setEntries([{ ...BLANK_ENTRY }]);
    }
  };

  // ── Bulk JSON submit ────────────────────────────────────────────────────────

  const handleBatchSubmit = async () => {
    setBatchErrors([]);
    setSuccessCount(null);

    let parsed: BatchLine[];
    try {
      const raw = JSON.parse(batchJson) as unknown;
      if (!Array.isArray(raw)) {
        setBatchErrors(["JSON must be an array of objects."]);
        return;
      }
      parsed = raw as BatchLine[];
    } catch (e) {
      setBatchErrors([`Invalid JSON: ${String(e)}`]);
      return;
    }

    // Validate shape
    const schemaErrors: string[] = [];
    parsed.forEach((row, i) => {
      if (typeof row.totalCostAUD !== "number" || row.totalCostAUD <= 0)
        schemaErrors.push(`Item ${i}: totalCostAUD must be a positive number`);
      if (!["nir", "control"].includes(row.group))
        schemaErrors.push(`Item ${i}: group must be "nir" or "control"`);
    });
    if (schemaErrors.length > 0) {
      setBatchErrors(schemaErrors);
      return;
    }

    setSubmitting(true);
    let succeeded = 0;
    const failed: string[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i];
      try {
        const res = await fetch("/api/pilot/observations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claimId: "CLAIM-002",
            observationType: "cost_impact",
            value: row.totalCostAUD,
            group: row.group,
            notes: row.claimRef
              ? `Claim ref: ${row.claimRef}${row.notes ? ` | ${row.notes}` : ""}`
              : row.notes || undefined,
          }),
        });
        if (res.ok) succeeded++;
        else {
          const body = await res.json().catch(() => ({}));
          failed.push(`Item ${i}: ${body.error ?? `HTTP ${res.status}`}`);
        }
      } catch {
        failed.push(`Item ${i}: Network error`);
      }
    }

    setSubmitting(false);
    if (failed.length > 0) {
      setBatchErrors(failed);
    } else {
      setSuccessCount(succeeded);
      setBatchJson("");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push("/dashboard/admin/pilot")}
          className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-slate-400 hover:text-neutral-700 dark:hover:text-slate-300 mb-4 transition-colors"
        >
          <ArrowLeft size={12} />
          Back to pilot dashboard
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
            <BarChart2 size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-neutral-900 dark:text-slate-100">
                CLAIM-002 Cost Observation Entry
              </h1>
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 text-neutral-500"
              >
                Admin only
              </Badge>
            </div>
            <p className="text-sm text-neutral-500 dark:text-slate-400 mt-0.5">
              Record per-claim total costs (AUD) for NIR vs. existing-format
              claims.
            </p>
          </div>
        </div>
      </div>

      {/* Context card */}
      <div className="rounded-lg border border-cyan-200/60 dark:border-cyan-800/40 bg-cyan-50/40 dark:bg-cyan-950/20 px-4 py-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-slate-300">
          <Info size={12} className="text-cyan-600 dark:text-cyan-400" />
          What to enter
        </div>
        <p className="text-xs text-neutral-600 dark:text-slate-400 leading-relaxed">
          Enter the <strong>total claim settlement cost (AUD)</strong> for each
          water damage claim reviewed. Source from Guidewire ClaimCenter
          settlement reports or insurer-provided CSV exports. Use{" "}
          <strong>group: NIR</strong> for claims processed using the
          standardised format, and <strong>group: Control</strong> for claims
          processed under the existing non-standardised format. Minimum{" "}
          <strong>50 per group</strong> required for the Welch t-test to be
          valid (p &lt; 0.05).
        </p>
      </div>

      {/* Success banner */}
      {successCount !== null && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            <strong>{successCount}</strong> cost observation
            {successCount !== 1 ? "s" : ""} recorded for CLAIM-002.
          </p>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setBatchMode(false);
            setErrors([]);
            setBatchErrors([]);
          }}
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-lg transition-all",
            !batchMode
              ? "bg-neutral-900 dark:bg-slate-200 text-white dark:text-slate-900"
              : "text-neutral-600 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-800",
          )}
        >
          Manual entry
        </button>
        <button
          onClick={() => {
            setBatchMode(true);
            setErrors([]);
            setBatchErrors([]);
          }}
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5",
            batchMode
              ? "bg-neutral-900 dark:bg-slate-200 text-white dark:text-slate-900"
              : "text-neutral-600 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-800",
          )}
        >
          <Upload size={11} />
          Batch JSON
        </button>
      </div>

      {/* ── Manual entry mode ─────────────────────────────────────────────── */}
      {!batchMode && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Enter cost observations</CardTitle>
            <CardDescription className="text-xs">
              Add one row per claim. Claim ref and notes are optional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_100px_1fr_28px] gap-2 px-1">
              {["Total cost (AUD) *", "Group *", "Claim ref / notes", ""].map(
                (h, i) => (
                  <div
                    key={i}
                    className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500"
                  >
                    {h}
                  </div>
                ),
              )}
            </div>

            {/* Rows */}
            {entries.map((entry, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_100px_1fr_28px] gap-2 items-center"
              >
                {/* Cost */}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={entry.totalCostAUD}
                  onChange={(e) =>
                    updateEntry(idx, "totalCostAUD", e.target.value)
                  }
                  placeholder="e.g. 18500.00"
                  className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
                {/* Group */}
                <select
                  value={entry.group}
                  onChange={(e) => updateEntry(idx, "group", e.target.value)}
                  className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-2 py-2 text-neutral-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                >
                  <option value="nir">NIR</option>
                  <option value="control">Control</option>
                </select>
                {/* Claim ref / notes */}
                <input
                  type="text"
                  value={entry.notes}
                  onChange={(e) => updateEntry(idx, "notes", e.target.value)}
                  placeholder="e.g. GW-2026-009144"
                  className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
                {/* Remove */}
                <button
                  onClick={() => removeEntry(idx)}
                  disabled={entries.length === 1}
                  className="w-7 h-7 rounded flex items-center justify-center text-neutral-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 disabled:opacity-30 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            {/* Add row */}
            <button
              onClick={addEntry}
              className="flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 transition-colors font-medium"
            >
              <Plus size={13} />
              Add row
            </button>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 px-3 py-2.5 space-y-1">
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">
                    {e}
                  </p>
                ))}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-neutral-400 dark:text-slate-500">
                {entries.length} row{entries.length !== 1 ? "s" : ""} to submit
              </p>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                size="sm"
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {submitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin mr-1.5" />{" "}
                    Recording…
                  </>
                ) : (
                  <>
                    Record {entries.length} observation
                    {entries.length !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Batch JSON mode ───────────────────────────────────────────────── */}
      {batchMode && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Bulk upload via JSON</CardTitle>
            <CardDescription className="text-xs">
              Paste an array of cost records. Each record needs{" "}
              <code className="font-mono">totalCostAUD</code> and{" "}
              <code className="font-mono">group</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Schema example */}
            <div className="rounded-lg bg-neutral-900 dark:bg-slate-950 p-4 overflow-x-auto">
              <pre className="text-[11px] text-slate-300 font-mono leading-relaxed whitespace-pre">{`[
  {
    "group": "nir",
    "totalCostAUD": 18500.00,
    "claimRef": "GW-2026-009144",   // optional
    "notes": "IAG water damage"     // optional
  },
  {
    "group": "control",
    "totalCostAUD": 23200.00,
    "claimRef": "GW-2026-007891"
  }
]`}</pre>
            </div>

            {/* Textarea */}
            <textarea
              value={batchJson}
              onChange={(e) => setBatchJson(e.target.value)}
              placeholder="Paste JSON array here..."
              rows={10}
              className="w-full font-mono text-xs rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2.5 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 resize-y"
            />

            {/* Batch errors */}
            {batchErrors.length > 0 && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 px-3 py-2.5 space-y-1">
                {batchErrors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">
                    {e}
                  </p>
                ))}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-neutral-400 dark:text-slate-500">
                Records are submitted one-by-one to preserve partial success.
              </p>
              <Button
                onClick={handleBatchSubmit}
                disabled={submitting || !batchJson.trim()}
                size="sm"
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {submitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin mr-1.5" />{" "}
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload size={13} className="mr-1.5" /> Submit batch
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data requirement summary */}
      <div className="rounded-lg border border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
        <p className="text-xs font-medium text-neutral-600 dark:text-slate-400 mb-2">
          CLAIM-002 data requirements
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            { label: "NIR group", target: 50, colour: "bg-cyan-400" },
            { label: "Control group", target: 50, colour: "bg-violet-400" },
          ].map(({ label, target, colour }) => (
            <div key={label} className="space-y-1">
              <div className="flex justify-between text-neutral-500 dark:text-slate-400">
                <span>{label}</span>
                <span className="font-mono">? / {target}</span>
              </div>
              <div className="h-1.5 w-full bg-neutral-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full w-0", colour)} />
              </div>
              <p className="text-[10px] text-neutral-400 dark:text-slate-500">
                Check the{" "}
                <a
                  href="/dashboard/admin/pilot"
                  className="text-cyan-500 hover:underline"
                >
                  readiness dashboard
                </a>{" "}
                for live counts.
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
