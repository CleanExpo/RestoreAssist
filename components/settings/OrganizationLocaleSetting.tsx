"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_ORGANIZATION_TIMEZONE,
  ORGANIZATION_TIMEZONES,
} from "@/lib/locale/organization-locale";
import { getGstTreatment, type Country } from "@/lib/gst-rules";

type LocaleForm = {
  country: Country;
  timezone: string;
  abn: string;
  acn: string;
  nzbn: string;
};

const initialForm: LocaleForm = {
  country: "AU",
  timezone: DEFAULT_ORGANIZATION_TIMEZONE.AU,
  abn: "",
  acn: "",
  nzbn: "",
};

export function OrganizationLocaleSetting() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const treatment = getGstTreatment(form.country);

  useEffect(() => {
    fetch("/api/organization/locale")
      .then(async (response) => {
        if (!response.ok) throw new Error("Locale settings could not be loaded");
        return response.json();
      })
      .then(({ data }) =>
        setForm({
          country: data.country,
          timezone: data.timezone,
          abn: data.abn ?? "",
          acn: data.acn ?? "",
          nzbn: data.nzbn ?? "",
        }),
      )
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, []);

  const chooseCountry = (country: Country) =>
    setForm((current) => ({
      ...current,
      country,
      timezone: DEFAULT_ORGANIZATION_TIMEZONE[country],
      abn: country === "AU" ? current.abn : "",
      acn: country === "AU" ? current.acn : "",
      nzbn: country === "NZ" ? current.nzbn : "",
    }));

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/organization/locale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error?.message ?? "Locale settings could not be saved");
      }
      toast.success("Organisation locale saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Locale settings could not be saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-5" aria-labelledby="organisation-locale-title">
      <div className="mb-4">
        <h2 id="organisation-locale-title" className="font-medium text-white">
          Organisation locale and tax
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Controls currency, GST, dates and accounting exports across RestoreAssist.
        </p>
      </div>
      {loading ? (
        <p role="status" className="text-sm text-slate-400">Loading locale settings…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="settings-country" className="text-sm text-slate-200">Country</label>
            <select id="settings-country" value={form.country} onChange={(event) => chooseCountry(event.target.value as Country)} className="min-h-11 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white">
              <option value="AU">Australia</option>
              <option value="NZ">New Zealand</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="settings-timezone" className="text-sm text-slate-200">Timezone</label>
            <select id="settings-timezone" value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} className="min-h-11 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white">
              {ORGANIZATION_TIMEZONES[form.country].map((timezone) => <option key={timezone}>{timezone}</option>)}
            </select>
          </div>
          {form.country === "AU" ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="settings-abn" className="text-sm text-slate-200">ABN</label>
                <Input id="settings-abn" value={form.abn} onChange={(event) => setForm((current) => ({ ...current, abn: event.target.value }))} className="border-slate-600 bg-slate-900 text-white" inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="settings-acn" className="text-sm text-slate-200">ACN (optional)</label>
                <Input id="settings-acn" value={form.acn} onChange={(event) => setForm((current) => ({ ...current, acn: event.target.value }))} className="border-slate-600 bg-slate-900 text-white" inputMode="numeric" />
              </div>
            </>
          ) : (
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="settings-nzbn" className="text-sm text-slate-200">NZBN</label>
              <Input id="settings-nzbn" value={form.nzbn} onChange={(event) => setForm((current) => ({ ...current, nzbn: event.target.value }))} className="border-slate-600 bg-slate-900 text-white" inputMode="numeric" />
            </div>
          )}
          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4">
            <p className="text-sm text-slate-300">
              Billing: {treatment.currency} · GST {treatment.percentLabel}
            </p>
            <Button type="button" onClick={save} disabled={saving} className="min-h-11">
              {saving ? "Saving…" : "Save locale"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
