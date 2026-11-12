"use client";

// RA-1136a: Make-Safe first-48h compliance checklist component
// ICA Code of Practice §3.1 · AS/NZS 1170.0 · WHS Regulations 2011
//
// Brand: navy #1C2E47 header · warm #8A6B4E accents · shadcn/ui primitives only

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useMemo,
  useState,
} from "react";
import { useFetch } from "@/lib/hooks/useFetch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  MAKE_SAFE_COMPLIANCE_LABEL,
  MAKE_SAFE_NOT_ASSESSED_REASON,
  makeSafeCompliance,
} from "@/lib/compliance/make-safe-compliance";
import {
  MAKE_SAFE_ACTIONS,
  MAKE_SAFE_ACTION_LABELS as ACTION_LABELS,
  type MakeSafeActionName,
  type MakeSafeActionState,
  type MakeSafeChecklistState,
  persistMakeSafeChecklist,
} from "@/lib/compliance/make-safe-actions";

// ── Types ──────────────────────────────────────────────────────────────────

interface MakeSafeRow {
  action: string;
  applicable: boolean;
  completed: boolean;
  notes: string | null;
}

type ActionList = readonly MakeSafeActionName[];

const EMPTY_ROW: MakeSafeActionState = {
  applicable: true,
  completed: false,
  notes: "",
};

/**
 * RA-8327: the server names the job's list (fire or standard). A response
 * without one, or naming an action this build has no label for, falls back
 * to the standard list.
 */
function listFrom(names: unknown): ActionList {
  if (
    Array.isArray(names) &&
    names.length > 0 &&
    names.every(
      (n) =>
        typeof n === "string" &&
        Object.prototype.hasOwnProperty.call(ACTION_LABELS, n),
    )
  ) {
    return names as MakeSafeActionName[];
  }
  return MAKE_SAFE_ACTIONS;
}

function defaultState(list: ActionList): MakeSafeChecklistState {
  return Object.fromEntries(list.map((a) => [a, { ...EMPTY_ROW }]));
}

function rowsToState(list: ActionList, rows: MakeSafeRow[]): MakeSafeChecklistState {
  const state = defaultState(list);
  for (const row of rows) {
    if (list.includes(row.action as MakeSafeActionName)) {
      state[row.action as MakeSafeActionName] = {
        applicable: row.applicable,
        completed: row.completed,
        notes: row.notes ?? "",
      };
    }
  }
  return state;
}

/** A quick-fill seed applies only when it is for this job's list. */
function seedFits(list: ActionList, seed: MakeSafeChecklistState): boolean {
  const keys = Object.keys(seed);
  return keys.length === list.length && list.every((a) => seed[a] != null);
}

function rowOf(state: MakeSafeChecklistState, action: MakeSafeActionName) {
  return state[action] ?? EMPTY_ROW;
}

export type MakeSafeChecklistHandle = {
  /** Persist current checklist selections to the inspection (no toast). */
  persist: () => Promise<void>;
  readiness: () => { ok: true } | { ok: false; message: string };
  applySeed: (seed: MakeSafeChecklistState) => void;
};

interface MakeSafeChecklistProps {
  inspectionId: string;
  /** Debounced silent save after edits (e.g. inspection hub without Review & Submit). */
  autoSave?: boolean;
  /** Quick Fill or similar — applied when the API still has the all-N/A intake seed. */
  seed?: MakeSafeChecklistState | null;
}

export const MakeSafeChecklist = forwardRef<
  MakeSafeChecklistHandle,
  MakeSafeChecklistProps
>(function MakeSafeChecklist({ inspectionId, autoSave = false, seed = null }, ref) {
  const endpoint = `/api/inspections/${inspectionId}/make-safe`;

  const { data, loading, error } = useFetch<{
    data: MakeSafeRow[];
    actions?: string[];
  }>(endpoint);

  const list = useMemo(() => listFrom(data?.actions), [data]);
  const listRef = useRef(list);
  listRef.current = list;

  const [state, setState] = useState<MakeSafeChecklistState>(() =>
    defaultState(MAKE_SAFE_ACTIONS),
  );
  const skipAutoSave = useRef(true);
  const stateRef = useRef(state);
  stateRef.current = state;

  const intakeSeedFromApi = (rows: MakeSafeRow[]) => {
    const next = rowsToState(list, rows);
    return list.every((action) => !rowOf(next, action).applicable);
  };
  const usableSeed = seed && seedFits(list, seed) ? seed : null;

  // Hydrate from API on load
  useEffect(() => {
    if (data?.data) {
      const fromApi = rowsToState(list, data.data);
      if (usableSeed && intakeSeedFromApi(data.data)) {
        setState(usableSeed);
      } else {
        setState(fromApi);
      }
      skipAutoSave.current = true;
    }
  }, [data, usableSeed, list]);

  useImperativeHandle(
    ref,
    () => ({
      persist: () => persistMakeSafeChecklist(inspectionId, stateRef.current),
      readiness: () => {
        const compliance = makeSafeCompliance(
          listRef.current.map((action) => rowOf(stateRef.current, action)),
        );
        if (compliance === "NOT_ASSESSED") {
          return { ok: false, message: MAKE_SAFE_NOT_ASSESSED_REASON };
        }
        if (compliance === "FAIL") {
          return {
            ok: false,
            message:
              "Complete all applicable stabilisation items before submitting.",
          };
        }
        return { ok: true };
      },
      applySeed: (next) => {
        // A preset written for the other list (e.g. a water quick-fill on a
        // fire job) is not applied; the job keeps its own list.
        if (!seedFits(listRef.current, next)) return;
        setState(next);
        skipAutoSave.current = true;
      },
    }),
    [inspectionId],
  );

  useEffect(() => {
    if (!autoSave || skipAutoSave.current) {
      skipAutoSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void persistMakeSafeChecklist(inspectionId, stateRef.current).catch(
        () => {
          /* Hub autosave is best-effort; explicit persist on submit surfaces errors. */
        },
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [autoSave, inspectionId, state]);

  // ── Compliance pill ──────────────────────────────────────────────────────

  // RA-7713: all-N/A (the intake seed) is "Not assessed", never PASS.
  const compliance = makeSafeCompliance(
    list.map((a) => rowOf(state, a)),
  );
  const complianceStatus = MAKE_SAFE_COMPLIANCE_LABEL[compliance];

  // ── Field handlers ───────────────────────────────────────────────────────

  function setField<K extends keyof MakeSafeActionState>(
    action: MakeSafeActionName,
    field: K,
    value: MakeSafeActionState[K],
  ) {
    setState((prev) => ({
      ...prev,
      [action]: { ...rowOf(prev, action), [field]: value },
    }));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-lg border p-4 animate-pulse">
        <div className="h-6 bg-muted rounded w-48 mb-4" />
        {list.map((a) => (
          <div key={a} className="h-10 bg-muted rounded mb-2" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive p-4 text-destructive text-sm">
        Failed to load Stabilisation checklist: {error}
      </div>
    );
  }

  return (
    <section
      aria-label="Stabilisation (Make-Safe) Compliance Checklist"
      className="rounded-lg border overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: "#1C2E47" }}
      >
        <div>
          <h2 className="text-base font-semibold text-white">
            Stabilisation (Make-Safe) Checklist
          </h2>
          <p className="text-xs text-white/70 mt-0.5">
            ICA Code of Practice §3.1 · AS/NZS 1170.0 · WHS Regulations 2011
          </p>
        </div>
        <Badge
          className={
            compliance === "PASS"
              ? "bg-green-600 text-white hover:bg-green-600"
              : compliance === "NOT_ASSESSED"
                ? "bg-slate-500 text-white hover:bg-slate-500"
                : "bg-amber-500 text-white hover:bg-amber-500"
          }
          aria-label={`Compliance status: ${complianceStatus}`}
        >
          Compliance: {complianceStatus}
        </Badge>
      </div>

      {/* Rows */}
      <div className="divide-y">
        {list.map((action) => {
          const row = rowOf(state, action);
          const checkboxId = `make-safe-${action}`;
          const naId = `make-safe-na-${action}`;
          const notesId = `make-safe-notes-${action}`;

          return (
            <div key={action} className="p-4 space-y-2">
              <div className="flex items-start gap-3">
                {/* Completed checkbox */}
                <Checkbox
                  id={checkboxId}
                  checked={row.completed && row.applicable}
                  disabled={!row.applicable}
                  onCheckedChange={(checked) =>
                    setField(action, "completed", !!checked)
                  }
                  aria-label={`Mark "${ACTION_LABELS[action]}" as completed`}
                  style={
                    row.completed && row.applicable
                      ? { accentColor: "#8A6B4E" }
                      : undefined
                  }
                />
                <Label
                  htmlFor={checkboxId}
                  className={`flex-1 text-sm leading-snug cursor-pointer ${
                    !row.applicable ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  {ACTION_LABELS[action]}
                </Label>

                {/* N/A toggle */}
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  <Checkbox
                    id={naId}
                    checked={!row.applicable}
                    onCheckedChange={(checked) => {
                      setField(action, "applicable", !checked);
                      if (checked) setField(action, "completed", false);
                    }}
                    aria-label={`Mark "${ACTION_LABELS[action]}" as not applicable`}
                  />
                  <Label
                    htmlFor={naId}
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    N/A
                  </Label>
                </div>
              </div>

              {/* Notes */}
              <div className="pl-8">
                <Label
                  htmlFor={notesId}
                  className="text-xs text-muted-foreground"
                >
                  Notes
                </Label>
                <Textarea
                  id={notesId}
                  value={row.notes}
                  onChange={(e) => setField(action, "notes", e.target.value)}
                  placeholder="Optional notes…"
                  rows={2}
                  className="mt-1 text-sm resize-none"
                  aria-label={`Notes for "${ACTION_LABELS[action]}"`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
});
