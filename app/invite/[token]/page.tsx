"use client";

/**
 * RA-1249 / RA-2998 — Dedicated invite acceptance page.
 *
 * /invite/[token]
 *   - Fetches invite preview via GET /api/invites/[token]
 *   - Step 1 (identity): credentials path collects name/password/phone/headshot,
 *     or Google path sets an invite_token cookie and dispatches signIn("google").
 *   - Step 2 (terms): user accepts ToS + chain-of-custody, POSTs to
 *     /api/invites/[token]. On success, credentials path signs the user in via
 *     NextAuth and lands on /dashboard?firstRun=tech.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  InviteIdentityStep,
  type IdentityValues,
} from "@/components/invite/InviteIdentityStep";
import { InviteTermsStep } from "@/components/invite/InviteTermsStep";

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = params?.token as string | undefined;

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const initialStep = searchParams?.get("step") === "2" ? "terms" : "identity";
  const [step, setStep] = useState<"identity" | "terms">(initialStep);
  const [identity, setIdentity] = useState<IdentityValues | null>(null);
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

  if (previewError || !preview || !token) {
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

  function handleIdentityContinue(values: IdentityValues) {
    setIdentity(values);
    setStep("terms");
  }

  async function handleSubmit(values: {
    acceptedTerms: boolean;
    acceptedChainOfCustody: boolean;
  }) {
    if (!preview || !token) return;
    setSubmitting(true);
    try {
      const body = identity
        ? {
            name: identity.name,
            password: identity.password,
            phone: identity.phone,
            headshotDataUrl: identity.headshotDataUrl,
            acceptedTerms: values.acceptedTerms,
            acceptedChainOfCustody: values.acceptedChainOfCustody,
          }
        : {
            provider: "google" as const,
            name: preview.email.split("@")[0],
            phone: "",
            headshotDataUrl: "",
            acceptedTerms: values.acceptedTerms,
            acceptedChainOfCustody: values.acceptedChainOfCustody,
          };

      const res = await fetch(`/api/invites/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to accept invite");
        return;
      }

      if (identity) {
        const signInResult = await signIn("credentials", {
          email: preview.email,
          password: identity.password,
          redirect: false,
        });
        if (signInResult?.error) {
          toast.error("Account created — sign-in failed. Please sign in.");
          router.push("/login");
          return;
        }
      }
      router.push("/dashboard?firstRun=tech");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8 shadow-xl">
          {step === "identity" ? (
            <InviteIdentityStep
              token={token}
              inviteeEmail={preview.email}
              organizationName={preview.organizationName}
              onContinue={handleIdentityContinue}
            />
          ) : (
            <InviteTermsStep
              organizationName={preview.organizationName}
              inviterName={preview.inviterName}
              roleLabel={preview.roleLabel}
              submitting={submitting}
              onSubmit={handleSubmit}
            />
          )}

          <div className="mt-6 text-center text-xs text-slate-500">
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
