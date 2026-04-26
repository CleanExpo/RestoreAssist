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
  /** Width in CSS pixels. Defaults to 600. */
  width?: number;
  /** Height in CSS pixels. Defaults to 200. */
  height?: number;
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
  width = 600,
  height = 200,
  onAttested,
  onError,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Set up the canvas with retina scaling so the stored PNG looks crisp.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0b1320";
  }, [width, height]);

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
      <div className="rounded-md border bg-white">
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
