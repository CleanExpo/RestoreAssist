"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidAuMobile, normaliseAuMobile } from "./phone-validator";
import { validateHeadshotFile, squareCropToDataUrl } from "./headshot-utils";

export interface IdentityValues {
  name: string;
  password: string;
  phone: string;
  headshotDataUrl: string;
}

interface Props {
  token: string;
  inviteeEmail: string;
  organizationName: string;
  onContinue: (values: IdentityValues) => void;
}

export function InviteIdentityStep({
  token,
  inviteeEmail,
  organizationName,
  onContinue,
}: Props) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [headshotDataUrl, setHeadshotDataUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleGoogleStart() {
    // Set a signed cookie via the server side so the invite_token survives
    // the OAuth round-trip. The server route at /api/invites/oauth-complete
    // reads this cookie + the active session and finalises the linkage.
    document.cookie = `invite_token=${token}; Path=/; SameSite=Lax; Max-Age=600`;
    void signIn("google", { callbackUrl: "/api/invites/oauth-complete" });
  }

  async function handleHeadshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = validateHeadshotFile(file);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const dataUrl = await squareCropToDataUrl(file);
    setHeadshotDataUrl(dataUrl);
    setError(null);
  }

  function handleContinue() {
    if (!name.trim()) return setError("Please enter your full name");
    if (password.length < 12)
      return setError("Password must be at least 12 characters");
    if (!isValidAuMobile(phone))
      return setError("Enter a 10-digit Australian mobile (04…)");
    if (!headshotDataUrl) return setError("Please add a headshot");
    setError(null);
    onContinue({
      name: name.trim(),
      password,
      phone: normaliseAuMobile(phone),
      headshotDataUrl,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase text-muted-foreground">RestoreAssist</p>
        <h2 className="text-lg font-semibold">You&apos;ve been invited</h2>
        <p className="text-sm text-muted-foreground">
          Joining <strong>{organizationName}</strong> as{" "}
          <strong>{inviteeEmail}</strong>
        </p>
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={handleGoogleStart}
      >
        Continue with Google
      </Button>

      <p className="text-center text-xs text-muted-foreground">— or —</p>

      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Mobile (used for SMS reminders)</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Set a password (min 12 chars)</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="headshot">
          Headshot · used on your evidence photos
        </Label>
        <Input
          id="headshot"
          type="file"
          accept="image/jpeg,image/png"
          capture="user"
          onChange={handleHeadshot}
        />
        {headshotDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headshotDataUrl}
            alt="Headshot preview"
            className="h-20 w-20 rounded-full object-cover"
          />
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="button" className="w-full" onClick={handleContinue}>
        Continue →
      </Button>
    </div>
  );
}
