"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type BusinessForm = {
  businessName: string;
  businessAddress: string;
};

const emptyForm: BusinessForm = { businessName: "", businessAddress: "" };

/**
 * RA-7432 — the onboarding "business_profile" step (required for every paid
 * account) is satisfied only when the user row has BOTH businessName and
 * businessAddress, and its button sends the user to /dashboard/settings. Until
 * this card existed nothing on that page — or anywhere else in the product —
 * wrote the address, so a paid account could never open the report form.
 *
 * Saves only its own two fields; PUT /api/user/profile leaves absent fields
 * alone (see app/api/user/profile/__tests__/put-partial-update.test.ts).
 */
export function BusinessDetailsSetting() {
  const [form, setForm] = useState<BusinessForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/user/profile")
      .then(async (response) => {
        if (!response.ok) throw new Error("Business details could not be loaded");
        return response.json();
      })
      .then(({ profile }) =>
        setForm({
          businessName: profile?.businessName ?? "",
          businessAddress: profile?.businessAddress ?? "",
        }),
      )
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName.trim(),
          businessAddress: form.businessAddress.trim(),
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          result?.error?.message ?? "Business details could not be saved",
        );
      }
      toast.success("Business details saved");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Business details could not be saved",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-5"
      aria-labelledby="business-details-title"
    >
      <div className="mb-4">
        <h2 id="business-details-title" className="font-medium text-white">
          Business details
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Printed on your reports and invoices. Both fields are needed before a
          paid account can generate reports.
        </p>
      </div>
      {loading ? (
        <p role="status" className="text-sm text-slate-400">
          Loading business details…
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="settings-business-name" className="text-sm text-slate-200">
              Business name
            </label>
            <Input
              id="settings-business-name"
              value={form.businessName}
              onChange={(event) =>
                setForm((current) => ({ ...current, businessName: event.target.value }))
              }
              className="border-slate-600 bg-slate-900 text-white"
              autoComplete="organization"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="settings-business-address" className="text-sm text-slate-200">
              Business address
            </label>
            <Input
              id="settings-business-address"
              value={form.businessAddress}
              onChange={(event) =>
                setForm((current) => ({ ...current, businessAddress: event.target.value }))
              }
              className="border-slate-600 bg-slate-900 text-white"
              autoComplete="street-address"
            />
          </div>
          <div className="md:col-span-2 flex justify-end border-t border-slate-700 pt-4">
            <Button type="button" onClick={save} disabled={saving} className="min-h-11">
              {saving ? "Saving…" : "Save business details"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
