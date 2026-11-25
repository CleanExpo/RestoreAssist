"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  carsiCompletionHref,
  evidenceHref,
  trainingStatus,
  type TrainingStatus,
} from "@/lib/training/record-input";
import type { TrainingRecordDto } from "@/lib/training/serialise";

/**
 * Mining pilot slice 6: the staff training register.
 *
 * Owners and managers see everyone's records and can add, change or remove
 * them. A technician sees their own records only, with no edit controls; the
 * API enforces the same rule (lib/training/register-access.ts), so hiding the
 * controls here is presentation, not the guard.
 */

interface RegisterData {
  records: TrainingRecordDto[];
  nextCursor: string | null;
  canEdit: boolean;
  noOrganisation: boolean;
}

interface StaffOption {
  id: string;
  name: string;
}

const RECORDS_URL = "/api/team/training-records";
const STAFF_URL = "/api/team/training-records/staff";

interface FormState {
  staffUserId: string;
  course: string;
  provider: string;
  completedOn: string;
  expiresOn: string;
  evidenceUrl: string;
  carsiCompletionRef: string;
}

const EMPTY_FORM: FormState = {
  staffUserId: "",
  course: "",
  provider: "",
  completedOn: "",
  expiresOn: "",
  evidenceUrl: "",
  carsiCompletionRef: "",
};

const STATUS_LABEL: Record<TrainingStatus, string> = {
  "no-expiry": "No expiry",
  current: "Current",
  expiring: "Expires within 30 days",
  expired: "Expired",
};

function localToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function errorMessage(payload: unknown, fallback: string): string {
  const error = (payload as { error?: unknown } | null)?.error;
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; fields?: Record<string, string> };
    const fields = e.fields ? Object.values(e.fields).join(". ") : "";
    if (fields) return fields;
    if (typeof e.message === "string") return e.message;
  }
  return fallback;
}

export function TrainingRegisterPanel({
  today = localToday(),
}: {
  today?: string;
}) {
  const [data, setData] = useState<RegisterData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrainingRecordDto | null>(
    null,
  );
  // The record being edited, exactly as it was read: the edit sends only the
  // fields that differ from it, plus its version (lib/training/version.ts).
  const [editing, setEditing] = useState<TrainingRecordDto | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffCursor, setStaffCursor] = useState<string | null>(null);
  const [staffQuery, setStaffQuery] = useState("");
  const [staffError, setStaffError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(RECORDS_URL, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(errorMessage(json, "The training register could not be loaded."));
        return;
      }
      setLoadError(null);
      setData(json.data as RegisterData);
    } catch {
      setLoadError("The training register could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!data?.nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `${RECORDS_URL}?cursor=${encodeURIComponent(data.nextCursor)}`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(errorMessage(json, "More records could not be loaded."));
        return;
      }
      const next = json.data as RegisterData;
      setLoadError(null);
      setData((d) =>
        d
          ? { ...d, records: [...d.records, ...next.records], nextCursor: next.nextCursor }
          : next,
      );
    } catch {
      setLoadError("More records could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function fetchStaff(q: string, cursor: string | null) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (cursor) params.set("cursor", cursor);
    try {
      const res = await fetch(`${STAFF_URL}?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setStaffError(errorMessage(json, "Staff could not be loaded."));
        return;
      }
      const page = json.data as { staff: StaffOption[]; nextCursor: string | null };
      setStaffError(null);
      setStaff((prev) => (cursor ? [...prev, ...page.staff] : page.staff));
      setStaffCursor(page.nextCursor);
    } catch {
      setStaffError("Staff could not be loaded.");
    }
  }

  function startAdd() {
    setEditingId(null);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
    setStaffQuery("");
    void fetchStaff("", null);
  }

  function startEdit(r: TrainingRecordDto) {
    setEditingId(r.id);
    setEditing(r);
    setForm({
      staffUserId: r.staffUserId,
      course: r.course,
      provider: r.provider,
      completedOn: r.completedOn,
      expiresOn: r.expiresOn ?? "",
      evidenceUrl: r.evidenceUrl ?? "",
      carsiCompletionRef: r.carsiCompletionRef ?? "",
    });
    setFormError(null);
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const { staffUserId, ...fields } = form;
    let body: Record<string, string>;
    if (editingId && editing) {
      const before: Record<string, string> = {
        course: editing.course,
        provider: editing.provider,
        completedOn: editing.completedOn,
        expiresOn: editing.expiresOn ?? "",
        evidenceUrl: editing.evidenceUrl ?? "",
        carsiCompletionRef: editing.carsiCompletionRef ?? "",
      };
      const changed = Object.fromEntries(
        Object.entries(fields).filter(([k, v]) => before[k] !== v),
      );
      if (Object.keys(changed).length === 0) {
        setSaving(false);
        setShowForm(false);
        setEditingId(null);
        setEditing(null);
        return;
      }
      body = { ...changed, expectedUpdatedAt: editing.updatedAt };
    } else {
      body = { staffUserId, ...fields };
    }
    const url = editingId
      ? `${RECORDS_URL}/${encodeURIComponent(editingId)}`
      : RECORDS_URL;
    try {
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(errorMessage(json, "The record was not saved."));
        if (res.status === 409) await load();
        return;
      }
      setShowForm(false);
      setEditingId(null);
      setEditing(null);
      setForm(EMPTY_FORM);
      await load();
    } catch {
      setFormError("The record was not saved. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    const res = await fetch(
      `${RECORDS_URL}/${encodeURIComponent(target.id)}?expectedUpdatedAt=${encodeURIComponent(target.updatedAt)}`,
      { method: "DELETE" },
    ).catch(() => null);
    if (!res || !res.ok) {
      const json = res ? await res.json().catch(() => null) : null;
      setLoadError(errorMessage(json, "The record was not removed."));
      if (res?.status === 409) await load();
      return;
    }
    await load();
  }

  if (loadError && !data) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-300">
        {loadError}
      </p>
    );
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading training records...</p>;
  }
  if (data.noOrganisation) {
    return (
      <p className="text-sm text-muted-foreground">
        The training register belongs to an organisation. Finish setting up
        your business, or ask your employer to invite you, to see it.
      </p>
    );
  }

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {data.canEdit
          ? "Training records for everyone in your organisation."
          : "Your training records. Ask your manager or the business owner to add or correct one."}
      </p>

      {loadError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {loadError}
        </p>
      )}

      {data.canEdit && !showForm && (
        <Button type="button" onClick={startAdd}>
          Add training record
        </Button>
      )}

      {data.canEdit && showForm && (
        <form
          method="post"
          onSubmit={save}
          aria-label={editingId ? "Edit training record" : "Add training record"}
          className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
        >
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="tr-staff">Staff member</Label>
            {!editingId && (
              <div className="flex gap-2">
                <Input
                  aria-label="Find a staff member"
                  placeholder="Find by name or email"
                  value={staffQuery}
                  maxLength={100}
                  onChange={(e) => setStaffQuery(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => void fetchStaff(staffQuery, null)}>
                  Find
                </Button>
              </div>
            )}
            <Select
              value={form.staffUserId}
              onValueChange={(v) => setForm((f) => ({ ...f, staffUserId: v }))}
              disabled={!!editingId}
            >
              <SelectTrigger id="tr-staff" aria-label="Staff member">
                <SelectValue placeholder="Choose a staff member" />
              </SelectTrigger>
              <SelectContent>
                {editingId && editing && (
                  <SelectItem value={editing.staffUserId}>{editing.staffName}</SelectItem>
                )}
                {!editingId &&
                  staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {!editingId && staffCursor && (
              <Button type="button" size="sm" variant="outline" onClick={() => void fetchStaff(staffQuery, staffCursor)}>
                Show more staff
              </Button>
            )}
            {!editingId && staffError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {staffError}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-course">Course</Label>
            <Input id="tr-course" value={form.course} onChange={set("course")} maxLength={200} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-provider">Provider</Label>
            <Input id="tr-provider" value={form.provider} onChange={set("provider")} maxLength={200} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-completed">Completion date</Label>
            <Input id="tr-completed" type="date" value={form.completedOn} onChange={set("completedOn")} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-expires">Expiry date (if any)</Label>
            <Input id="tr-expires" type="date" value={form.expiresOn} onChange={set("expiresOn")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="tr-evidence">Evidence link (optional)</Label>
            <Input id="tr-evidence" type="url" inputMode="url" placeholder="https://" value={form.evidenceUrl} onChange={set("evidenceUrl")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="tr-carsi">CARSI completion link or certificate id (optional)</Label>
            <Input id="tr-carsi" value={form.carsiCompletionRef} onChange={set("carsiCompletionRef")} />
            <p className="text-xs text-muted-foreground">
              Typed in by your business. RestoreAssist does not check it with CARSI.
            </p>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300 sm:col-span-2">
              {formError}
            </p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving || (!editingId && !form.staffUserId)}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Add record"}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setEditing(null); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {data.records.length === 0 ? (
        <p className="text-sm text-muted-foreground">No training recorded yet.</p>
      ) : (
        <ul className="space-y-3" aria-label="Training records">
          {data.records.map((r) => {
            const status = trainingStatus(r.expiresOn, today);
            const evidence = evidenceHref(r.evidenceUrl);
            const carsiHref = carsiCompletionHref(r.carsiCompletionRef);
            return (
              <li key={r.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.course}</p>
                    <p className="text-sm text-muted-foreground">
                      {data.canEdit ? `${r.staffName} · ` : ""}
                      {r.provider}
                    </p>
                  </div>
                  <Badge variant={status === "expired" ? "destructive" : "secondary"}>
                    {STATUS_LABEL[status]}
                  </Badge>
                </div>
                <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="inline text-muted-foreground">Completed: </dt>
                    <dd className="inline">{r.completedOn}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted-foreground">Expires: </dt>
                    <dd className="inline">{r.expiresOn ?? "No expiry"}</dd>
                  </div>
                  {evidence && (
                    <div>
                      <dt className="inline text-muted-foreground">Evidence: </dt>
                      <dd className="inline">
                        <a href={evidence} target="_blank" rel="noopener noreferrer" className="underline">
                          Open evidence
                        </a>
                      </dd>
                    </div>
                  )}
                  {r.carsiCompletionRef && (
                    <div className="sm:col-span-2">
                      <dt className="inline text-muted-foreground">CARSI reference: </dt>
                      <dd className="inline">
                        {carsiHref ? (
                          <a href={carsiHref} target="_blank" rel="noopener noreferrer" className="underline">
                            {r.carsiCompletionRef}
                          </a>
                        ) : (
                          r.carsiCompletionRef
                        )}{" "}
                        <span className="text-xs text-muted-foreground">
                          (entered by the business, not checked with CARSI)
                        </span>
                      </dd>
                    </div>
                  )}
                </dl>
                {data.canEdit && (
                  <div className="mt-3 flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => startEdit(r)}>
                      Edit
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setDeleteTarget(r)}>
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data.nextCursor && (
        <Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? "Loading..." : "Show more records"}
        </Button>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this training record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.course} for ${deleteTarget.staffName} will be removed from the register.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Remove record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
