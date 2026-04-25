"use client";

/**
 * SketchPhotoLayer — RA-1608
 *
 * React DOM overlay that renders evidence photo pins on the sketch canvas.
 * - When a photo is "armed" (pendingPhotoId set) and `active` is true,
 *   clicking the layer drops a pin at the click position.
 * - Existing pins are draggable via pointer capture.
 * - Hover shows a × delete button (no window.confirm).
 */

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Camera, X } from "lucide-react";

export interface PhotoPin {
  id: string;
  photoId: string;
  photoUrl: string;
  caption?: string;
  x: number;
  y: number;
}

export interface SketchPhotoLayerProps {
  pins: PhotoPin[];
  onChange: (pins: PhotoPin[]) => void;
  pendingPhotoId?: string | null;
  pendingPhotoUrl?: string | null;
  onPinDropped?: () => void;
  active: boolean;
  width: number;
  height: number;
  className?: string;
}

let counter = 0;
function newId() {
  return `pp-${Date.now()}-${++counter}`;
}

export function SketchPhotoLayer({
  pins,
  onChange,
  pendingPhotoId,
  pendingPhotoUrl,
  onPinDropped,
  active,
  width,
  height,
  className,
}: SketchPhotoLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canDrop = active && !!pendingPhotoId && !!pendingPhotoUrl;

  const handleLayerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!canDrop) return;
      if ((e.target as HTMLElement).closest("[data-photopin]")) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pin: PhotoPin = {
        id: newId(),
        photoId: pendingPhotoId!,
        photoUrl: pendingPhotoUrl!,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      onChange([...pins, pin]);
      onPinDropped?.();
    },
    [canDrop, pendingPhotoId, pendingPhotoUrl, pins, onChange, onPinDropped],
  );

  const movePin = useCallback(
    (id: string, x: number, y: number) => {
      onChange(pins.map((p) => (p.id === id ? { ...p, x, y } : p)));
    },
    [pins, onChange],
  );

  const removePin = useCallback(
    (id: string) => {
      onChange(pins.filter((p) => p.id !== id));
    },
    [pins, onChange],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0 pointer-events-none",
        canDrop && "pointer-events-auto cursor-crosshair",
        className,
      )}
      style={{ width, height }}
      onClick={handleLayerClick}
    >
      {pins.map((pin) => (
        <PhotoPinMarker
          key={pin.id}
          pin={pin}
          containerRef={containerRef}
          onMove={(x, y) => movePin(pin.id, x, y)}
          onRemove={() => removePin(pin.id)}
        />
      ))}
    </div>
  );
}

// ── Pin marker ────────────────────────────────────────────────

interface PhotoPinMarkerProps {
  pin: PhotoPin;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onMove: (x: number, y: number) => void;
  onRemove: () => void;
}

function PhotoPinMarker({
  pin,
  containerRef,
  onMove,
  onRemove,
}: PhotoPinMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const draggingRef = useRef(false);
  const startRef = useRef<{
    pinX: number;
    pinY: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      draggingRef.current = false;
      startRef.current = {
        pinX: pin.x,
        pinY: pin.y,
        clientX: e.clientX,
        clientY: e.clientY,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pin.x, pin.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.clientX;
      const dy = e.clientY - startRef.current.clientY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) draggingRef.current = true;
      if (!draggingRef.current) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      onMove(x, y);
    },
    [containerRef, onMove],
  );

  const onPointerUp = useCallback(() => {
    startRef.current = null;
  }, []);

  return (
    <div
      data-photopin={pin.id}
      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto select-none"
      style={{ left: pin.x, top: pin.y }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="relative cursor-grab active:cursor-grabbing">
        {/* Circular thumbnail */}
        <div
          className="w-8 h-8 rounded-full border-2 border-white shadow-lg overflow-hidden bg-slate-700 flex items-center justify-center"
          style={
            pin.photoUrl
              ? {
                  backgroundImage: `url(${pin.photoUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          {!pin.photoUrl && <Camera size={14} className="text-white/60" />}
        </div>

        {/* Drop shadow anchor dot */}
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-1.5 h-1.5 rounded-full bg-black/40" />

        {/* × delete button — appears on hover */}
        {hovered && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label="Remove photo pin"
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600 transition-colors"
          >
            <X size={9} />
          </button>
        )}
      </div>
    </div>
  );
}
