"use client";

/**
 * ClaimActions — RA-1704 client-side controls for the claim detail page.
 *
 * Renders transition buttons (legal next keys), a confirmation modal
 * for the chosen key, and the SignaturePad for attestation when the
 * action requires it.
 *
 * Server passes the precomputed list of legal keys + a flag per key for
 * whether attestation is required. We don't recompute permissions on the
 * client — server is the source of truth. The client is presentation +
 * input capture only.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "./SignaturePad";

export interface LegalAction {
  key: string;
  /** Human-readable label. */
  label: string;
  /** Show the SignaturePad when true. Default: false. */
  requiresAttestation?: boolean;
  /** Attestation type to record alongside the transition. */
  attestationType?:
    | "TECHNICIAN_SIGN_OFF"
    | "MANAGER_COUNTERSIGN"
    | "CARRIER_ACCEPT"
    | "LEGAL_CLEAR"
    | "CUSTOMER_SIGN_OFF"
    | "LABOUR_HIRE_SELF";
}

export interface ClaimActionsProps {
  reportId: string;
  /** Optimistic-lock token from the server. */
  expectedVersion: number;
  /** CSRF token sourced server-side. */
  csrfToken?: string;
  /** Legal next transitions for the current state and user role. */
  actions: LegalAction[];
}

export default function ClaimActions({
  reportId,
  expectedVersion,
  csrfToken,
  actions,
}: ClaimActionsProps) {
  const router = useRouter();
  const [openAction, setOpenAction] = useState<LegalAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (actions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No legal next transitions for your role in this state.
      </p>
    );
  }

  const submitTransition = async (
    action: LegalAction,
    extra?: { transitionId?: string },
  ) => {
    setSubmitting(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (csrfToken) headers["x-csrf-token"] = csrfToken;
      const resp = await fetch(
        `/api/progress/${encodeURIComponent(reportId)}/transition`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            key: action.key,
            expectedVersion,
            note: note.trim() || undefined,
          }),
        },
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg =
          (json as { error?: string }).error ??
          `Transition failed (${resp.status})`;
        setError(msg);
        return null;
      }
      return (json as { data: { id: string } }).data;
    } finally {
      setSubmitting(false);
    }
  };

  const onClickAction = async (action: LegalAction) => {
    setOpenAction(action);
    setError(null);
    setNote("");
  };

  const onConfirmNoSignature = async () => {
    if (!openAction) return;
    const result = await submitTransition(openAction);
    if (result) {
      setOpenAction(null);
      router.refresh();
    }
  };

  // For attestation flows, we run the transition first (server creates
  // the ProgressTransition row), then post the signature against the
  // resulting transitionId. Order matters because the attest endpoint
  // verifies transitionId belongs to the claim.
  const onAttested = (
    _r: {
      id: string;
      attestationType: string;
      attestedAt: string;
      integrityHash: string;
    },
  ) => {
    setOpenAction(null);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => onClickAction(a)}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded border hover:bg-muted disabled:opacity-50"
          >
            {a.label}
          </button>
        ))}
      </div>

      {openAction ? (
        <div className="rounded-md border p-4 space-y-3 bg-muted/30">
          <div className="flex items-baseline justify-between">
            <h3 className="font-medium">
              Confirm: {openAction.label}
            </h3>
            <button
              type="button"
              onClick={() => setOpenAction(null)}
              className="text-xs text-muted-foreground hover:underline"
              disabled={submitting}
            >
              Cancel
            </button>
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Note (optional)
            </span>
            <textarea
              className="mt-1 w-full rounded border p-2 text-sm"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the next reviewer should see…"
            />
          </label>

          {openAction.requiresAttestation && openAction.attestationType ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                This step requires your signature. The transition commits
                first; the signature is hashed onto the resulting
                attestation row for tamper-evident audit.
              </p>
              <AttestFlow
                action={openAction}
                reportId={reportId}
                csrfToken={csrfToken}
                onSubmitTransition={() => submitTransition(openAction)}
                onAttested={onAttested}
                note={note}
                disabled={submitting}
              />
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={onConfirmNoSignature}
                disabled={submitting}
                className="px-3 py-1.5 text-sm rounded bg-foreground text-background disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Confirm"}
              </button>
            </div>
          )}

          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AttestFlow({
  action,
  reportId,
  csrfToken,
  onSubmitTransition,
  onAttested,
  disabled,
}: {
  action: LegalAction;
  reportId: string;
  csrfToken?: string;
  onSubmitTransition: () => Promise<{ id: string } | null>;
  onAttested: (r: {
    id: string;
    attestationType: string;
    attestedAt: string;
    integrityHash: string;
  }) => void;
  note: string;
  disabled: boolean;
}) {
  const [transitionId, setTransitionId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCommit = async () => {
    setCommitting(true);
    setError(null);
    const data = await onSubmitTransition();
    if (data) setTransitionId(data.id);
    setCommitting(false);
  };

  if (!transitionId) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={startCommit}
          disabled={committing || disabled}
          className="px-3 py-1.5 text-sm rounded bg-foreground text-background disabled:opacity-50"
        >
          {committing ? "Committing…" : "Commit transition (then sign)"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <SignaturePad
      reportId={reportId}
      attestationType={action.attestationType ?? "TECHNICIAN_SIGN_OFF"}
      transitionId={transitionId}
      csrfToken={csrfToken}
      onAttested={onAttested}
      onError={setError}
    />
  );
}
