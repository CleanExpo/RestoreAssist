'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type DragEvent,
} from 'react';
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
const ABOUT_SOFT_MAX = 280;

const DEFAULT_PRIMARY = '#1C2E47';
const DEFAULT_ACCENT = '#8A6B4E';

const PALETTE_PRESETS: Array<{
  name: string;
  primary: string;
  accent: string;
}> = [
  { name: 'Navy bronze', primary: '#1C2E47', accent: '#8A6B4E' },
  { name: 'Claim steel', primary: '#0B1F3A', accent: '#3B6D8C' },
  { name: 'Field oak', primary: '#243528', accent: '#A67C52' },
];

function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!isHexColor(withHash)) return null;
  return withHash.toUpperCase();
}

function contrastOn(hex: string): '#FFFFFF' | '#0B1F3A' {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#FFFFFF';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0B1F3A' : '#FFFFFF';
}

export function BrandCard() {
  const status = useSetupStore((s) => s.sections.branding);
  const org = useSetupStore((s) => s.org);
  const update = useSetupStore((s) => s.updateOrgField);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const primary = org?.primaryColor ?? DEFAULT_PRIMARY;
  const accent = org?.accentColor ?? DEFAULT_ACCENT;
  const about = org?.aboutCopy ?? '';
  const businessName =
    org?.tradingName?.trim() ||
    org?.legalName?.trim() ||
    'Your business';

  const save = useCallback(
    async (
      field: 'primaryColor' | 'accentColor' | 'aboutCopy' | 'logoUrl',
      value: string | null,
    ): Promise<{ ok: boolean; error?: string }> => {
      setSaving((p) => ({ ...p, [field]: true }));
      try {
        return await patchState(field, value);
      } finally {
        setSaving((p) => ({ ...p, [field]: false }));
      }
    },
    [],
  );

  // Logo upload: POST to the existing Cloudinary-backed /api/upload/logo
  // (auth + magic-byte validation server-side), then persist the returned
  // URL into setup state — same PATCH path the other manual fields use.
  const handleLogoUpload = useCallback(
    async (file: File) => {
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
    },
    [save, update],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleLogoUpload(file);
    },
    [handleLogoUpload],
  );

  const applyPreset = (preset: (typeof PALETTE_PRESETS)[number]) => {
    update('primaryColor', preset.primary);
    update('accentColor', preset.accent);
    void save('primaryColor', preset.primary);
    void save('accentColor', preset.accent);
  };

  return (
    <Card className="overflow-hidden border-brand-navy/10 shadow-sm">
      <CardHeader className="space-y-1 border-b border-brand-navy/5 bg-[#F7F9FB] pb-4">
        <CardTitle className="text-brand-navy">Your brand on the page</CardTitle>
        <p className="text-sm text-muted-foreground">
          Set the mark and colours clients see on reports, quotes, and authority forms.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        {status === 'pending' && (
          <p className="text-sm text-muted-foreground">Waiting for your ABN…</p>
        )}

        {status === 'running' && (
          <div className="space-y-4" aria-busy="true">
            <p className="text-sm text-muted-foreground animate-pulse">
              Pulling your logo and brand colours from your website…
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="h-40 rounded-xl bg-muted animate-pulse" />
              <div className="h-40 rounded-xl bg-muted animate-pulse" />
            </div>
          </div>
        )}

        {(status === 'ready' || status === 'manual' || status === 'error') && (
          <div className="space-y-5">
            {status === 'error' && (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
              >
                Something went wrong loading your brand. You can fill it in manually below.
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
              {/* Controls */}
              <div className="space-y-5">
                <section className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-brand-navy">Business logo</h3>
                    <span className="text-[11px] text-muted-foreground">
                      PNG, JPEG, GIF, WebP · max 5MB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setDragging(false);
                    }}
                    onDrop={onDrop}
                    disabled={uploading}
                    aria-label="Upload or replace logo"
                    className={[
                      'group relative flex w-full items-center gap-4 rounded-xl border border-dashed px-4 py-4 text-left transition',
                      'bg-[#F7F9FB] hover:border-brand-navy/40 hover:bg-white',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/30',
                      'disabled:cursor-wait',
                      dragging
                        ? 'border-brand-navy bg-white ring-2 ring-brand-navy/15'
                        : 'border-brand-navy/20',
                      uploading ? 'animate-pulse' : '',
                    ].join(' ')}
                  >
                    <span
                      className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-brand-navy/10 bg-white"
                      style={{
                        backgroundImage: org?.logoUrl
                          ? undefined
                          : `linear-gradient(135deg, ${primary}14, ${accent}22)`,
                      }}
                    >
                      {uploading ? (
                        <span className="px-2 text-center text-[11px] text-muted-foreground">
                          Uploading…
                        </span>
                      ) : org?.logoUrl ? (
                        // Use plain img — Next/Image needs domain config, fine for in-progress setup UI
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={org.logoUrl}
                          alt="Business logo"
                          className="h-full w-full object-contain p-1.5 transition duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <UploadMark className="text-brand-navy/45 transition group-hover:text-brand-navy/70" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-brand-navy">
                        {org?.logoUrl ? 'Replace logo' : 'Drop logo here, or browse'}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        Square or wide marks work best. Transparent PNG keeps letterheads clean.
                      </span>
                      {(saving.logoUrl || uploading) && (
                        <span className="mt-1 block text-xs text-muted-foreground">Saving…</span>
                      )}
                    </span>
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
                  {uploadError && (
                    <p role="alert" className="text-xs text-destructive">
                      {uploadError}
                    </p>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-brand-navy">Colours</h3>
                    <span className="text-[11px] text-muted-foreground">
                      Used on headers and accents
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ColorField
                      label="Primary"
                      hex={primary}
                      saving={saving.primaryColor}
                      onChange={(v) => {
                        update('primaryColor', v);
                        void save('primaryColor', v);
                      }}
                    />
                    <ColorField
                      label="Accent"
                      hex={accent}
                      saving={saving.accentColor}
                      onChange={(v) => {
                        update('accentColor', v);
                        void save('accentColor', v);
                      }}
                    />
                  </div>
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Suggested colour palettes"
                  >
                    {PALETTE_PRESETS.map((preset) => {
                      const active =
                        primary.toUpperCase() === preset.primary.toUpperCase() &&
                        accent.toUpperCase() === preset.accent.toUpperCase();
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => applyPreset(preset)}
                          className={[
                            'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition',
                            active
                              ? 'border-brand-navy bg-brand-navy text-white'
                              : 'border-brand-navy/15 bg-white text-brand-navy hover:border-brand-navy/35',
                          ].join(' ')}
                        >
                          <span className="flex -space-x-1" aria-hidden="true">
                            <span
                              className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                              style={{ backgroundColor: preset.primary }}
                            />
                            <span
                              className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                              style={{ backgroundColor: preset.accent }}
                            />
                          </span>
                          {preset.name}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor="about" className="text-sm font-semibold text-brand-navy">
                      About your business
                    </label>
                    <span
                      className={[
                        'text-[11px] tabular-nums',
                        about.length > ABOUT_SOFT_MAX
                          ? 'text-amber-700'
                          : 'text-muted-foreground',
                      ].join(' ')}
                    >
                      {about.length}/{ABOUT_SOFT_MAX}
                    </span>
                  </div>
                  <textarea
                    id="about"
                    rows={4}
                    value={about}
                    onChange={(e) => update('aboutCopy', e.target.value)}
                    onBlur={(e) => void save('aboutCopy', e.target.value || null)}
                    className="w-full resize-y rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-brand-navy shadow-[inset_0_1px_0_rgba(11,31,58,0.03)] transition placeholder:text-muted-foreground/80 focus:border-brand-navy/35 focus:outline-none focus:ring-2 focus:ring-brand-navy/15"
                    placeholder="A short paragraph about what you do, who you serve, and where."
                  />
                  {saving.aboutCopy && (
                    <span className="text-xs text-muted-foreground">Saving…</span>
                  )}
                </section>
              </div>

              <BrandPreview
                businessName={businessName}
                logoUrl={org?.logoUrl}
                primary={primary}
                accent={accent}
                about={about}
                state={org?.state}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BrandPreview({
  businessName,
  logoUrl,
  primary,
  accent,
  about,
  state,
}: {
  businessName: string;
  logoUrl: string | null | undefined;
  primary: string;
  accent: string;
  about: string;
  state: string | null | undefined;
}) {
  const ink = contrastOn(primary);

  return (
    <aside
      aria-label="Live brand preview"
      className="relative overflow-hidden rounded-2xl border border-brand-navy/10 bg-[#EEF2F5] p-3 sm:p-4"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand-navy/45">
          Client document preview
        </p>
        <span className="text-[11px] text-brand-navy/40">Updates live</span>
      </div>

      <div
        className="overflow-hidden rounded-xl bg-white shadow-[0_18px_40px_-28px_rgba(11,31,58,0.45)] ring-1 ring-black/5 transition-[box-shadow] duration-300"
        style={{
          backgroundImage: `linear-gradient(180deg, ${primary}0A 0%, transparent 42%), linear-gradient(135deg, #ffffff 40%, ${accent}0D 100%)`,
        }}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 transition-colors duration-300"
          style={{ backgroundColor: primary, color: ink }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/95 ring-1 ring-black/5">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
              ) : (
                <span
                  className="text-[10px] font-semibold tracking-wide"
                  style={{ color: primary }}
                >
                  LOGO
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">{businessName}</p>
              <p className="truncate text-[11px] opacity-75">
                Inspection report{state ? ` · ${state}` : ''}
              </p>
            </div>
          </div>
          <span
            className="hidden shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider sm:inline"
            style={{ backgroundColor: accent, color: contrastOn(accent) }}
          >
            Draft
          </span>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="h-2 w-1/3 rounded-full bg-brand-navy/10" />
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-brand-navy/[0.07]" />
            <div className="h-2 w-[92%] rounded-full bg-brand-navy/[0.07]" />
            <div className="h-2 w-[78%] rounded-full bg-brand-navy/[0.07]" />
          </div>

          <div
            className="rounded-lg border px-3 py-2.5 transition-colors duration-300"
            style={{ borderColor: `${accent}55`, backgroundColor: `${accent}12` }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: accent }}
            >
              About
            </p>
            <p className="mt-1 text-xs leading-relaxed text-brand-navy/80">
              {about.trim() ||
                'Your short company story will appear here on client-facing documents.'}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span
              className="h-1.5 w-8 rounded-full transition-colors duration-300"
              style={{ backgroundColor: primary }}
            />
            <span
              className="h-1.5 w-5 rounded-full transition-colors duration-300"
              style={{ backgroundColor: accent }}
            />
            <span className="h-1.5 w-12 rounded-full bg-brand-navy/10" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function ColorField({
  label,
  hex,
  saving,
  onChange,
}: {
  label: string;
  hex: string;
  saving?: boolean;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(hex.toUpperCase());

  useEffect(() => {
    setDraft(hex.toUpperCase());
  }, [hex]);

  const commitDraft = () => {
    const next = normalizeHex(draft);
    if (!next) {
      setDraft(hex.toUpperCase());
      return;
    }
    setDraft(next);
    if (next !== hex.toUpperCase()) onChange(next);
  };

  return (
    <div className="rounded-xl border border-brand-navy/12 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {saving && <span className="text-[10px] text-muted-foreground">Saving…</span>}
      </div>
      <div className="flex items-center gap-2.5">
        <label className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-brand-navy/15 transition hover:ring-brand-navy/35">
          <span className="absolute inset-0" style={{ backgroundColor: hex }} aria-hidden="true" />
          <input
            type="color"
            value={isHexColor(hex) ? hex : DEFAULT_PRIMARY}
            onChange={(e) => {
              const next = e.target.value.toUpperCase();
              setDraft(next);
              onChange(next);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`${label} colour picker`}
          />
        </label>
        <input
          type="text"
          value={draft}
          spellCheck={false}
          autoComplete="off"
          aria-label={`${label} colour hex`}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="h-11 min-w-0 flex-1 rounded-lg border border-brand-navy/12 bg-[#F7F9FB] px-3 font-mono text-xs tracking-wide text-brand-navy focus:border-brand-navy/35 focus:outline-none focus:ring-2 focus:ring-brand-navy/15"
        />
      </div>
    </div>
  );
}

function UploadMark({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
    </svg>
  );
}
