"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  PenLine,
  CheckCircle,
  Loader2,
  AlertCircle,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error-message";
import { EngagementLicenceModal } from "@/components/attestation/EngagementLicenceModal";

interface Props {
  inspectionId: string;
  inspectionNumber: string;
  signedAt?: Date | string | null;
  signedByName?: string | null;
  onSigned?: (signedAt: Date, signedByName: string) => void;
}

type SignOffState = "initial" | "modal" | "form-unlocked" | "submitted";

export default function InspectionSignOff({
  inspectionId,
  inspectionNumber,
  signedAt: initialSignedAt,
  signedByName: initialSignedByName,
  onSigned,
}: Props) {
  const { data: session } = useSession();
  const [signatoryName, setSignatoryName] = useState("");
  const [role, setRole] = useState("Lead Technician");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<Date | null>(
    initialSignedAt ? new Date(initialSignedAt) : null,
  );
  const [signedByName, setSignedByName] = useState<string | null>(
    initialSignedByName ?? null,
  );
  // T13: EngagementLicenceModal gate — rule 28 requires per-engagement
  // verification of IICRC/WHS/state licence before evidence sign-off.
  // Seam D (Task 7-3): collapsed `licenceModalOpen` into `signOffState`
  // so the component is modal-first rather than form-first.
  const [signOffState, setSignOffState] = useState<SignOffState>(
    initialSignedAt ? "submitted" : "initial",
  );

  // Sync signatoryName with session.user.name once session is hydrated.
  useEffect(() => {
    if (!signatoryName && session?.user?.name) {
      setSignatoryName(session.user.name);
    }
  }, [session?.user?.name, signatoryName]);

  // On mount in `initial`, probe for a recent Authorisation (90-day freshness).
  // If fresh, skip the modal and jump straight to `form-unlocked`.
  useEffect(() => {
    if (signOffState !== "initial") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/authorisations/most-recent");
        const data = await res.json().catch(() => ({ row: null }));
        if (cancelled) return;
        const verifiedAt = data?.row?.verifiedAt;
        const ageOk =
          verifiedAt &&
          Date.now() - new Date(verifiedAt).getTime() <
            90 * 24 * 60 * 60 * 1000;
        if (ageOk) {
          setSignOffState("form-unlocked");
        }
      } catch {
        // network failure → stay in `initial`; user can still trigger the modal
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (signOffState === "submitted" && signedAt) {
    return (
      <div className="p-4 rounded-xl border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-950/20">
        <div className="flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-success mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-success">
              Inspection Signed Off
            </p>
            <p className="text-sm text-success mt-0.5">
              Signed by <strong>{signedByName}</strong> on{" "}
              {signedAt.toLocaleString("en-AU", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="text-xs text-success mt-1">
              Valid under the Australian Electronic Transactions Act 1999
            </p>
          </div>
        </div>
      </div>
    );
  }

  const performSubmit = async () => {
    if (!signatoryName.trim()) {
      setError("Please enter your full name");
      return;
    }
    if (!confirmed) {
      setError("Please confirm you have authority to sign this inspection");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/inspections/${inspectionId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatoryName: signatoryName.trim(),
          role: role.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(apiErrorMessage(data) ?? "Failed to sign inspection");
        return;
      }

      const newSignedAt = new Date(data.signedAt);
      setSignedAt(newSignedAt);
      setSignedByName(data.signedByName);
      setSignOffState("submitted");
      onSigned?.(newSignedAt, data.signedByName);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartSignOff = () => {
    // T13: USER-role technicians must verify engagement-time credentials
    // (rule 28). ADMIN/MANAGER act on behalf of subjects, so skip the gate.
    if (session?.user?.role !== "USER") {
      setSignOffState("form-unlocked");
      return;
    }
    setSignOffState("modal");
  };

  const isInitial = signOffState === "initial";
  const isModal = signOffState === "modal";
  const isFormUnlocked = signOffState === "form-unlocked";

  return (
    <>
      <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 space-y-4">
        <div className="flex items-center gap-2">
          <PenLine className="h-5 w-5 text-cyan-500" />
          <h3 className="font-semibold text-neutral-900 dark:text-white">
            Sign Off Inspection
          </h3>
        </div>

        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            By signing, you certify that inspection{" "}
            <strong>{inspectionNumber}</strong> is complete and accurate to the
            best of your knowledge.
          </p>
        </div>

        {isFormUnlocked && (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="signatoryName"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Full name <span className="text-destructive">*</span>
              </label>
              <input
                id="signatoryName"
                type="text"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                placeholder="e.g. John Smith"
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label
                htmlFor="role"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Role / Title
              </label>
              <input
                id="role"
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Lead Technician"
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                I confirm I have authority to sign this inspection report on
                behalf of the company, and that all information is accurate and
                complete.
              </span>
            </label>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Shield className="h-3.5 w-3.5" />
            Electronic Transactions Act 1999 (Cth)
          </div>
          {isFormUnlocked ? (
            <Button
              onClick={performSubmit}
              disabled={submitting || !signatoryName.trim() || !confirmed}
              className="gap-2 bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PenLine className="h-4 w-4" />
              )}
              {submitting ? "Signing…" : "Confirm sign-off"}
            </Button>
          ) : (
            <Button
              onClick={handleStartSignOff}
              disabled={isModal}
              className="gap-2 bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {isModal ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PenLine className="h-4 w-4" />
              )}
              {isModal ? "Verifying…" : "Sign Inspection"}
            </Button>
          )}
        </div>
      </div>
      <EngagementLicenceModal
        open={isModal}
        onOpenChange={(open) => {
          // Only treat close-from-open as a cancel when we're still in the
          // modal state. After onConfirmed has fired we've advanced to
          // form-unlocked, and the modal's internal onOpenChange(false) must
          // not bounce us back to initial.
          if (!open) {
            setSignOffState((prev) =>
              prev === "modal" ? "initial" : prev,
            );
          }
        }}
        inspectionId={inspectionId}
        onConfirmed={() => {
          setSignOffState("form-unlocked");
        }}
      />
    </>
  );
}
