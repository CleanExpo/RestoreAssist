"use client";

/**
 * RA-8495 (DRC S2) — the office logs a job. The organisation's next job
 * number is issued on save; the number shown before saving is an estimate.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CLIENT_TYPES = [
  { value: "BUILDER", label: "Builder" },
  { value: "LOSS_ADJUSTER", label: "Loss adjuster" },
  { value: "CLIENT", label: "Client" },
  { value: "INSURANCE_COMPANY", label: "Insurance company" },
  { value: "OTHER", label: "Other" },
] as const;

const CLAIM_TYPES = [
  { value: "WATER", label: "Water" },
  { value: "FIRE", label: "Fire" },
  { value: "MOULD", label: "Mould" },
  { value: "STORM", label: "Storm" },
  { value: "CONTENTS", label: "Contents" },
  { value: "BIOHAZARD", label: "Biohazard" },
  { value: "ODOUR", label: "Odour" },
  { value: "CARPET", label: "Carpet" },
  { value: "HVAC", label: "HVAC" },
  { value: "ASBESTOS", label: "Asbestos" },
] as const;

type FormState = {
  propertyAddress: string;
  propertyPostcode: string;
  policyNumber: string;
  claimNumber: string;
  clientType: string;
  insuredName: string;
  insuredPhone: string;
  insuredEmail: string;
  claimType: string;
  officeNotes: string;
};

const EMPTY: FormState = {
  propertyAddress: "",
  propertyPostcode: "",
  policyNumber: "",
  claimNumber: "",
  clientType: "",
  insuredName: "",
  insuredPhone: "",
  insuredEmail: "",
  claimType: "",
  officeNotes: "",
};

type Settings = { prefix: string; derived: boolean; nextJobNumber: string; canEditPrefix: boolean };
type Saved = { id: string; jobNumber: string; makeSafeSeeded: boolean };

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function OfficeIntakePage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [prefixDraft, setPrefixDraft] = useState("");
  const [prefixMessage, setPrefixMessage] = useState<string | null>(null);
  // One key per form: every retry of this form reuses it, so a double click
  // or a resubmit after a timeout returns the same job and the same number.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => newKey());

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/inspections/intake/settings", { cache: "no-store" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.error?.code === "NO_ORGANISATION") {
          setError("Your account is not part of an organisation, so jobs cannot be numbered yet.");
        }
        return;
      }
      const json = (await res.json()) as Settings;
      setSettings(json);
      setPrefixDraft(json.prefix);
    } catch {
      // The preview is a convenience; the save still works without it.
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const update = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setFieldErrors((fe) => {
      if (!fe[key]) return fe;
      const next = { ...fe };
      delete next[key];
      return next;
    });
  };

  const canSave = useMemo(
    () =>
      !saving &&
      form.propertyAddress.trim() !== "" &&
      form.propertyPostcode.trim() !== "" &&
      form.clientType !== "" &&
      form.claimType !== "",
    [form, saving],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/inspections/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 201 && json?.inspection?.jobNumber) {
        setSaved({
          id: json.inspection.id,
          jobNumber: json.inspection.jobNumber,
          makeSafeSeeded: json.makeSafeSeeded !== false,
        });
        setForm(EMPTY);
        setIdempotencyKey(newKey());
        void loadSettings();
        return;
      }
      if (json?.error?.fields) setFieldErrors(json.error.fields);
      setError(json?.error?.message ?? "The job could not be saved. Please try again.");
    } catch {
      setError("The job could not be saved. Check your connection and press Save again.");
    } finally {
      setSaving(false);
    }
  }

  async function savePrefix() {
    setPrefixMessage(null);
    const res = await fetch("/api/inspections/intake/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: prefixDraft }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json) {
      setSettings(json as Settings);
      setPrefixDraft((json as Settings).prefix);
      setPrefixMessage("Prefix saved. Numbering continues from the current count.");
    } else {
      setPrefixMessage(json?.error?.message ?? "The prefix could not be saved.");
    }
  }

  const fieldError = (key: keyof FormState) =>
    fieldErrors[key] ? (
      <p id={`${key}-error`} className="text-sm text-destructive">
        {fieldErrors[key]}
      </p>
    ) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/inspections"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Jobs
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Log a job</h1>
        <p className="text-sm text-muted-foreground">
          {settings
            ? `The next job number will be about ${settings.nextJobNumber}. The number is issued when you save.`
            : "A job number is issued when you save."}
        </p>
      </div>

      {saved && (
        <div role="status" className="flex items-start gap-3 rounded-lg border p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">Job {saved.jobNumber} logged.</p>
            {!saved.makeSafeSeeded && (
              <p className="text-sm text-muted-foreground">
                The make-safe checklist did not set up. Open the job and check it before submitting.
              </p>
            )}
            <Link href={`/dashboard/inspections/${saved.id}`} className="text-sm underline">
              Open job {saved.jobNumber}
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-destructive p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="propertyAddress">Job address</Label>
            <Input id="propertyAddress" value={form.propertyAddress} onChange={update("propertyAddress")} autoComplete="street-address" required aria-invalid={!!fieldErrors.propertyAddress} />
            {fieldError("propertyAddress")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="propertyPostcode">Postcode</Label>
            <Input id="propertyPostcode" value={form.propertyPostcode} onChange={update("propertyPostcode")} inputMode="numeric" maxLength={4} required aria-invalid={!!fieldErrors.propertyPostcode} />
            {fieldError("propertyPostcode")}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="clientType">Client type</Label>
            <select id="clientType" className={selectClass} value={form.clientType} onChange={update("clientType")} required aria-invalid={!!fieldErrors.clientType}>
              <option value="">Choose...</option>
              {CLIENT_TYPES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {fieldError("clientType")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="claimType">Claim type</Label>
            <select id="claimType" className={selectClass} value={form.claimType} onChange={update("claimType")} required aria-invalid={!!fieldErrors.claimType}>
              <option value="">Choose...</option>
              {CLAIM_TYPES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {fieldError("claimType")}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="policyNumber">Policy number (optional)</Label>
            <Input id="policyNumber" value={form.policyNumber} onChange={update("policyNumber")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="claimNumber">Insurer claim number (optional)</Label>
            <Input id="claimNumber" value={form.claimNumber} onChange={update("claimNumber")} />
          </div>
        </div>

        <fieldset className="space-y-4">
          <legend className="text-sm font-medium">Insured</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="insuredName">Name (optional)</Label>
              <Input id="insuredName" value={form.insuredName} onChange={update("insuredName")} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insuredPhone">Phone (optional)</Label>
              <Input id="insuredPhone" type="tel" value={form.insuredPhone} onChange={update("insuredPhone")} autoComplete="off" aria-invalid={!!fieldErrors.insuredPhone} />
              {fieldError("insuredPhone")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insuredEmail">Email (optional)</Label>
              <Input id="insuredEmail" type="email" value={form.insuredEmail} onChange={update("insuredEmail")} autoComplete="off" aria-invalid={!!fieldErrors.insuredEmail} />
              {fieldError("insuredEmail")}
            </div>
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="officeNotes">General notes</Label>
          <Textarea id="officeNotes" rows={4} value={form.officeNotes} onChange={update("officeNotes")} aria-describedby="officeNotes-hint" />
          <p id="officeNotes-hint" className="text-xs text-muted-foreground">
            Access, contacts and instructions. Do not enter card numbers or health details.
          </p>
        </div>

        <Button type="submit" disabled={!canSave}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {saving ? "Saving" : "Save job"}
        </Button>
      </form>

      {settings?.canEditPrefix && (
        <section className="space-y-2 rounded-lg border p-4" aria-labelledby="prefix-heading">
          <h2 id="prefix-heading" className="text-sm font-medium">Job number prefix</h2>
          <p className="text-xs text-muted-foreground">
            Changing the prefix does not restart the count.
          </p>
          <div className="flex gap-2">
            <Label htmlFor="prefix" className="sr-only">Prefix</Label>
            <Input id="prefix" value={prefixDraft} onChange={(e) => setPrefixDraft(e.target.value.toUpperCase())} maxLength={10} className="max-w-[10rem]" />
            <Button type="button" variant="outline" onClick={savePrefix}>Save prefix</Button>
          </div>
          {prefixMessage && <p className="text-xs" role="status">{prefixMessage}</p>}
        </section>
      )}
    </div>
  );
}
