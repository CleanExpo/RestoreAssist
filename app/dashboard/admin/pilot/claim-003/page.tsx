"use client";

/**
 * CLAIM-003 Re-inspection Rate — Control Group Entry — Admin
 *
 * Route: /dashboard/admin/pilot/claim-003
 * Auth:  ADMIN role required
 *
 * CLAIM-003 measures the rate at which claims require a second inspection.
 *
 * NIR group data is AUTO-COLLECTED on every inspection submit (submit route
 * writes a reinspection_event observation for each NIR submission).
 *
 * This page collects CONTROL GROUP data only — re-inspection events for
 * claims processed outside RestoreAssist (non-standardised format).
 * Source: insurer or contractor records of repeat site visits.
 *
 * Value encoding:
 *   1 = re-inspection was required
 *   0 = no re-inspection required (single visit was sufficient)
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileCheck,
  Plus,
  Loader2,
  CheckCircle2,
  Trash2,
  Upload,
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

interface ReInspectionEntry {
  claimRef: string;
  reInspectionRequired: "1" | "0";
  notes: string;
}

type BatchLine = {
  claimRef?: string;
  reInspectionRequired: 0 | 1;
  notes?: string;
};

const BLANK_ENTRY: ReInspectionEntry = {
  claimRef: "",
  reInspectionRequired: "1",
  notes: "",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Claim003ReInspectionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [entries, setEntries] = useState<ReInspectionEntry[]>([
    { ...BLANK_ENTRY },
  ]);
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

  const updateEntry = (
    idx: number,
    field: keyof ReInspectionEntry,
    value: string,
  ) =>
    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
    );

  const addEntry = () => setEntries((prev) => [...prev, { ...BLANK_ENTRY }]);

  const removeEntry = (idx: number) =>
    setEntries((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev,
    );

  // ── Manual submit ────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
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
            claimId: "CLAIM-003",
            observationType: "reinspection_event",
            value: parseInt(e.reInspectionRequired),
            group: "control",
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
          failed.push(
            `Row ${i + 1}: ${(body as { error?: string }).error ?? `HTTP ${res.status}`}`,
          );
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

  // ── Batch JSON submit ────────────────────────────────────────────────────────

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

    const schemaErrors: string[] = [];
    parsed.forEach((row, i) => {
      if (row.reInspectionRequired !== 0 && row.reInspectionRequired !== 1)
        schemaErrors.push(`Item ${i}: reInspectionRequired must be 0 or 1`);
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
            claimId: "CLAIM-003",
            observationType: "reinspection_event",
            value: row.reInspectionRequired,
            group: "control",
            notes: row.claimRef
              ? `Claim ref: ${row.claimRef}${row.notes ? ` | ${row.notes}` : ""}`
              : row.notes || undefined,
          }),
        });
        if (res.ok) succeeded++;
        else {
          const body = await res.json().catch(() => ({}));
          failed.push(
            `Item ${i}: ${(body as { error?: string }).error ?? `HTTP ${res.status}`}`,
          );
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
            <FileCheck size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-neutral-900 dark:text-slate-100">
                CLAIM-003 Re-inspection Entry
              </h1>
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 text-neutral-500"
              >
                Control group only
              </Badge>
            </div>
            <p className="text-sm text-neutral-500 dark:text-slate-400 mt-0.5">
              Record control group re-inspection events from non-RestoreAssist
              claims.
            </p>
          </div>
        </div>
      </div>

      {/* Context card */}
      <div className="rounded-lg border border-cyan-200/60 dark:border-cyan-800/40 bg-cyan-50/40 dark:bg-cyan-950/20 px-4 py-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-slate-300">
          <Info size={12} className="text-cyan-600 dark:text-cyan-400" />
          Control group only — NIR group is auto-collected
        </div>
        <p className="text-xs text-neutral-600 dark:text-slate-400 leading-relaxed">
          NIR group re-inspection events are{" "}
          <strong>automatically recorded</strong> each time a RestoreAssist
          inspection is submitted. This page is for entering{" "}
          <strong>control group</strong> data only — claims processed using
          non-standardised formats where a second site visit was or wasn&apos;t
          required. Source: insurer adjuster records or contractor job logs.
          Record <strong>1</strong> if a re-inspection was required,{" "}
          <strong>0</strong> if not. Minimum <strong>50 control records</strong>{" "}
          required.
        </p>
      </div>

      {/* Success banner */}
      {successCount !== null && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            <strong>{successCount}</strong> re-inspection observation
            {successCount !== 1 ? "s" : ""} recorded for CLAIM-003 (control
            group).
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

      {/* ── Manual entry ──────────────────────────────────────────────────────── */}
      {!batchMode && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Enter re-inspection observations
            </CardTitle>
            <CardDescription className="text-xs">
              One row per claim. Use 1 = re-inspection required, 0 = single
              visit sufficient.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_120px_1fr_28px] gap-2 px-1">
              {[
                "Claim ref / notes",
                "Re-inspection? *",
                "Additional notes",
                "",
              ].map((h, i) => (
                <div
                  key={i}
                  className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500"
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {entries.map((entry, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_120px_1fr_28px] gap-2 items-center"
              >
                {/* Claim ref */}
                <input
                  type="text"
                  value={entry.claimRef}
                  onChange={(e) => updateEntry(idx, "claimRef", e.target.value)}
                  placeholder="e.g. GW-2026-009144"
                  className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
                {/* Re-inspection required */}
                <select
                  value={entry.reInspectionRequired}
                  onChange={(e) =>
                    updateEntry(idx, "reInspectionRequired", e.target.value)
                  }
                  className="w-full text-sm rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-2 py-2 text-neutral-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                >
                  <option value="1">Yes (required)</option>
                  <option value="0">No (single visit)</option>
                </select>
                {/* Notes */}
                <input
                  type="text"
                  value={entry.notes}
                  onChange={(e) => updateEntry(idx, "notes", e.target.value)}
                  placeholder="Optional context"
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
                {entries.length} row{entries.length !== 1 ? "s" : ""} · control
                group
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

      {/* ── Batch JSON ────────────────────────────────────────────────────────── */}
      {batchMode && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Bulk upload via JSON</CardTitle>
            <CardDescription className="text-xs">
              Paste an array of re-inspection records. Each needs{" "}
              <code className="font-mono">reInspectionRequired</code> (0 or 1).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-neutral-900 dark:bg-slate-950 p-4 overflow-x-auto">
              <pre className="text-[11px] text-slate-300 font-mono leading-relaxed whitespace-pre">{`[
  {
    "reInspectionRequired": 1,       // 1 = re-inspection was needed
    "claimRef": "GW-2026-009144",    // optional
    "notes": "Adjuster requested additional moisture readings"  // optional
  },
  {
    "reInspectionRequired": 0,       // 0 = single visit was sufficient
    "claimRef": "GW-2026-007891"
  }
]`}</pre>
            </div>

            <textarea
              value={batchJson}
              onChange={(e) => setBatchJson(e.target.value)}
              placeholder="Paste JSON array here..."
              rows={10}
              className="w-full font-mono text-xs rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800 px-3 py-2.5 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 resize-y"
            />

            {batchErrors.length > 0 && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 px-3 py-2.5 space-y-1">
                {batchErrors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">
                    {e}
                  </p>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-neutral-400 dark:text-slate-500">
                Records submitted one-by-one to preserve partial success.
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
      <div className="rounded-lg border border-neutral-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-2">
        <p className="text-xs font-medium text-neutral-600 dark:text-slate-400">
          CLAIM-003 data requirements
        </p>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <div className="flex justify-between text-neutral-500 dark:text-slate-400">
              <span>NIR group</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                Auto-collected
              </span>
            </div>
            <div className="h-1.5 w-full bg-emerald-100 dark:bg-emerald-900/30 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-emerald-400 w-full" />
            </div>
            <p className="text-[10px] text-neutral-400 dark:text-slate-500">
              Recorded automatically on each inspection submit.
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-neutral-500 dark:text-slate-400">
              <span>Control group</span>
              <span className="font-mono">? / 50</span>
            </div>
            <div className="h-1.5 w-full bg-neutral-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-violet-400 w-0" />
            </div>
            <p className="text-[10px] text-neutral-400 dark:text-slate-500">
              Enter using this form. Check the{" "}
              <a
                href="/dashboard/admin/pilot"
                className="text-cyan-500 hover:underline"
              >
                readiness dashboard
              </a>{" "}
              for live counts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
