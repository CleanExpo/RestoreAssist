'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSetupStore } from './store';
import { Cloud, HardDrive } from 'lucide-react';

type Choice = 'drive' | 'onedrive' | 'local';

// TODO(setup-wizard Phase 8+): persist the choice on Organization (new field cloudStorageChoice)
// Today this is UI-only state; activate doesn't require it.
//
// TODO(setup-wizard Phase 8+): Drive OAuth path — no standalone /api/oauth/google-drive/start route
// exists. Drive access is via NextAuth Google sign-in (firebase-based, see app/api/auth/google-signin).
// Replace DRIVE_OAUTH_PATH with the correct redirect once that flow is wired for the setup wizard.
const DRIVE_OAUTH_PATH = '/api/oauth/google-drive/start?return=/setup';

export function StorageCard() {
  const setSectionStatus = useSetupStore((s) => s.setSectionStatus);
  const [choice, setChoice] = useState<Choice | null>(null);

  const pick = (c: Choice) => {
    setChoice(c);
    setSectionStatus('storage', 'ready');
    if (c === 'drive') {
      // Kicks off Drive OAuth in the same tab; user returns to /setup
      window.location.href = DRIVE_OAUTH_PATH;
    }
    // For 'onedrive' the option is disabled so this won't fire
    // For 'local' we just mark the section ready
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud storage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose where your evidence photos live. You can change this later in Settings.
        </p>
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
      </CardContent>
    </Card>
  );
}

function StorageOption({
  label, description, icon, active, disabled, onClick,
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
      aria-label={label}
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
