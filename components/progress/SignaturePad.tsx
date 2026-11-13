"use client";

/**
 * SignaturePad — RA-1703 / Pi-Sign client capture surface.
 *
 * Canvas-based signature capture. Supports pointer events (mouse + touch
 * + stylus). On submit, calls /pre-attest (RA-1708 consent), then POSTs to
 * /api/progress/[reportId]/attest. The route validates + integrity-hashes
 * + stores on ProgressAttestation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiErrorMessage } from "@/lib/api-error-message";
import { buildAttestationConsentSummary } from "@/lib/progress/attestation-consent-summary";

export interface SignaturePadProps {
  reportId: string;
  attestationType:
    | "TECHNICIAN_SIGN_OFF"
    | "MANAGER_COUNTERSIGN"
    | "CARRIER_ACCEPT"
    | "LEGAL_CLEAR"
    | "CUSTOMER_SIGN_OFF"
    | "LABOUR_HIRE_SELF";
  transitionId?: string;
  attestationNote?: string;
  /** Human label for the transition step (shown in consent prose). */
  actionLabel?: string;
  /** Optional CSRF token sourced from the page. */
  csrfToken?: string;
  /** Max width in CSS pixels (will shrink to fit container on mobile). */
  maxWidth?: number;
  /** Aspect ratio (width / height). Defaults to 3 (e.g. 600x200). */
  aspectRatio?: number;
  onAttested?: (result: {
    id: string;
    attestationType: string;
    attestedAt: string;
    integrityHash: string;
  }) => void;
  onError?: (message: string) => void;
}

function consentTokenStaleMessage(body: unknown, status: number): boolean {
  const msg = apiErrorMessage(body) ?? "";
  if (status === 409) return true;
  return /consentToken|pre-attest/i.test(msg);
}

export default function SignaturePad({
  reportId,
  attestationType,
  transitionId,
  attestationNote,
  actionLabel,
  csrfToken,
  maxWidth = 600,
  aspectRatio = 3,
  onAttested,
  onError,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const [consentToken, setConsentToken] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const contentSummary = useMemo(
    () =>
      buildAttestationConsentSummary({
        attestationType,
        actionLabel,
        reportId,
      }),
    [attestationType, actionLabel, reportId],
  );

  // Consent covers one exact statement, so a changed statement clears it. This
  // runs during render on purpose: an effect also fires just after first paint
  // and wipes a tick made in that gap, leaving Attest & sign disabled (RA-8237).
  const [consentedStatement, setConsentedStatement] = useState(contentSummary);
  if (consentedStatement !== contentSummary) {
    setConsentedStatement(contentSummary);
    setConsentToken(null);
    setConsentAcknowledged(false);
    setSuccessMessage(null);
  }

  // Set up the canvas with retina scaling so the stored PNG looks crisp.
  // Sizing is responsive: caps at maxWidth, but shrinks to the wrapper's
  // available width so a phone in portrait (~375px) fits without overflow.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const compute = () => {
      const dpr = window.devicePixelRatio || 1;
      const wrap = wrapperRef.current;
      const available = wrap?.clientWidth ?? maxWidth;
      // Subtract a hair so the canvas border doesn't trigger overflow.
      const cssWidth = Math.max(160, Math.min(maxWidth, available - 2));
      const cssHeight = Math.round(cssWidth / aspectRatio);
      c.width = Math.round(cssWidth * dpr);
      c.height = Math.round(cssHeight * dpr);
      c.style.width = `${cssWidth}px`;
      c.style.height = `${cssHeight}px`;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      // Reset transform before scaling — recalculation paths must not
      // accumulate scale on resize.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#0b1320";
    };
    compute();

    // Recompute on viewport changes (rotation / window resize). Existing
    // strokes don't re-paint — that's an accepted trade-off for the V1
    // capture flow; the user can clear and re-sign if they rotate mid-sign.
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [maxWidth, aspectRatio]);

  const pos = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = pos(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    last.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx?.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const issueConsentToken = async (
    headers: Record<string, string>,
  ): Promise<string> => {
    const resp = await fetch(
      `/api/progress/${encodeURIComponent(reportId)}/pre-attest`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          attestationType,
          contentSummary,
          consentAcknowledged: true,
        }),
      },
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg =
        apiErrorMessage(json) ?? `Consent step failed (${resp.status})`;
      throw new Error(msg);
    }
    const token = (json as { consentToken?: string }).consentToken;
    if (!token) {
      throw new Error("Consent token missing from server response");
    }
    return token;
  };

  const submit = async () => {
    const c = canvasRef.current;
    if (!c || !hasInk || submitting) return;
    if (!consentAcknowledged) {
      onError?.(
        "Read the attestation statement and tick the consent box before signing.",
      );
      return;
    }
    setSubmitting(true);
    setSuccessMessage(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (csrfToken) headers["x-csrf-token"] = csrfToken;

      let token = consentToken;
      if (!token) {
        token = await issueConsentToken(headers);
        setConsentToken(token);
      }

      const dataUrl = c.toDataURL("image/png");
      const resp = await fetch(
        `/api/progress/${encodeURIComponent(reportId)}/attest`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            attestationType,
            transitionId,
            attestationNote,
            consentToken: token,
            signatureDataUrl: dataUrl,
          }),
        },
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (consentTokenStaleMessage(json, resp.status)) {
          setConsentToken(null);
        }
        const msg =
          apiErrorMessage(json) ?? `Attestation failed (${resp.status})`;
        onError?.(msg);
        return;
      }
      const data = (
        json as {
          data: {
            id: string;
            attestationType: string;
            attestedAt: string;
            integrityHash: string;
          };
        }
      ).data;
      setConsentToken(null);
      setConsentAcknowledged(false);
      setSuccessMessage("Signature recorded. Updating claim…");
      onAttested?.(data);
      clear();
    } catch (err) {
      onError?.((err as Error).message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const onConsentChange = (checked: boolean) => {
    setConsentAcknowledged(checked);
    if (!checked) setConsentToken(null);
  };

  const canSubmit = hasInk && consentAcknowledged && !submitting;

  return (
    <div className="space-y-3">
      <fieldset className="rounded-md border bg-background/60 p-3 space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1">
          Electronic attestation
        </legend>
        <p className="text-sm leading-relaxed">{contentSummary}</p>
        <label className="flex gap-2 items-start text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 min-h-4 min-w-4"
            checked={consentAcknowledged}
            onChange={(e) => onConsentChange(e.target.checked)}
            disabled={submitting}
          />
          <span>
            I have read and agree to sign this statement electronically.
          </span>
        </label>
      </fieldset>

      <div
        ref={wrapperRef}
        className="rounded-md border bg-white w-full max-w-full overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="block touch-none cursor-crosshair"
          aria-label="Signature canvas — draw to sign"
        />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk || submitting}
          className="min-h-11 px-3 py-1.5 text-sm rounded border disabled:opacity-50"
        >
          Clear signature
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="min-h-11 px-3 py-1.5 text-sm rounded bg-foreground text-background disabled:opacity-50"
        >
          {submitting ? "Signing…" : "Attest & sign"}
        </button>
        {!hasInk ? (
          <span className="text-xs text-muted-foreground">
            Sign above with mouse, finger, or stylus.
          </span>
        ) : !consentAcknowledged ? (
          <span className="text-xs text-muted-foreground">
            Tick consent above to enable Attest &amp; sign.
          </span>
        ) : null}
      </div>
      {successMessage ? (
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          {successMessage}
        </p>
      ) : null}
    </div>
  );
}
