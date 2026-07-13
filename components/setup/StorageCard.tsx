'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSetupStore } from './store';
import { Check, Cloud, HardDrive } from 'lucide-react';

type Choice = 'drive' | 'onedrive' | 'local';

type StatusResponse = {
  connected: boolean;
  provider: string | null;
  accountEmail: string | null;
};

const DRIVE_OAUTH_PATH = '/api/oauth/google-drive/start';
const STATUS_PATH = '/api/oauth/google-drive/status';

export function StorageCard() {
  const setSectionStatus = useSetupStore((s) => s.setSectionStatus);
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forceGrid, setForceGrid] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);

  const oauthError = searchParams?.get('error') ?? null;
  const storageFlag = searchParams?.get('storage') ?? null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(STATUS_PATH);
        if (!res.ok) {
          if (!cancelled) setStatus({ connected: false, provider: null, accountEmail: null });
          return;
        }
        const json = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setStatus(json);
        if (json.connected) setSectionStatus('storage', 'ready');
      } catch {
        if (!cancelled) setStatus({ connected: false, provider: null, accountEmail: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // storageFlag in dep array so a return-from-OAuth re-fetches
  }, [setSectionStatus, storageFlag]);

  const pick = (c: Choice) => {
    setChoice(c);
    if (c === 'drive') {
      window.location.href = DRIVE_OAUTH_PATH;
      return;
    }
    if (c === 'local') {
      // UI-only for now; SP-E will persist Organization.storageProvider='LOCAL'
      setSectionStatus('storage', 'ready');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cloud storage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 w-full animate-pulse rounded-md bg-muted/50" />
        </CardContent>
      </Card>
    );
  }

  const showConnected =
    status?.connected && status.provider === 'GOOGLE_DRIVE' && !forceGrid;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud storage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {showConnected ? (
          <div className="flex items-center justify-between rounded-md border border-primary bg-primary/5 p-3">
            <span className="flex items-center gap-2 text-sm">
              <Check className="h-5 w-5 text-primary" aria-hidden="true" />
              <span>
                Connected as <strong>{status?.accountEmail}</strong>
              </span>
            </span>
            <button
              type="button"
              onClick={() => setForceGrid(true)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Switch storage
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Choose where your evidence photos live. You can change this later in Settings.
            </p>
            {oauthError ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
              >
                Could not connect Google Drive: {oauthError}
              </p>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StorageOption
                label="Google Drive"
                description="OAuth into your Drive — we mirror photos to a folder you choose."
                icon={<Cloud className="w-5 h-5" aria-hidden="true" />}
                active={choice === 'drive'}
                onClick={() => pick('drive')}
              />
              <StorageOption
                label="OneDrive"
                description="Coming soon"
                icon={<Cloud className="w-5 h-5" aria-hidden="true" />}
                disabled
              />
              <StorageOption
                label="Keep it local"
                description="No cloud mirror. Photos stay in the app."
                icon={<HardDrive className="w-5 h-5" aria-hidden="true" />}
                active={choice === 'local'}
                onClick={() => pick('local')}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StorageOption({
  label,
  description,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active ? 'true' : undefined}
      aria-disabled={disabled || undefined}
      // When disabled, fold the reason (e.g. "Coming soon") into the accessible
      // name so screen-reader users learn *why* the option is unavailable.
      aria-label={disabled ? `${label} — ${description}` : label}
      className={[
        'rounded-md border p-3 text-left transition flex flex-col gap-2 min-h-[110px]',
        active
          ? 'border-primary bg-primary/5'
          : disabled
            ? 'border-border bg-muted/30 cursor-not-allowed opacity-60'
            : 'border-border hover:border-foreground/40 cursor-pointer',
      ].join(' ')}
    >
      <span className="flex items-center gap-2">
        {icon}
        <span className="font-medium text-sm">{label}</span>
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
