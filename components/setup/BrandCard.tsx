'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSetupStore } from './store';

async function patchState(
  field: string,
  value: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/setup/state', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  });
  if (!res.ok) {
    // PATCH /api/setup/state responds via `apiError` — nested `{ error: { message } }`
    const body = await res.json().catch(() => null);
    return { ok: false, error: body?.error?.message ?? `Request failed (${res.status})` };
  }
  return { ok: true };
}

// Must mirror /api/upload/logo server-side limits — it rejects anything else
// (magic-byte validated; SVG is deliberately unsupported).
const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export function BrandCard() {
  const status = useSetupStore((s) => s.sections.branding);
  const org = useSetupStore((s) => s.org);
  const update = useSetupStore((s) => s.updateOrgField);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const save = async (
    field: 'primaryColor' | 'accentColor' | 'aboutCopy' | 'logoUrl',
    value: string | null,
  ): Promise<{ ok: boolean; error?: string }> => {
    setSaving((p) => ({ ...p, [field]: true }));
    try {
      return await patchState(field, value);
    } finally {
      setSaving((p) => ({ ...p, [field]: false }));
    }
  };

  // Logo upload: POST to the existing Cloudinary-backed /api/upload/logo
  // (auth + magic-byte validation server-side), then persist the returned
  // URL into setup state — same PATCH path the other manual fields use.
  const handleLogoUpload = async (file: File) => {
    setUploadError(null);
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setUploadError('Please choose a PNG, JPEG, GIF, or WebP image.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setUploadError('Logo must be 5MB or smaller.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/logo', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok || typeof body?.url !== 'string') {
        // /api/upload/logo errors via `apiError` — nested `{ error: { message } }`
        setUploadError(body?.error?.message ?? `Upload failed (${res.status})`);
        return;
      }
      update('logoUrl', body.url);
      const persisted = await save('logoUrl', body.url);
      if (!persisted.ok) {
        setUploadError(persisted.error ?? 'Logo uploaded but could not be saved — try again.');
      }
    } catch {
      setUploadError('Network error — check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your brand</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'pending' && (
          <p className="text-sm text-muted-foreground">Waiting for your ABN…</p>
        )}

        {status === 'running' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground animate-pulse">
              Pulling your logo and brand colours from your website…
            </p>
            <div className="flex gap-3 items-start">
              <div className="w-24 h-24 bg-muted rounded animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
              </div>
            </div>
          </div>
        )}

        {(status === 'ready' || status === 'manual' || status === 'error') && (
          <div className="space-y-4">
            {status === 'error' && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                Something went wrong loading your brand. You can fill it in manually below.
              </div>
            )}
            <div className="flex gap-4 items-start">
              {/* Logo */}
              <div className="flex flex-col gap-2 items-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label="Upload or replace logo"
                  className={`w-24 h-24 rounded-md bg-muted overflow-hidden border border-border hover:border-foreground/50 transition cursor-pointer flex items-center justify-center disabled:cursor-wait ${uploading ? 'animate-pulse' : ''}`}
                >
                  {uploading ? (
                    <span className="text-xs text-muted-foreground text-center px-2">Uploading…</span>
                  ) : org?.logoUrl ? (
                    // Use plain img — Next/Image needs domain config, fine for in-progress dev UI
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={org.logoUrl} alt="Business logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground text-center px-2">Click to upload</span>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_LOGO_TYPES.join(',')}
                  aria-label="Logo file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Reset so re-selecting the same file re-fires onChange (e.g. retry after error)
                    e.target.value = '';
                    if (file) void handleLogoUpload(file);
                  }}
                  className="sr-only"
                />
                {saving.logoUrl && <span className="text-xs text-muted-foreground">Saving…</span>}
                {uploadError && (
                  <p role="alert" className="text-xs text-destructive max-w-[12rem] text-center">
                    {uploadError}
                  </p>
                )}
              </div>

              {/* Colours */}
              <div className="flex-1 space-y-3">
                <div className="flex gap-3">
                  <ColorSwatch
                    label="Primary"
                    hex={org?.primaryColor ?? '#1C2E47'}
                    saving={saving.primaryColor}
                    onChange={(v) => {
                      update('primaryColor', v);
                      void save('primaryColor', v);
                    }}
                  />
                  <ColorSwatch
                    label="Accent"
                    hex={org?.accentColor ?? '#8A6B4E'}
                    saving={saving.accentColor}
                    onChange={(v) => {
                      update('accentColor', v);
                      void save('accentColor', v);
                    }}
                  />
                </div>

                {/* About copy */}
                <div className="space-y-1">
                  <label htmlFor="about" className="text-xs font-medium text-muted-foreground">
                    About your business
                  </label>
                  <textarea
                    id="about"
                    rows={3}
                    value={org?.aboutCopy ?? ''}
                    onChange={(e) => update('aboutCopy', e.target.value)}
                    onBlur={(e) => void save('aboutCopy', e.target.value || null)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="A short paragraph about what you do, who you serve, and where."
                  />
                  {saving.aboutCopy && <span className="text-xs text-muted-foreground">Saving…</span>}
                </div>
              </div>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}

function ColorSwatch({
  label, hex, saving, onChange,
}: {
  label: string;
  hex: string;
  saving?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col items-start gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-16 rounded cursor-pointer border border-border"
        aria-label={`${label} colour picker`}
      />
      <span className="font-mono text-[10px] text-muted-foreground">{hex}{saving ? ' (saving…)' : ''}</span>
    </label>
  );
}
