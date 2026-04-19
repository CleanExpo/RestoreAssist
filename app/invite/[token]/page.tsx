"use client";

/**
 * RA-1249 — Dedicated invite acceptance page.
 *
 * /invite/[token]
 *   - Fetches invite preview via GET /api/invites/[token]
 *   - Shows org name + role + invitee email
 *   - User chooses name + password, accepts terms
 *   - POST /api/invites/[token] creates the account and marks the invite used
 *   - Redirects to /login with a success toast
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface InvitePreview {
  email: string;
  role: string;
  roleLabel: string;
  organizationName: string;
  inviterName: string;
  expiresAt: string;
}

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token as string | undefined;

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/invites/${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setPreviewError(data.error ?? "Failed to load invite");
        } else {
          setPreview(data as InvitePreview);
        }
      } catch {
        if (!cancelled) setPreviewError("Could not reach the server");
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    if (password.length < 12) {
      toast.error("Password must be at least 12 characters");
      return;
    }

    if (!acceptedTerms) {
      toast.error(
        "You must accept the Terms of Service and Privacy Policy to continue",
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(token!)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password, acceptedTerms: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to accept invite");
        return;
      }
      toast.success("Account created — signing you in…");
      router.push(
        `/login?email=${encodeURIComponent(data.email ?? preview?.email ?? "")}`,
      );
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPreview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="flex items-center gap-3 text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading invite…
        </div>
      </div>
    );
  }

  if (previewError || !preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {previewError ?? "This invite is no longer available."}
            </AlertDescription>
          </Alert>
          <div className="text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="text-cyan-400 hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl space-y-6">
          <div className="space-y-2 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 text-white mx-auto">
              <CheckCircle2 className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="text-2xl font-semibold text-white">
              You're invited
            </h1>
            <p className="text-sm text-slate-400">
              <strong className="text-slate-200">{preview.inviterName}</strong>{" "}
              has invited you to join{" "}
              <strong className="text-slate-200">
                {preview.organizationName}
              </strong>{" "}
              as a{" "}
              <strong className="text-cyan-400">{preview.roleLabel}</strong>.
            </p>
          </div>

          <div className="rounded-lg bg-slate-800/50 p-3 text-center">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Invitee email
            </div>
            <div className="text-sm font-medium text-slate-100">
              {preview.email}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sarah Thompson"
                required
                autoFocus
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 12 characters"
                required
                minLength={12}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer">
              <Checkbox
                checked={acceptedTerms}
                onCheckedChange={(checked) =>
                  setAcceptedTerms(checked === true)
                }
                className="mt-0.5"
                aria-label="Accept terms and privacy"
              />
              <span>
                I agree to the{" "}
                <Link
                  href="/legal/terms"
                  target="_blank"
                  className="text-cyan-400 hover:underline"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/legal/privacy"
                  target="_blank"
                  className="text-cyan-400 hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            <Button
              type="submit"
              disabled={submitting || !acceptedTerms}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating account…
                </>
              ) : (
                "Accept invite & create account"
              )}
            </Button>
          </form>

          <div className="text-center text-xs text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="text-cyan-400 hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
