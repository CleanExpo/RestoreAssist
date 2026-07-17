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

type OneDriveStatusResponse = {
  connected: boolean;
  accountEmail: string | null;
};

type CatalogEntry = {
  id: string;
  enabled: boolean;
  tagline: string;
};

const DRIVE_OAUTH_PATH = '/api/oauth/google-drive/start';
const ONEDRIVE_OAUTH_PATH = '/api/oauth/microsoft-onedrive/start';
const STATUS_PATH = '/api/oauth/google-drive/status';
const ONEDRIVE_STATUS_PATH = '/api/oauth/microsoft-onedrive/status';

export function StorageCard() {
  const setSectionStatus = useSetupStore((s) => s.setSectionStatus);
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [onedriveStatus, setOnedriveStatus] = useState<OneDriveStatusResponse | null>(null);
  const [onedriveEnabled, setOnedriveEnabled] = useState(false);
  const [onedriveTagline, setOnedriveTagline] = useState('Coming soon');
  const [loading, setLoading] = useState(true);
  const [forceGrid, setForceGrid] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);

  const oauthError = searchParams?.get('error') ?? null;
  const storageFlag = searchParams?.get('storage') ?? null;
  const onedriveFlag = searchParams?.get('onedrive') ?? null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [driveRes, onedriveRes, catalogRes] = await Promise.all([
          fetch(STATUS_PATH),
          fetch(ONEDRIVE_STATUS_PATH),
          fetch('/api/user/cloud-mirror'),
        ]);

        if (cancelled) return;

        const driveJson = driveRes.ok
          ? ((await driveRes.json()) as StatusResponse)
          : { connected: false, provider: null, accountEmail: null };
        setStatus(driveJson);

        const onedriveJson = onedriveRes.ok
          ? ((await onedriveRes.json()) as OneDriveStatusResponse)
          : { connected: false, accountEmail: null };
        setOnedriveStatus(onedriveJson);

        if (catalogRes.ok) {
          const catalog = (await catalogRes.json()) as { catalog?: CatalogEntry[] };
          const onedrive = catalog.catalog?.find((c) => c.id === 'onedrive');
          setOnedriveEnabled(!!onedrive?.enabled);
          if (onedrive?.tagline) setOnedriveTagline(onedrive.tagline);
        }

        if (driveJson.connected || onedriveJson.connected) {
          setSectionStatus('storage', 'ready');
        }
      } catch {
        if (!cancelled) {
          setStatus({ connected: false, provider: null, accountEmail: null });
          setOnedriveStatus({ connected: false, accountEmail: null });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setSectionStatus, storageFlag, onedriveFlag]);

  const pick = (c: Choice) => {
    setChoice(c);
    if (c === 'drive') {
      window.location.href = DRIVE_OAUTH_PATH;
      return;
    }
    if (c === 'onedrive' && onedriveEnabled) {
      window.location.href = ONEDRIVE_OAUTH_PATH;
      return;
    }
    if (c === 'local') {
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

  const driveConnected =
    status?.connected && status.provider === 'GOOGLE_DRIVE';
  const onedriveConnected = onedriveStatus?.connected === true;
  const showConnected = (driveConnected || onedriveConnected) && !forceGrid;
  const connectedEmail = driveConnected
    ? status?.accountEmail
    : onedriveStatus?.accountEmail;

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
                Connected as <strong>{connectedEmail}</strong>
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
                Could not connect storage: {oauthError}
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
                description={
                  onedriveEnabled
                    ? onedriveTagline
                    : 'Coming soon — requires Microsoft OAuth configuration'
                }
                icon={<Cloud className="w-5 h-5" aria-hidden="true" />}
                active={choice === 'onedrive'}
                disabled={!onedriveEnabled}
                onClick={() => pick('onedrive')}
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
