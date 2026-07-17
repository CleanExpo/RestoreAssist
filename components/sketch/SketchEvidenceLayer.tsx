"use client";

/**
 * Evidence pins on the floor plan — Priority Zero for Encircle-parity.
 * React overlay (same pattern as SketchMoistureLayer) so pins survive Fabric reloads.
 */

import { useCallback, useRef, useState } from "react";
import { ChromeX } from "@/components/brand/chrome-icons";
import { RAIcon } from "@/components/brand/RAIcon";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { pinPixelPosition, toNormalized } from "@/lib/sketch/pin-coords";

export interface EvidencePinView {
  id: string;
  sketchRoomId?: string | null;
  kind: string;
  x: number;
  y: number;
  nx?: number | null;
  ny?: number | null;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  caption?: string | null;
  syncState?: string;
}

export interface SketchEvidenceLayerProps {
  pins: EvidencePinView[];
  active: boolean;
  width: number;
  height: number;
  canvasZoom?: number;
  uploading?: boolean;
  onPlace: (coords: {
    x: number;
    y: number;
    nx: number;
    ny: number;
    file: File;
  }) => Promise<void>;
  onMove: (id: string, x: number, y: number, nx: number, ny: number) => void;
  onRemove: (id: string) => void;
  className?: string;
}

export function SketchEvidenceLayer({
  pins,
  active,
  width,
  height,
  canvasZoom = 1,
  uploading = false,
  onPlace,
  onMove,
  onRemove,
  className,
}: SketchEvidenceLayerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingClick = useRef<{ x: number; y: number } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const handleLayerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!active || uploading) return;
      if ((e.target as HTMLElement).closest("[data-evidence-pin]")) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / canvasZoom;
      const y = (e.clientY - rect.top) / canvasZoom;
      pendingClick.current = { x, y };
      fileRef.current?.click();
    },
    [active, uploading, canvasZoom],
  );

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const click = pendingClick.current;
      e.target.value = "";
      pendingClick.current = null;
      if (!file || !click) return;
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        return;
      }
      const { nx, ny } = toNormalized(click.x, click.y, width, height);
      await onPlace({ x: click.x, y: click.y, nx, ny, file });
    },
    [height, onPlace, width],
  );

  const onPointerDown = (
    e: React.PointerEvent,
    pin: EvidencePinView,
  ) => {
    if (!active) return;
    e.stopPropagation();
    const pos = pinPixelPosition(pin, width, height);
    dragRef.current = {
      id: pin.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.left,
      origY: pos.top,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / canvasZoom;
    const dy = (e.clientY - d.startY) / canvasZoom;
    const x = d.origX + dx;
    const y = d.origY + dy;
    const { nx, ny } = toNormalized(x, y, width, height);
    onMove(d.id, x, y, nx, ny);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className={cn(
        "absolute inset-0 z-20",
        active ? "pointer-events-auto cursor-crosshair" : "pointer-events-none",
        className,
      )}
      onClick={handleLayerClick}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="presentation"
      aria-label="Evidence pin layer"
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      {uploading && (
        <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white backdrop-blur">
          <Spinner className="h-3.5 w-3.5" />
          Uploading evidence…
        </div>
      )}

      {pins.map((pin) => {
        const pos = pinPixelPosition(pin, width, height);
        const thumb = pin.thumbnailUrl || pin.fileUrl;
        return (
          <div
            key={pin.id}
            data-evidence-pin
            className="absolute pointer-events-auto"
            style={{
              left: pos.left,
              top: pos.top,
              transform: "translate(-50%, -50%)",
            }}
            onPointerDown={(e) => onPointerDown(e, pin)}
            onClick={(e) => {
              e.stopPropagation();
              setPreviewId(pin.id);
            }}
          >
            <button
              type="button"
              className={cn(
                "relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border-2 border-[#D4A574] bg-[#1C2E47] shadow-lg shadow-black/40",
                "ring-2 ring-black/40 transition hover:scale-105",
              )}
              aria-label={pin.caption || "Evidence photo"}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <RAIcon name="photo" decorative className="h-4 w-4" />
              )}
            </button>
            {active && (
              <button
                type="button"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow"
                aria-label="Remove evidence pin"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(pin.id);
                }}
              >
                <ChromeX className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}

      {previewId &&
        (() => {
          const pin = pins.find((p) => p.id === previewId);
          if (!pin) return null;
          const src = pin.fileUrl || pin.thumbnailUrl;
          return (
            <div
              className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm pointer-events-auto"
              onClick={() => setPreviewId(null)}
              role="dialog"
              aria-modal="true"
            >
              <div
                className="relative max-h-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={pin.caption || "Evidence"}
                    className="max-h-[70vh] w-full object-contain"
                  />
                ) : (
                  <div className="flex h-48 w-72 items-center justify-center text-white/60">
                    <RAIcon name="photo" size={32} decorative className="h-8 w-8" />
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                  <p className="truncate text-sm text-white/80">
                    {pin.caption || "Evidence pin"}
                  </p>
                  <button
                    type="button"
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white"
                    onClick={() => setPreviewId(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
