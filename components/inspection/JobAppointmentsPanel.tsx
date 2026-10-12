"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Loader2, Plus } from "lucide-react";

type Appointment = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  assignedUserId: string | null;
};

export function JobAppointmentsPanel({ inspectionId }: { inspectionId: string }) {
  const [rows, setRows] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/appointments`);
      if (!res.ok) throw new Error("Failed to load appointments");
      const json = await res.json();
      setRows(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const scheduleDefault = async () => {
    setSaving(true);
    setError(null);
    const start = new Date();
    start.setHours(start.getHours() + 24, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Follow-up site visit",
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? "Could not create appointment");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const acknowledge = async (appointmentId: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/appointments/${appointmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "acknowledge" }),
        },
      );
      if (!res.ok) throw new Error("Could not acknowledge");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Schedule
        </h3>
        <button
          type="button"
          disabled={saving}
          onClick={() => void scheduleDefault()}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-brand-navy text-white text-xs font-medium px-3 py-2 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Add visit
        </button>
      </div>

      {loading && (
        <p className="text-xs text-slate-500 flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {!loading && rows.length === 0 && (
        <p className="text-xs text-slate-500">No appointments yet.</p>
      )}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="text-xs rounded-lg bg-slate-50 dark:bg-slate-900/50 px-3 py-2 space-y-2"
          >
            <span className="font-medium block">{row.title}</span>
            <span className="text-slate-500 block">
              {new Date(row.startsAt).toLocaleString()} –{" "}
              {new Date(row.endsAt).toLocaleTimeString()} · {row.status}
            </span>
            {row.status === "SCHEDULED" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void acknowledge(row.id)}
                className="min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-medium"
              >
                Acknowledge visit
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
