"use client";

/**
 * J-07 — assign or unassign the job's field technician.
 *
 * Shown to the owner and managers only; PATCH /api/inspections/[id] enforces
 * the same rule and accepts only a technician from the caller's organisation.
 */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export function AssignTechnician({
  inspectionId,
  technicianId,
  onAssigned,
}: {
  inspectionId: string;
  technicianId: string | null;
  onAssigned: (technicianId: string | null) => void;
}) {
  const [technicians, setTechnicians] = useState<TeamMember[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/team/members")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("members"))))
      .then((data: { members?: TeamMember[] }) => {
        if (active) setTechnicians((data.members ?? []).filter((m) => m.role === "USER"));
      })
      .catch(() => active && setTechnicians([]));
    return () => {
      active = false;
    };
  }, []);

  const assign = async (next: string | null) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error?.message ?? body?.error ?? "Could not assign the technician");
        return;
      }
      onAssigned(next);
      toast.success(next ? "Technician assigned" : "Technician unassigned");
    } catch {
      toast.error("Could not assign the technician");
    } finally {
      setSaving(false);
    }
  };

  if (technicians === null) return null;

  return (
    <label className="flex items-center gap-1">
      <span className="sr-only">Assigned technician</span>
      <select
        aria-label="Assigned technician"
        value={technicianId ?? ""}
        disabled={saving}
        onChange={(e) => assign(e.target.value || null)}
        className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
      >
        <option value="">Unassigned</option>
        {technicians.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name || t.email}
          </option>
        ))}
      </select>
    </label>
  );
}
