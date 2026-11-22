"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api-error-message";
import {
  roomObservationGroups,
  roomObservationsOmittedNotice,
  ROOM_OBSERVATIONS_NOTICE,
  type ReportRoomObservation,
} from "@/lib/reports/room-observations";

type Kind = "ODOUR" | "VISIBLE_GROWTH" | "STAINING";

const FIELD =
  "w-full rounded-lg border border-neutral-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-neutral-900 dark:text-slate-100";

/**
 * RA-7694: record odour, visible growth and staining per room. What the report
 * prints in Section 6C comes from here. Records what was seen, smelt or
 * measured: no species, no diagnosis.
 */
export function RoomObservationsPanel({
  inspectionId,
  className,
}: {
  inspectionId: string;
  className?: string;
}) {
  const [rows, setRows] = useState<ReportRoomObservation[] | null>(null);
  const [omitted, setOmitted] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>("ODOUR");
  const [roomLabel, setRoomLabel] = useState("");
  const [basis, setBasis] = useState("OBSERVED");
  const [descriptor, setDescriptor] = useState("");
  const [intensity, setIntensity] = useState("");
  const [pattern, setPattern] = useState("");
  const [area, setArea] = useState("");
  const [surface, setSurface] = useState("");
  const [detail, setDetail] = useState("");

  const url = `/api/inspections/${encodeURIComponent(inspectionId)}/room-observations`;

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as {
        observations: ReportRoomObservation[];
        omitted?: number;
      };
      setRows(j.observations);
      setOmitted(j.omitted ?? 0);
    } catch {
      setRows(null);
      setLoadFailed(true);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = { kind, roomLabel, basis };
      if (detail.trim()) body.detail = detail;
      if (kind === "ODOUR") {
        if (descriptor.trim()) body.odourDescriptor = descriptor;
        if (intensity) body.odourIntensity = Number(intensity);
        if (pattern) body.odourPattern = pattern;
      } else {
        if (surface.trim()) body.surface = surface;
        if (kind === "VISIBLE_GROWTH" && area.trim()) body.areaM2 = Number(area);
      }
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        setError(apiErrorMessage(data) ?? "Could not save the observation");
        return;
      }
      setDescriptor("");
      setIntensity("");
      setPattern("");
      setArea("");
      setSurface("");
      setDetail("");
      await load();
    } catch {
      setError("Could not save the observation. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const groups = roomObservationGroups(rows);

  return (
    <section
      aria-labelledby="room-observations-heading"
      className={cn(
        "rounded-xl border border-neutral-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 shadow-sm p-4 sm:p-5 space-y-4",
        className,
      )}
    >
      <h2
        id="room-observations-heading"
        className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-slate-400"
      >
        Room observations: odour, visible growth, staining
      </h2>
      <p className="text-xs text-neutral-600 dark:text-slate-400">
        {ROOM_OBSERVATIONS_NOTICE}
      </p>

      {loadFailed ? (
        <div role="alert" className="text-sm text-neutral-700 dark:text-slate-200 space-y-2">
          <p>We could not load the recorded observations, so none are shown. Nothing was changed.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : rows === null ? (
        <p className="text-sm text-neutral-600 dark:text-slate-400">Loading</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-slate-400" data-testid="room-observations-empty">
          No observations recorded yet. Nothing prints in the report until one is.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="room-observations-list">
          {groups.map((g) => (
            <li key={g.room}>
              <p className="text-sm font-semibold text-neutral-900 dark:text-slate-100">{g.room}</p>
              <ul className="mt-1 space-y-1">
                {g.rows.map(([label, value], i) => (
                  <li key={i} className="text-sm text-neutral-700 dark:text-slate-300">
                    <span className="font-medium">{label}</span> {value}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {roomObservationsOmittedNotice(omitted) ? (
        <p className="text-xs text-neutral-600 dark:text-slate-400" data-testid="room-observations-omitted">
          {roomObservationsOmittedNotice(omitted)}
        </p>
      ) : null}

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="ro-kind">What did you record</Label>
          <select id="ro-kind" className={FIELD} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="ODOUR">Odour</option>
            <option value="VISIBLE_GROWTH">Visible growth</option>
            <option value="STAINING">Staining</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ro-room">Room</Label>
          <Input id="ro-room" value={roomLabel} maxLength={120} onChange={(e) => setRoomLabel(e.target.value)} />
        </div>

        {kind === "ODOUR" ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="ro-descriptor">Smell (for example musty)</Label>
              <Input id="ro-descriptor" value={descriptor} maxLength={120} onChange={(e) => setDescriptor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ro-pattern">Constant or intermittent</Label>
              <select id="ro-pattern" className={FIELD} value={pattern} onChange={(e) => setPattern(e.target.value)}>
                <option value="">Not recorded</option>
                <option value="CONSTANT">Constant</option>
                <option value="INTERMITTENT">Intermittent</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ro-intensity">Intensity</Label>
              <select id="ro-intensity" className={FIELD} value={intensity} onChange={(e) => setIntensity(e.target.value)}>
                <option value="">Not recorded</option>
                <option value="1">1 faint</option>
                <option value="2">2 moderate</option>
                <option value="3">3 strong</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor="ro-surface">Surface or material</Label>
              <Input id="ro-surface" value={surface} maxLength={120} onChange={(e) => setSurface(e.target.value)} />
            </div>
            {kind === "VISIBLE_GROWTH" ? (
              <div className="space-y-1">
                <Label htmlFor="ro-area">Visible area (m2, estimate)</Label>
                <Input id="ro-area" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
              </div>
            ) : null}
          </>
        )}

        <div className="space-y-1">
          <Label htmlFor="ro-basis">This is</Label>
          <select id="ro-basis" className={FIELD} value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option value="OBSERVED">Observed</option>
            <option value="MEASURED">Measured</option>
            <option value="HYPOTHESISED">A hypothesis, not confirmed</option>
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="ro-detail">Detail (colour, extent, where in the room)</Label>
          <Textarea id="ro-detail" rows={2} maxLength={1000} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </div>

        <div className="sm:col-span-2 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving" : "Save observation"}
          </Button>
          {error ? (
            <span role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
