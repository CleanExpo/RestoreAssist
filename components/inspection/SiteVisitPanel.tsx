"use client";

/**
 * RA-8498 (DRC S5) — the site visit record on the field page.
 *
 * One record per attendance (Visit 1, Visit 2 ...): arrival and departure
 * time, who was on site, the front of property photo and what happened to
 * the equipment. Each change saves at once. "Submit visit" asks the server,
 * which owns the rule (lib/site-visits/visit-gate.ts); if anything is
 * missing, the list it sends back is shown next to the form.
 */
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  EQUIPMENT_OUTCOME_LABEL,
  EQUIPMENT_OUTCOME_VALUES,
  MET_ON_SITE_LABEL,
  MET_ON_SITE_VALUES,
  type EquipmentOutcome,
  type MetOnSite,
} from "@/lib/site-visits/visit-gate";

/** Photos shown in the front photo picker before "Show all". */
const PHOTO_PAGE = 24;

export interface SiteVisitRow {
  id: string;
  visitNumber: number;
  arrivedAt: string | null;
  departedAt: string | null;
  metOnSite: MetOnSite | null;
  frontPhotoId: string | null;
  frontPhoto: {
    id: string;
    url: string | null;
    thumbnailUrl: string | null;
  } | null;
  equipmentOutcome: EquipmentOutcome | null;
  equipmentNote: string | null;
  submittedAt: string | null;
  minutesOnSite: number | null;
}

interface PhotoOption {
  id: string;
  url: string | null;
  thumbnailUrl: string | null;
}

type Patch = Partial<{
  arrivedAt: string | null;
  departedAt: string | null;
  metOnSite: MetOnSite | null;
  frontPhotoId: string | null;
  equipmentOutcome: EquipmentOutcome | null;
  equipmentNote: string | null;
}>;

/** "2026-11-22T09:05" in the device's own time zone, for a datetime-local input. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

async function readError(
  res: Response,
): Promise<{ message: string; fields: Record<string, string> }> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string; fields?: Record<string, string> } | string;
  } | null;
  const err = body?.error;
  if (err && typeof err === "object") {
    return {
      message: err.message ?? "Something went wrong",
      fields: err.fields ?? {},
    };
  }
  return {
    message: typeof err === "string" ? err : "Something went wrong",
    fields: {},
  };
}

const fieldLabel =
  "block text-xs font-medium text-brand-slate dark:text-white/60 mb-1";
const box =
  "w-full min-h-[44px] rounded-xl border border-brand-mist dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm text-brand-navy dark:text-white";
const choice = (selected: boolean) =>
  cn(
    "min-h-[44px] rounded-xl border px-3 py-2 text-sm text-left transition-colors",
    selected
      ? "border-brand-gold bg-brand-gold/10 text-brand-navy dark:text-white font-medium"
      : "border-brand-mist dark:border-white/10 text-brand-slate dark:text-white/70",
  );

export function SiteVisitPanel({ inspectionId }: { inspectionId: string }) {
  const [visits, setVisits] = useState<SiteVisitRow[] | null>(null);
  const [photos, setPhotos] = useState<PhotoOption[]>([]);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const base = `/api/inspections/${inspectionId}/visits`;

  const load = useCallback(async () => {
    try {
      const [v, p] = await Promise.all([
        fetch(base, { cache: "no-store" }),
        fetch(`/api/inspections/${inspectionId}/photos`, { cache: "no-store" }),
      ]);
      if (!v.ok) {
        setError((await readError(v)).message);
        setVisits([]);
        return;
      }
      setVisits(((await v.json()) as { data: SiteVisitRow[] }).data);
      if (p.ok)
        setPhotos(
          ((await p.json()) as { photos?: PhotoOption[] }).photos ?? [],
        );
    } catch {
      setError(
        "Could not load site visits. Check your connection and try again.",
      );
      setVisits((cur) => cur ?? []);
    }
  }, [base, inspectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = visits?.find((v) => !v.submittedAt) ?? null;
  const submitted = visits?.filter((v) => v.submittedAt) ?? [];

  async function startVisit() {
    setBusy(true);
    setError(null);
    setMissing({});
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) setError((await readError(res)).message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function save(visit: SiteVisitRow, patch: Patch) {
    setError(null);
    // Show the change straight away; the reload below brings back what saved.
    setVisits(
      (cur) =>
        cur?.map((v) => (v.id === visit.id ? { ...v, ...patch } : v)) ?? cur,
    );
    const res = await fetch(`${base}/${visit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) setError((await readError(res)).message);
    await load();
  }

  async function submitVisit(visit: SiteVisitRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/${visit.id}/submit`, { method: "POST" });
      if (res.ok) {
        setMissing({});
      } else {
        const e = await readError(res);
        setMissing(e.fields);
        setError(e.message);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (visits === null) {
    return (
      <p className="text-sm text-brand-slate dark:text-white/50 py-6 text-center">
        Loading site visits...
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="site-visit-panel">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 dark:border-red-400/40 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200"
        >
          <p>{error}</p>
          {Object.keys(missing).length > 0 && (
            <ul className="mt-2 list-disc pl-5" aria-label="Still to record">
              {Object.entries(missing).map(([field, label]) => (
                <li key={field}>{label}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open ? (
        <section
          aria-labelledby={`visit-${open.id}`}
          className="rounded-xl border border-brand-mist dark:border-white/10 bg-white/60 dark:bg-white/5 p-4 space-y-4"
        >
          <h2 id={`visit-${open.id}`} className="text-base font-semibold">
            Visit {open.visitNumber}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="visit-arrived" className={fieldLabel}>
                Arrival time
              </label>
              <input
                id="visit-arrived"
                type="datetime-local"
                className={box}
                value={toLocalInput(open.arrivedAt)}
                onChange={(e) =>
                  void save(open, { arrivedAt: fromLocalInput(e.target.value) })
                }
              />
            </div>
            <div>
              <label htmlFor="visit-departed" className={fieldLabel}>
                Departure time
              </label>
              <div className="flex gap-2">
                <input
                  id="visit-departed"
                  type="datetime-local"
                  className={box}
                  value={toLocalInput(open.departedAt)}
                  onChange={(e) =>
                    void save(open, {
                      departedAt: fromLocalInput(e.target.value),
                    })
                  }
                />
                <button
                  type="button"
                  className="min-h-[44px] shrink-0 rounded-xl bg-brand-navy/5 dark:bg-white/10 px-3 text-sm font-medium"
                  onClick={() =>
                    void save(open, { departedAt: new Date().toISOString() })
                  }
                >
                  Now
                </button>
              </div>
            </div>
          </div>

          <fieldset>
            <legend className={fieldLabel}>Who was on site</legend>
            <div className="grid grid-cols-2 gap-2">
              {MET_ON_SITE_VALUES.map((v) => (
                <label key={v} className={choice(open.metOnSite === v)}>
                  <input
                    type="radio"
                    name="metOnSite"
                    className="sr-only"
                    checked={open.metOnSite === v}
                    onChange={() => void save(open, { metOnSite: v })}
                  />
                  {MET_ON_SITE_LABEL[v]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={fieldLabel}>Front of property photo</legend>
            {photos.length === 0 ? (
              <p className="text-sm text-brand-slate dark:text-white/50">
                No photos on this job yet. Take the front of property photo on
                the{" "}
                <a
                  className="underline text-brand-bronze dark:text-brand-gold"
                  href={`/dashboard/inspections/${inspectionId}/photos`}
                >
                  Photos page
                </a>
                , then choose it here.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {/* The newest PHOTO_PAGE photos, plus the chosen one wherever it
                    is; "Show all" reaches older photos (review round 2). */}
                  {photos
                    .map((p, i) => ({ p, i }))
                    .filter(
                      ({ p, i }) =>
                        showAllPhotos ||
                        i < PHOTO_PAGE ||
                        p.id === open.frontPhotoId,
                    )
                    .map(({ p, i }) => (
                      <label
                        key={p.id}
                        className={cn(
                          "relative block aspect-square overflow-hidden rounded-xl border-2",
                          open.frontPhotoId === p.id
                            ? "border-brand-gold"
                            : "border-transparent",
                        )}
                      >
                        <input
                          type="radio"
                          name="frontPhotoId"
                          className="sr-only"
                          checked={open.frontPhotoId === p.id}
                          onChange={() =>
                            void save(open, { frontPhotoId: p.id })
                          }
                          aria-label={`Photo ${i + 1}${open.frontPhotoId === p.id ? " (front of property)" : ""}`}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset */}
                        <img
                          src={p.thumbnailUrl ?? p.url ?? ""}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </label>
                    ))}
                </div>
                {!showAllPhotos && photos.length > PHOTO_PAGE && (
                  <button
                    type="button"
                    onClick={() => setShowAllPhotos(true)}
                    className="mt-2 min-h-[44px] w-full rounded-xl border border-brand-slate/30 px-4 text-sm font-medium dark:border-white/20"
                  >
                    Show all {photos.length} photos
                  </button>
                )}
              </>
            )}
          </fieldset>

          <fieldset>
            <legend className={fieldLabel}>Equipment</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EQUIPMENT_OUTCOME_VALUES.map((v) => (
                <label key={v} className={choice(open.equipmentOutcome === v)}>
                  <input
                    type="radio"
                    name="equipmentOutcome"
                    className="sr-only"
                    checked={open.equipmentOutcome === v}
                    onChange={() => void save(open, { equipmentOutcome: v })}
                  />
                  {EQUIPMENT_OUTCOME_LABEL[v]}
                </label>
              ))}
            </div>
            {open.equipmentOutcome === "SOME_REMOVED" && (
              <div className="mt-2">
                <label htmlFor="visit-equipment-note" className={fieldLabel}>
                  Which equipment was removed
                </label>
                <textarea
                  id="visit-equipment-note"
                  className={cn(box, "py-2 min-h-[72px]")}
                  maxLength={500}
                  defaultValue={open.equipmentNote ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (open.equipmentNote ?? ""))
                      void save(open, { equipmentNote: e.target.value });
                  }}
                />
              </div>
            )}
          </fieldset>

          <button
            type="button"
            disabled={busy}
            onClick={() => void submitVisit(open)}
            className="w-full min-h-[48px] rounded-xl bg-brand-gold text-brand-navy font-semibold disabled:opacity-60"
          >
            Submit visit {open.visitNumber}
          </button>
        </section>
      ) : (
        <div className="rounded-xl border border-brand-mist dark:border-white/10 bg-brand-navy/5 dark:bg-white/5 p-4 text-center space-y-3">
          <p className="text-sm text-brand-slate dark:text-white/60">
            {submitted.length === 0
              ? "No site visit recorded yet."
              : "Every visit is submitted. Start a new visit when you return to site."}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startVisit()}
            className="w-full min-h-[48px] rounded-xl bg-brand-gold text-brand-navy font-semibold disabled:opacity-60"
          >
            {submitted.length === 0
              ? "Start visit"
              : `Start visit ${submitted.length + 1}`}
          </button>
        </div>
      )}

      {submitted.length > 0 && (
        <ul className="space-y-2" aria-label="Submitted visits">
          {[...submitted].reverse().map((v) => (
            <li
              key={v.id}
              className="rounded-xl bg-brand-navy/5 dark:bg-white/5 px-4 py-3 text-sm space-y-1"
            >
              <p className="font-semibold">
                Visit {v.visitNumber}{" "}
                <span className="font-normal text-brand-slate dark:text-white/50">
                  submitted
                </span>
              </p>
              <p className="text-brand-slate dark:text-white/70">
                {v.arrivedAt ? timeFormat.format(new Date(v.arrivedAt)) : ""} to{" "}
                {v.departedAt ? timeFormat.format(new Date(v.departedAt)) : ""}
                {v.minutesOnSite !== null
                  ? ` (${formatDuration(v.minutesOnSite)} on site)`
                  : ""}
              </p>
              <p className="text-brand-slate dark:text-white/70">
                On site: {v.metOnSite ? MET_ON_SITE_LABEL[v.metOnSite] : ""}
                {" · "}
                {v.equipmentOutcome
                  ? EQUIPMENT_OUTCOME_LABEL[v.equipmentOutcome]
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
