"use client";

import { useCallback, useEffect, useState } from "react";
import { ChromeCalendar, ChromePlus, ChromeSpinner } from "@/components/brand/chrome-icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Appointment = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  assignedUserId: string | null;
};

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type BookingForm = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  assignedUserId: string;
  notes: string;
};

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const emptyForm = (): BookingForm => ({
  title: "Site visit",
  date: tomorrow(),
  startTime: "09:00",
  endTime: "11:00",
  assignedUserId: "",
  notes: "",
});

const memberLabel = (m: TeamMember) => m.name?.trim() || m.email;

/**
 * RA-8497 (DRC S4): book a site visit or re-attendance with a date, times, a
 * technician and a note. The server reads the typed date and times in the
 * organisation's timezone, and tells the technician in-app (with the note)
 * and by email with a calendar file (without the note).
 */
export function JobAppointmentsPanel({ inspectionId }: { inspectionId: string }) {
  const [rows, setRows] = useState<Appointment[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<BookingForm | null>(null);

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

  useEffect(() => {
    let active = true;
    fetch("/api/team/members")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("members"))))
      .then((data: { members?: TeamMember[] }) => {
        if (active) setMembers(data.members ?? []);
      })
      .catch(() => active && setMembers([]));
    return () => {
      active = false;
    };
  }, []);

  const update = (field: keyof BookingForm, value: string) =>
    setForm((f) => (f ? { ...f, [field]: value } : f));

  const book = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          assignedUserId: form.assignedUserId || undefined,
          notes: form.notes,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? j?.message ?? "Could not book the visit");
      }
      setForm(null);
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

  const assigneeName = (id: string | null) => {
    if (!id) return null;
    const m = members.find((x) => x.id === id);
    return m ? memberLabel(m) : "Assigned";
  };

  const field = `appt-${inspectionId}`;

  return (
    <section className="flex h-full min-h-[120px] flex-col rounded-xl border border-neutral-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ChromeCalendar className="h-4 w-4" />
          Schedule
        </h3>
        {!form && (
          <button
            type="button"
            disabled={saving}
            onClick={() => setForm(emptyForm())}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-neutral-200 dark:border-slate-600 bg-neutral-50 dark:bg-slate-800 text-xs font-medium px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <ChromePlus className="h-3 w-3" />
            Add visit
          </button>
        )}
      </div>

      {form && (
        <form
          className="space-y-3 rounded-lg border border-neutral-200 dark:border-slate-700 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void book();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`${field}-title`}>Visit</Label>
            <Input
              id={`${field}-title`}
              value={form.title}
              maxLength={200}
              onChange={(e) => update("title", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={`${field}-date`}>Date</Label>
              <Input
                id={`${field}-date`}
                type="date"
                required
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${field}-start`}>Start</Label>
              <Input
                id={`${field}-start`}
                type="time"
                required
                value={form.startTime}
                onChange={(e) => update("startTime", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${field}-end`}>End</Label>
              <Input
                id={`${field}-end`}
                type="time"
                required
                value={form.endTime}
                onChange={(e) => update("endTime", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${field}-tech`}>Technician</Label>
            <select
              id={`${field}-tech`}
              value={form.assignedUserId}
              onChange={(e) => update("assignedUserId", e.target.value)}
              className="min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base md:text-sm dark:bg-input/30"
            >
              <option value="">Not assigned yet</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${field}-notes`}>Note for the technician</Label>
            <Textarea
              id={`${field}-notes`}
              value={form.notes}
              maxLength={2000}
              onChange={(e) => update("notes", e.target.value)}
            />
          </div>
          <p className="text-xs text-slate-500">
            Times are in your organisation&apos;s timezone. The technician sees the
            note in RestoreAssist and gets an email with a calendar file. The email
            shows the visit name, time and job number only, so keep client names
            and contact details in the note, not the visit name.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium px-3 py-2 disabled:opacity-50"
            >
              {saving && <ChromeSpinner className="h-3 w-3 animate-spin" />}
              Book visit
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setForm(null)}
              className="min-h-11 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && (
        <p className="text-xs text-slate-500 flex items-center gap-2">
          <ChromeSpinner className="h-3 w-3 animate-spin" /> Loading…
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
            {row.assignedUserId && (
              <span className="block">Technician: {assigneeName(row.assignedUserId)}</span>
            )}
            {row.notes && (
              <span className="block whitespace-pre-wrap">{row.notes}</span>
            )}
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
