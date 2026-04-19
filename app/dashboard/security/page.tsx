"use client";

/**
 * RA-1260 — Dashboard → Security (2FA setup)
 *
 * Phase 1: users can enable/disable 2FA here. The NextAuth login flow
 * will start enforcing the code prompt in Phase 2 (separate PR) to
 * keep the blast radius of this change contained.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Shield, ShieldCheck, Copy, Check } from "lucide-react";
import toast from "react-hot-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SetupResponse {
  otpauthUrl: string;
  qrDataUrl: string;
  manualEntryKey: string;
}

interface ProfileResponse {
  profile?: { twoFactorEnabled?: boolean };
}

export default function SecurityPage() {
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [startingSetup, setStartingSetup] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [disablePassword, setDisablePassword] = useState("");
  const [disabling, setDisabling] = useState(false);

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/user/profile");
        if (res.ok) {
          const data = (await res.json()) as ProfileResponse;
          setTwoFactorEnabled(data.profile?.twoFactorEnabled === true);
        }
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, []);

  const handleStartSetup = async () => {
    setStartingSetup(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to start 2FA setup");
        return;
      }
      setSetupData(data as SetupResponse);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setStartingSetup(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(verifyCode)) {
      toast.error("Enter the 6-digit code from your authenticator");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Verification failed");
        return;
      }
      toast.success("Two-factor authentication enabled");
      setTwoFactorEnabled(true);
      setSetupData(null);
      setVerifyCode("");
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) {
      toast.error("Enter your current password");
      return;
    }
    setDisabling(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: disablePassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to disable 2FA");
        return;
      }
      toast.success("Two-factor authentication disabled");
      setTwoFactorEnabled(false);
      setDisablePassword("");
    } finally {
      setDisabling(false);
    }
  };

  const handleCopyKey = async () => {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.manualEntryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield className="h-6 w-6 text-cyan-400" aria-hidden />
          Security
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Keep your account safe with two-factor authentication.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              {twoFactorEnabled ? (
                <>
                  <ShieldCheck
                    className="h-5 w-5 text-emerald-400"
                    aria-hidden
                  />
                  Two-factor authentication is on
                </>
              ) : (
                <>
                  <Shield className="h-5 w-5 text-slate-400" aria-hidden />
                  Two-factor authentication is off
                </>
              )}
            </h2>
            <p className="text-sm text-slate-400">
              When enabled, signing in will require a 6-digit code from your
              authenticator app in addition to your password.
            </p>
          </div>
        </div>

        {!twoFactorEnabled && !setupData && (
          <Button
            onClick={handleStartSetup}
            disabled={startingSetup}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700"
          >
            {startingSetup ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing…
              </>
            ) : (
              "Set up 2FA"
            )}
          </Button>
        )}

        {!twoFactorEnabled && setupData && (
          <div className="space-y-4 rounded-lg bg-slate-800/50 p-4">
            <div className="space-y-2">
              <p className="text-sm text-slate-300">
                <strong>Step 1.</strong> Scan this QR with Google Authenticator,
                1Password, Authy, or similar:
              </p>
              <div className="bg-white p-3 rounded-lg inline-block">
                <Image
                  src={setupData.qrDataUrl}
                  alt="2FA QR code"
                  width={192}
                  height={192}
                  unoptimized
                />
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <p>Can't scan? Enter this key manually:</p>
                <div className="flex items-center gap-2">
                  <code className="bg-slate-900 px-2 py-1 rounded text-slate-200 font-mono text-xs">
                    {setupData.manualEntryKey}
                  </code>
                  <button
                    onClick={handleCopyKey}
                    className="text-cyan-400 hover:text-cyan-300"
                    aria-label="Copy key"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={handleVerify} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="verifyCode">
                  <strong>Step 2.</strong> Enter the 6-digit code the app shows:
                </Label>
                <Input
                  id="verifyCode"
                  value={verifyCode}
                  onChange={(e) =>
                    setVerifyCode(e.target.value.replace(/\s/g, ""))
                  }
                  placeholder="123 456"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={verifying}
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />{" "}
                      Verifying…
                    </>
                  ) : (
                    "Verify & turn on"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSetupData(null);
                    setVerifyCode("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {twoFactorEnabled && (
          <form onSubmit={handleDisable} className="space-y-3">
            <Alert>
              <AlertDescription className="text-sm">
                To turn 2FA off, confirm your current password. Losing your
                authenticator device will lock you out until you disable 2FA, so
                keep one recovery method handy (we'll add backup codes in a
                future update).
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="disablePassword">Current password</Label>
              <Input
                id="disablePassword"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" variant="destructive" disabled={disabling}>
              {disabling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Disabling…
                </>
              ) : (
                "Disable 2FA"
              )}
            </Button>
          </form>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Phase 1: setup and management are live here. Login-time enforcement
        (prompting for the code when you sign in) will roll out in a follow-up
        release. Tracked under RA-1260.
      </p>
    </div>
  );
}
