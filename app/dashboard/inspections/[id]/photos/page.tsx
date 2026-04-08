"use client";

/**
 * RA-440: Inspection photos page — /dashboard/inspections/[id]/photos
 *
 * Mobile-first photo management for field use.
 * Allows capture/upload and review of inspection photos.
 * Linked from MobileNav, field/page.tsx, and field dashboard.
 */

import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Upload,
  Image as ImageIcon,
  MapPin,
  Trash2,
  Plus,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileNav } from "@/components/mobile/MobileNav";
import { Badge } from "@/components/ui/badge";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface Photo {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  location: string | null;
  description: string | null;
  timestamp: string;
  fileSize: number | null;
  mimeType: string | null;
}

interface Inspection {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
}

const COMMON_LOCATIONS = [
  "Entry",
  "Lounge",
  "Kitchen",
  "Bathroom",
  "Bedroom",
  "Hallway",
  "Laundry",
  "Ceiling",
  "Subfloor",
  "Roof",
  "Exterior",
];

export default function InspectionPhotosPage({ params }: PageProps) {
  const { id } = use(params);

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      setLoading(true);
      const [inspRes, photosRes] = await Promise.all([
        fetch(`/api/inspections/${id}`),
        fetch(`/api/inspections/${id}/photos`),
      ]);

      if (inspRes.ok) {
        const data = await inspRes.json();
        setInspection(data.inspection ?? data);
      }

      if (photosRes.ok) {
        const data = await photosRes.json();
        setPhotos(data.photos ?? []);
      }
    } catch {
      // silent fail — show what we have
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File) {
    if (!file) return;

    const location = customLocation.trim() || selectedLocation || null;
    setUploadError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (location) formData.append("location", location);

      const res = await fetch(`/api/inspections/${id}/photos`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Upload failed");
      }

      const data = await res.json();
      setPhotos((prev) => [data.photo, ...prev]);
      setUploadSuccess(true);
      setSelectedLocation("");
      setCustomLocation("");
      setTimeout(() => setUploadSuccess(false), 2000);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  const effectiveLocation = customLocation.trim() || selectedLocation;

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#050505]/95 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/inspections/${id}`}
            className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/40 leading-none mb-0.5">Photos</p>
            <p className="text-sm font-medium truncate">
              {inspection?.inspectionNumber ?? "Loading…"}
            </p>
          </div>
          <Badge
            variant="outline"
            className="text-white/50 border-white/20 shrink-0"
          >
            {photos.length} photo{photos.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Upload panel */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-white/80">Add Photo</p>

          {/* Location selector */}
          <div>
            <p className="text-xs text-white/40 mb-2">Location (optional)</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {COMMON_LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  onClick={() => {
                    setSelectedLocation(loc === selectedLocation ? "" : loc);
                    setCustomLocation("");
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs transition-colors",
                    selectedLocation === loc && !customLocation
                      ? "bg-[#D4A574] text-black font-medium"
                      : "bg-white/5 text-white/50 hover:bg-white/10",
                  )}
                >
                  {loc}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Custom location…"
              value={customLocation}
              onChange={(e) => {
                setCustomLocation(e.target.value);
                if (e.target.value) setSelectedLocation("");
              }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
            />
          </div>

          {/* Upload buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                "h-14 rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-medium transition-all active:scale-95",
                uploading
                  ? "bg-white/5 text-white/30 cursor-not-allowed"
                  : "bg-[#1C2E47] text-white hover:bg-[#1C2E47]/80",
              )}
            >
              <Camera className="h-5 w-5" />
              Take Photo
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                "h-14 rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-medium transition-all active:scale-95",
                uploading
                  ? "bg-white/5 text-white/30 cursor-not-allowed"
                  : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10",
              )}
            >
              <Upload className="h-5 w-5" />
              Upload
            </button>
          </div>

          {/* Hidden inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Status */}
          {uploading && (
            <p className="text-center text-sm text-white/50">Uploading…</p>
          )}
          {uploadSuccess && (
            <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
              <Check className="h-4 w-4" />
              Photo saved
            </div>
          )}
          {uploadError && (
            <p className="text-center text-sm text-red-400">{uploadError}</p>
          )}

          {effectiveLocation && (
            <div className="flex items-center gap-1.5 text-xs text-[#D4A574]">
              <MapPin className="h-3.5 w-3.5" />
              Will tag as:{" "}
              <span className="font-medium">{effectiveLocation}</span>
            </div>
          )}
        </div>

        {/* Photo grid */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-2xl bg-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-12 text-white/30">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No photos yet</p>
            <p className="text-xs mt-1">
              Tap &ldquo;Take Photo&rdquo; to document the damage
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {photos.map((photo) => (
              <button
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className="relative aspect-square rounded-2xl overflow-hidden bg-white/5 group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbnailUrl ?? photo.url}
                  alt={photo.location ?? "Inspection photo"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {photo.location && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                    <p className="text-xs text-white font-medium truncate">
                      {photo.location}
                    </p>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <div>
              {selectedPhoto.location && (
                <p className="text-sm font-medium text-white">
                  {selectedPhoto.location}
                </p>
              )}
              <p className="text-xs text-white/40">
                {new Date(selectedPhoto.timestamp).toLocaleString("en-AU")}
              </p>
            </div>
            <button
              onClick={() => setSelectedPhoto(null)}
              className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div
            className="flex-1 flex items-center justify-center px-4 pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPhoto.url}
              alt={selectedPhoto.location ?? "Inspection photo"}
              className="max-w-full max-h-full object-contain rounded-xl"
            />
          </div>
        </div>
      )}

      <MobileNav inspectionId={id} />
    </div>
  );
}
