"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  organizationName: string;
  inviterName: string;
  roleLabel: string;
  onSubmit: (values: {
    acceptedTerms: boolean;
    acceptedChainOfCustody: boolean;
  }) => void;
  submitting: boolean;
  /**
   * When true, the submit button is disabled even if the user has ticked
   * both checkboxes. Used by the Google-OAuth path on /invite/[token] so
   * the user must fill phone + headshot before they can complete.
   */
  disabled?: boolean;
}

export function InviteTermsStep({
  organizationName,
  inviterName,
  roleLabel,
  onSubmit,
  submitting,
  disabled = false,
}: Props) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedChainOfCustody, setAcceptedChainOfCustody] = useState(false);

  const canSubmit =
    acceptedTerms && acceptedChainOfCustody && !submitting && !disabled;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Almost there</h2>
        <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm">
          <p>
            <strong>Joining:</strong> {organizationName}
          </p>
          <p>
            <strong>Role:</strong> {roleLabel}
          </p>
          <p>
            <strong>Manager:</strong> {inviterName}
          </p>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          id="terms"
          checked={acceptedTerms}
          onCheckedChange={(v) => setAcceptedTerms(v === true)}
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          id="cocoa"
          checked={acceptedChainOfCustody}
          onCheckedChange={(v) => setAcceptedChainOfCustody(v === true)}
        />
        <span>
          I consent to chain-of-custody hashing of my evidence captures
        </span>
      </label>

      <Button
        type="button"
        disabled={!canSubmit}
        className="w-full"
        onClick={() => onSubmit({ acceptedTerms, acceptedChainOfCustody })}
      >
        {submitting ? "Joining…" : `Join ${organizationName}`}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        No licence info needed now — we&apos;ll ask when you sign off your first
        job.
      </p>
    </div>
  );
}
