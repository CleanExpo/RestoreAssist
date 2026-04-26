"use client";

/**
 * SignaturePad — RA-1703 / Pi-Sign client capture surface.
 *
 * Canvas-based signature capture. Supports pointer events (mouse + touch
 * + stylus). On submit, exports the canvas as base64 PNG and POSTs to
 * /api/progress/[reportId]/attest. The route validates + integrity-hashes
 * + stores on ProgressAttestation.
 */

import { useCallback, useEffect, useRef, useState } from "react";

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

export default function SignaturePad({
  reportId,
  attestationType,
  transitionId,
  attestationNote,
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

  const submit = async () => {
    const c = canvasRef.current;
    if (!c || !hasInk || submitting) return;
    setSubmitting(true);
    try {
      const dataUrl = c.toDataURL("image/png");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (csrfToken) headers["x-csrf-token"] = csrfToken;
      const resp = await fetch(
        `/api/progress/${encodeURIComponent(reportId)}/attest`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            attestationType,
            transitionId,
            attestationNote,
            signatureDataUrl: dataUrl,
          }),
        },
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg =
          (json as { error?: string }).error ??
          `Attestation failed (${resp.status})`;
        onError?.(msg);
        return;
      }
      const data = (json as {
        data: {
          id: string;
          attestationType: string;
          attestedAt: string;
          integrityHash: string;
        };
      }).data;
      onAttested?.(data);
      clear();
    } catch (err) {
      onError?.((err as Error).message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
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
      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk || submitting}
          className="px-3 py-1.5 text-sm rounded border disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!hasInk || submitting}
          className="px-3 py-1.5 text-sm rounded bg-foreground text-background disabled:opacity-50"
        >
          {submitting ? "Signing…" : "Attest & sign"}
        </button>
        {!hasInk ? (
          <span className="text-xs text-muted-foreground">
            Sign above with mouse, finger, or stylus.
          </span>
        ) : null}
      </div>
    </div>
  );
}
