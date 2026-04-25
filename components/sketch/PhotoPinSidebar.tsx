"use client";

/**
 * PhotoPinSidebar — RA-1608
 *
 * Slide-in panel showing inspection evidence photos.
 * Click a thumbnail to "arm" it for placement; then click on the
 * floor plan to drop the pin. Click again to deselect.
 */

import { useEffect, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface EvidenceItem {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  fileUrl?: string | null;
}

export interface PhotoPinSidebarProps {
  inspectionId?: string;
  open: boolean;
  pendingPhotoId?: string | null;
  onSelect: (photoId: string, photoUrl: string) => void;
  onClose: () => void;
}

export function PhotoPinSidebar({
  inspectionId,
  open,
  pendingPhotoId,
  onSelect,
  onClose,
}: PhotoPinSidebarProps) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !inspectionId) return;
    setLoading(true);
    fetch(`/api/inspections/${inspectionId}/evidence`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { evidenceItems?: EvidenceItem[] } | null) => {
        if (data?.evidenceItems) setItems(data.evidenceItems);
      })
      .catch((err) => console.error("[PhotoPinSidebar]", err))
      .finally(() => setLoading(false));
  }, [open, inspectionId]);

  if (!open) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 w-48 z-40 bg-[#0d1b2e]/95 border-l border-white/10 flex flex-col backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 flex-shrink-0">
        <span className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
          <Camera size={12} />
          Drop a photo
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo panel"
          className="text-white/30 hover:text-white/70 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      <p className="px-3 py-1.5 text-[10px] text-white/30 leading-snug flex-shrink-0">
        Select a photo then tap the floor plan to pin it.
      </p>

      {/* Photo grid */}
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-1.5 auto-rows-min">
        {loading ? (
          <div className="col-span-2 flex justify-center py-6">
            <Loader2 size={16} className="animate-spin text-white/30" />
          </div>
        ) : items.length === 0 ? (
          <p className="col-span-2 text-center text-[10px] text-white/30 py-6">
            No photos yet.
            <br />
            Capture photos in the field first.
          </p>
        ) : (
          items.map((item) => {
            const url = item.thumbnailUrl ?? item.fileUrl ?? "";
            const selected = pendingPhotoId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.title}
                aria-label={item.title}
                aria-pressed={selected}
                onClick={() =>
                  selected ? onSelect("", "") : onSelect(item.id, url)
                }
                className={cn(
                  "aspect-square rounded-lg overflow-hidden border-2 transition-all relative",
                  selected
                    ? "border-cyan-400 ring-1 ring-cyan-400/40"
                    : "border-transparent hover:border-white/30",
                )}
                style={
                  url
                    ? {
                        backgroundImage: `url(${url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : { background: "#1C2E47" }
                }
              >
                {!url && (
                  <Camera
                    size={16}
                    className="text-white/30 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                  />
                )}
                {selected && (
                  <span className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-cyan-400 border border-white/80" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
