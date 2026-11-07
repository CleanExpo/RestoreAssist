"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAID_BASE_PLAN_UPGRADE_HREF } from "@/lib/billing/paid-base-plan-copy";

type ProfileForm = {
  legalName: string;
  tradingName: string;
  state: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
};

const ACCEPTED_LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

export function OrganizationProfileSetting() {
  const [form, setForm] = useState<ProfileForm>({
    legalName: "",
    tradingName: "",
    state: "",
    logoUrl: null,
    primaryColor: "#1C2E47",
    accentColor: "#8A6B4E",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/organization/profile")
      .then(async (res) => {
        if (!res.ok) throw new Error("Organisation profile could not be loaded");
        return res.json();
      })
      .then(({ data }) => {
        setForm({
          legalName: data?.legalName ?? "",
          tradingName: data?.tradingName ?? "",
          state: data?.state ?? "",
          logoUrl: data?.logoUrl ?? null,
          primaryColor: data?.primaryColor ?? "#1C2E47",
          accentColor: data?.accentColor ?? "#8A6B4E",
        });
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Organisation profile could not be loaded",
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/organization/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error?.message ?? "Could not save organisation profile");
      }
      toast.success("Organisation profile saved");
      setForm((prev) => ({ ...prev, ...body.data }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save organisation profile",
      );
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      toast.error("Logo must be PNG, JPEG, GIF or WebP");
      return;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/upload/logo", { method: "POST", body: data });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Logo upload failed");
      }
      const logoUrl = json?.url ?? json?.data?.url ?? json?.secure_url;
      if (!logoUrl) throw new Error("Logo upload returned no URL");
      const patch = await fetch("/api/organization/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl }),
      });
      const patchBody = await patch.json().catch(() => null);
      if (!patch.ok) {
        throw new Error(patchBody?.error?.message ?? "Could not save logo on organisation");
      }
      setForm((prev) => ({ ...prev, logoUrl }));
      toast.success("Logo updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Logo upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section
      id="organisation-profile"
      className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-5 scroll-mt-24"
      aria-labelledby="organisation-profile-title"
    >
      <div className="mb-4">
        <h2 id="organisation-profile-title" className="font-medium text-white">
          Organisation profile
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Legal name, region and branding printed on PDFs after setup. ABN and NZBN
          sit in{" "}
          <a href="#organisation-locale-title" className="text-cyan-400 hover:underline">
            Organisation locale
          </a>
          .
        </p>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-slate-400">
          Loading organisation profile…
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="org-legal-name" className="text-sm text-slate-200">
                Legal name
              </label>
              <Input
                id="org-legal-name"
                value={form.legalName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, legalName: e.target.value }))
                }
                className="border-slate-600 bg-slate-900 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="org-trading-name" className="text-sm text-slate-200">
                Trading name (optional)
              </label>
              <Input
                id="org-trading-name"
                value={form.tradingName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tradingName: e.target.value }))
                }
                className="border-slate-600 bg-slate-900 text-white"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="org-state" className="text-sm text-slate-200">
                State / region
              </label>
              <Input
                id="org-state"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                className="border-slate-600 bg-slate-900 text-white"
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-700 pt-4">
            <h3 className="text-sm font-medium text-slate-200">Logo and colours</h3>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-600 bg-slate-900"
              >
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.logoUrl}
                    alt="Organisation logo"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <span className="text-xs text-slate-400">Add logo</span>
                )}
              </button>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-11"
                >
                  {uploading ? "Uploading…" : form.logoUrl ? "Replace logo" : "Upload logo"}
                </Button>
                <p className="text-xs text-slate-500">PNG/JPEG/GIF/WebP, max 5MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_LOGO_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadLogo(file);
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="org-primary" className="text-sm text-slate-200">
                  Primary colour
                </label>
                <Input
                  id="org-primary"
                  value={form.primaryColor}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, primaryColor: e.target.value }))
                  }
                  className="border-slate-600 bg-slate-900 text-white font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="org-accent" className="text-sm text-slate-200">
                  Accent colour
                </label>
                <Input
                  id="org-accent"
                  value={form.accentColor}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, accentColor: e.target.value }))
                  }
                  className="border-slate-600 bg-slate-900 text-white font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4">
            <p className="text-xs text-slate-500">
              Trial accounts use Basic reports only.{" "}
              <Link href={PAID_BASE_PLAN_UPGRADE_HREF} className="text-cyan-400 hover:underline">
                Upgrade
              </Link>{" "}
              for Enhanced, Optimised and PDF import.
            </p>
            <Button type="button" onClick={saveProfile} disabled={saving} className="min-h-11">
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
