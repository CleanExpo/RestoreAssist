"use client";

// RA-1136a: Make-Safe first-48h compliance checklist component
// ICA Code of Practice §3.1 · AS/NZS 1170.0 · WHS Regulations 2011
//
// Brand: navy #1C2E47 header · warm #8A6B4E accents · shadcn/ui primitives only

import { useState, useEffect } from "react";
import { useFetch } from "@/lib/hooks/useFetch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";

// ── Constants ──────────────────────────────────────────────────────────────

const MAKE_SAFE_ACTIONS = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
] as const;

type MakeSafeActionName = (typeof MAKE_SAFE_ACTIONS)[number];

const ACTION_LABELS: Record<MakeSafeActionName, string> = {
  power_isolated: "Power isolated (electrical hazard)",
  gas_isolated: "Gas supply isolated (gas leak hazard)",
  mould_containment: "Mould containment barriers erected",
  water_stopped: "Water source stopped/diverted",
  occupant_briefing: "Occupant safety briefing documented",
};

// ── Types ──────────────────────────────────────────────────────────────────

interface MakeSafeRow {
  action: string;
  applicable: boolean;
  completed: boolean;
  notes: string | null;
}

interface ActionState {
  applicable: boolean;
  completed: boolean;
  notes: string;
}

type ChecklistState = Record<MakeSafeActionName, ActionState>;

function defaultState(): ChecklistState {
  return Object.fromEntries(
    MAKE_SAFE_ACTIONS.map((a) => [
      a,
      { applicable: true, completed: false, notes: "" },
    ]),
  ) as ChecklistState;
}

function rowsToState(rows: MakeSafeRow[]): ChecklistState {
  const state = defaultState();
  for (const row of rows) {
    if (MAKE_SAFE_ACTIONS.includes(row.action as MakeSafeActionName)) {
      state[row.action as MakeSafeActionName] = {
        applicable: row.applicable,
        completed: row.completed,
        notes: row.notes ?? "",
      };
    }
  }
  return state;
}

// ── Component ──────────────────────────────────────────────────────────────

interface MakeSafeChecklistProps {
  inspectionId: string;
}

export function MakeSafeChecklist({ inspectionId }: MakeSafeChecklistProps) {
  const endpoint = `/api/inspections/${inspectionId}/make-safe`;

  const { data, loading, error } = useFetch<{ data: MakeSafeRow[] }>(endpoint);

  const [state, setState] = useState<ChecklistState>(defaultState);
  const [saving, setSaving] = useState(false);

  // Hydrate from API on load
  useEffect(() => {
    if (data?.data) {
      setState(rowsToState(data.data));
    }
  }, [data]);

  // ── Compliance pill ──────────────────────────────────────────────────────

  const applicableActions = MAKE_SAFE_ACTIONS.filter(
    (a) => state[a].applicable,
  );
  const allApplicableComplete = applicableActions.every(
    (a) => state[a].completed,
  );
  const complianceStatus = allApplicableComplete ? "PASS" : "INCOMPLETE";

  // ── Field handlers ───────────────────────────────────────────────────────

  function setField<K extends keyof ActionState>(
    action: MakeSafeActionName,
    field: K,
    value: ActionState[K],
  ) {
    setState((prev) => ({
      ...prev,
      [action]: { ...prev[action], [field]: value },
    }));
  }

  // ── Save handler ─────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        actions: MAKE_SAFE_ACTIONS.map((action) => ({
          action,
          applicable: state[action].applicable,
          completed: state[action].completed,
          notes: state[action].notes || undefined,
        })),
      };

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }

      toast.success(
        `Stabilisation checklist saved — compliance status: ${complianceStatus}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      toast.error(`Save failed: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-lg border p-4 animate-pulse">
        <div className="h-6 bg-muted rounded w-48 mb-4" />
        {MAKE_SAFE_ACTIONS.map((a) => (
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
            complianceStatus === "PASS"
              ? "bg-green-600 text-white hover:bg-green-600"
              : "bg-amber-500 text-white hover:bg-amber-500"
          }
          aria-label={`Compliance status: ${complianceStatus}`}
        >
          Compliance: {complianceStatus}
        </Badge>
      </div>

      {/* Rows */}
      <div className="divide-y">
        {MAKE_SAFE_ACTIONS.map((action) => {
          const row = state[action];
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
              <div className="pl-7">
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

      {/* Footer */}
      <div className="px-4 py-3 border-t flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          style={{ backgroundColor: "#8A6B4E" }}
          className="text-white hover:opacity-90"
          aria-label="Save Stabilisation checklist"
        >
          {saving ? "Saving…" : "Save Checklist"}
        </Button>
      </div>
    </section>
  );
}
