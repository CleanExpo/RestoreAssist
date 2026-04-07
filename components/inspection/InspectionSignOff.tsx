"use client";

import { useState } from "react";
import {
  PenLine,
  CheckCircle,
  Loader2,
  AlertCircle,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  inspectionId: string;
  inspectionNumber: string;
  signedAt?: Date | string | null;
  signedByName?: string | null;
  onSigned?: (signedAt: Date, signedByName: string) => void;
}

export default function InspectionSignOff({
  inspectionId,
  inspectionNumber,
  signedAt: initialSignedAt,
  signedByName: initialSignedByName,
  onSigned,
}: Props) {
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

  if (signedAt) {
    return (
      <div className="p-4 rounded-xl border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-950/20">
        <div className="flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-green-700 dark:text-green-400">
              Inspection Signed Off
            </p>
            <p className="text-sm text-green-600 dark:text-green-500 mt-0.5">
              Signed by <strong>{signedByName}</strong> on{" "}
              {signedAt.toLocaleString("en-AU", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="text-xs text-green-500 dark:text-green-600 mt-1">
              Valid under the Australian Electronic Transactions Act 1999
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
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
        setError(data.error ?? "Failed to sign inspection");
        return;
      }

      const newSignedAt = new Date(data.signedAt);
      setSignedAt(newSignedAt);
      setSignedByName(data.signedByName);
      onSigned?.(newSignedAt, data.signedByName);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
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

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Full name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={signatoryName}
            onChange={(e) => setSignatoryName(e.target.value)}
            placeholder="e.g. John Smith"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Role / Title
          </label>
          <input
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
            I confirm I have authority to sign this inspection report on behalf
            of the company, and that all information is accurate and complete.
          </span>
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
          <Shield className="h-3.5 w-3.5" />
          Electronic Transactions Act 1999 (Cth)
        </div>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !signatoryName.trim() || !confirmed}
          className="gap-2 bg-cyan-600 hover:bg-cyan-700 text-white"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PenLine className="h-4 w-4" />
          )}
          {submitting ? "Signing…" : "Sign Inspection"}
        </Button>
      </div>
    </div>
  );
}
