"use client";

/**
 * FloorPlanUnderlayLoader — RA2-023 (RA-105)
 *
 * Collapsible panel that lets the technician fetch a property's floor plan
 * from OnTheHouse.com.au (or upload one manually) and apply it as a
 * semi-transparent underlay on the Fabric.js canvas for tracing.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  MapPin,
  ImageIcon,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Upload,
  Layers,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { ScrapedPropertyData } from "@/lib/property-data-parser";

export interface FloorPlanUnderlayLoaderProps {
  /** Pass the inspection's address to pre-fill the search. */
  defaultAddress?: string;
  /** Pass postcode for a better cache hit. */
  defaultPostcode?: string;
  inspectionId?: string;
  /** Called when the user confirms an image + opacity. */
  onApply: (imageUrl: string, opacity: number) => void;
  /** Called when the user removes the current underlay. */
  onClear: () => void;
  /** Whether a background image is currently set. */
  hasBackground?: boolean;
  /**
   * When true AND defaultAddress is provided, automatically fetch the
   * property listing on mount and apply the first floor plan found.
   * The panel expands to show loading state.
   */
  autoFetch?: boolean;
  className?: string;
}

export function FloorPlanUnderlayLoader({
  defaultAddress = "",
  defaultPostcode = "",
  inspectionId,
  onApply,
  onClear,
  hasBackground = false,
  autoFetch = false,
  className,
}: FloorPlanUnderlayLoaderProps) {
  const [expanded, setExpanded] = useState(autoFetch && !!defaultAddress);
  const [address, setAddress] = useState(defaultAddress);
  const [directUrl, setDirectUrl] = useState("");
  const [showDirectUrl, setShowDirectUrl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScrapedPropertyData | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.35);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track whether we've already auto-applied so we don't re-trigger on re-renders
  const autoAppliedRef = useRef(false);

  // Auto-fetch on mount when autoFetch=true and an address is available
  useEffect(() => {
    if (!autoFetch || !defaultAddress || hasBackground) return;
    // Small delay so the canvas is fully mounted before the background is set
    const timer = setTimeout(() => {
      fetchListing();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only — intentionally omitting deps to avoid re-triggering

  // After results arrive from auto-fetch, apply the best image automatically
  useEffect(() => {
    if (!autoFetch || autoAppliedRef.current) return;
    if (!results) return;
    const autoSelect =
      results.floorPlanImages[0] ?? results.propertyImages[0] ?? null;
    if (autoSelect) {
      autoAppliedRef.current = true;
      onApply(autoSelect, opacity);
      // Collapse the panel once applied — the Active indicator will appear
      setExpanded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const allImages = results
    ? [...results.floorPlanImages, ...results.propertyImages]
    : [];

  const fetchListing = useCallback(async () => {
    const q = address.trim();
    const urlInput = directUrl.trim();
    if (!q && !urlInput) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSelectedImage(null);

    try {
      const body: Record<string, string> = {};
      if (urlInput) {
        body.url = urlInput;
      } else {
        body.address = q;
        if (defaultPostcode) body.postcode = defaultPostcode;
        if (inspectionId) body.inspectionId = inspectionId;
      }

      const res = await fetch("/api/properties/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok || !json.data) {
        setError(json.error ?? "No property found for this address");
        return;
      }

      const data = json.data as ScrapedPropertyData;
      setResults(data);

      // Auto-select first floor plan image (preferred), then first property image
      const autoSelect =
        data.floorPlanImages[0] ?? data.propertyImages[0] ?? null;
      setSelectedImage(autoSelect);
    } catch {
      setError("Request failed — check your connection");
    } finally {
      setLoading(false);
    }
  }, [address, directUrl, defaultPostcode, inspectionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") fetchListing();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setSelectedImage(ev.target.result as string);
        setResults(null);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const handleApply = () => {
    if (!selectedImage) return;
    onApply(selectedImage, opacity);
    setExpanded(false);
  };

  const handleClear = () => {
    onClear();
    setSelectedImage(null);
    setResults(null);
    setExpanded(false);
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden",
        className,
      )}
    >
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <Layers size={14} className="text-cyan-500 flex-shrink-0" />
        <span className="font-medium text-neutral-700 dark:text-slate-300 flex-1 text-left">
          Floor Plan Underlay
        </span>
        {hasBackground && !expanded && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={12} /> Active
          </span>
        )}
        {expanded ? (
          <ChevronUp size={14} className="text-neutral-400 flex-shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-neutral-400 flex-shrink-0" />
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-neutral-100 dark:border-slate-700/50 space-y-3">
          {/* Fetch from listing */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wide">
                Fetch from OnTheHouse
              </label>
              <button
                type="button"
                onClick={() => { setShowDirectUrl(v => !v); setError(null); }}
                className="text-[11px] text-cyan-500 hover:text-cyan-400 transition-colors"
              >
                {showDirectUrl ? "Use address" : "Paste URL instead"}
              </button>
            </div>

            {showDirectUrl ? (
              <div className="flex gap-1.5">
                <input
                  type="url"
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchListing()}
                  placeholder="https://www.onthehouse.com.au/property/…"
                  className="flex-1 min-w-0 text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={fetchListing}
                  disabled={loading || !directUrl.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
                  Fetch
                </button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter property address…"
                  className="flex-1 min-w-0 text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-neutral-800 dark:text-slate-200 placeholder:text-neutral-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={fetchListing}
                  disabled={loading || !address.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  {loading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <MapPin size={13} />
                  )}
                  Fetch
                </button>
              </div>
            )}
          </div>

          {/* Upload option */}
          <div>
            <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">
              Or upload a floor plan
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-dashed border-neutral-300 dark:border-slate-600 text-neutral-500 dark:text-slate-400 hover:border-cyan-400 hover:text-cyan-500 transition-colors"
            >
              <Upload size={13} />
              Choose image file…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-xs">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Image thumbnails */}
          {allImages.length > 0 && (
            <div>
              <p className="text-xs text-neutral-500 dark:text-slate-400 mb-1.5">
                {results?.floorPlanImages.length
                  ? `${results.floorPlanImages.length} floor plan(s) found`
                  : "No floor plans found — showing property photos"}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {allImages.slice(0, 12).map((img, i) => (
                  <button
                    key={img}
                    type="button"
                    title={`Image ${i + 1}`}
                    onClick={() => setSelectedImage(img)}
                    className={cn(
                      "relative w-16 h-12 rounded-md overflow-hidden border-2 transition-all flex-shrink-0",
                      selectedImage === img
                        ? "border-cyan-500 shadow-md shadow-cyan-500/20"
                        : "border-transparent hover:border-neutral-300 dark:hover:border-slate-500",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img}
                      alt={`Property image ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {results?.floorPlanImages.includes(img) && (
                      <span className="absolute bottom-0 left-0 right-0 text-center text-white text-[9px] font-bold bg-cyan-600/70 py-0.5">
                        Floor Plan
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected from file upload indicator */}
          {selectedImage && !results && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
              <ImageIcon size={13} />
              Local file selected
            </div>
          )}

          {/* Opacity slider */}
          {selectedImage && (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-neutral-500 dark:text-slate-400 uppercase tracking-wide">
                  Opacity
                </label>
                <span className="text-xs text-neutral-500 dark:text-slate-400 tabular-nums">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.05}
                max={0.8}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleApply}
              disabled={!selectedImage}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Layers size={13} />
              Apply to Canvas
            </button>
            {hasBackground && (
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm text-rose-500 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
              >
                <X size={13} />
                Clear
              </button>
            )}
          </div>

          {results && (
            <p className="text-[11px] text-neutral-400 dark:text-slate-500">
              Data from OnTheHouse.com.au · {results.confidence} confidence
            </p>
          )}
        </div>
      )}
    </div>
  );
}
