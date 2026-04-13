"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Upload, FileText, Clock, Info, BookOpen } from "lucide-react";
import type { EvidenceClass } from "@prisma/client";
// MediaType and ExperienceMode not yet in generated schema — use string alias
type MediaType = string;
type ExperienceMode = string;
import type { EvidenceClassMeta } from "@/lib/evidence/evidence-classes";
// PhaseEvidenceRule not yet exported — use any alias
type PhaseEvidenceRule = any;

export interface EvidenceCaptureFormData {
  evidenceClass: EvidenceClass;
  mediaType: MediaType;
  title: string;
  description: string;
  file?: File;
  measurementValue?: number;
  measurementUnit?: string;
  instrumentType?: string;
  instrumentSerial?: string;
  roomName?: string;
  floorLevel?: string;
  zoneRef?: string;
}

interface EvidenceCaptureFormProps {
  rule: PhaseEvidenceRule;
  classMeta: EvidenceClassMeta;
  isUploading: boolean;
  experienceMode?: ExperienceMode;
  onSubmit: (data: EvidenceCaptureFormData) => void;
}

const MEASUREMENT_UNITS = [
  { value: "percent", label: "% MC" },
  { value: "wme", label: "WME" },
  { value: "celsius", label: "°C" },
  { value: "rh_percent", label: "% RH" },
  { value: "gpp", label: "GPP" },
  { value: "cfm", label: "CFM" },
];

export function EvidenceCaptureForm({
  rule,
  classMeta,
  isUploading,
  experienceMode = "EXPERIENCED",
  onSubmit,
}: EvidenceCaptureFormProps) {
  const isApprentice = experienceMode === "APPRENTICE";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>(
    classMeta.mediaTypes[0] as MediaType,
  );
  const [measurementValue, setMeasurementValue] = useState("");
  const [measurementUnit, setMeasurementUnit] = useState("percent");
  const [instrumentType, setInstrumentType] = useState("");
  const [instrumentSerial, setInstrumentSerial] = useState("");
  const [roomName, setRoomName] = useState("");
  const [floorLevel, setFloorLevel] = useState("");
  const [zoneRef, setZoneRef] = useState("");
  const [dragActive, setDragActive] = useState(false);

  function handleFileChange(f: File) {
    setFile(f);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileChange(f);
  }

  function handleSubmit() {
    const data: EvidenceCaptureFormData = {
      evidenceClass: rule.evidenceClass,
      mediaType,
      title: title || classMeta.displayName,
      description,
      file: file ?? undefined,
      roomName: roomName || undefined,
      floorLevel: floorLevel || undefined,
      zoneRef: zoneRef || undefined,
    };
    if (classMeta.requiresMeasurement) {
      data.measurementValue = measurementValue
        ? parseFloat(measurementValue)
        : undefined;
      data.measurementUnit = measurementUnit || undefined;
      data.instrumentType = instrumentType || undefined;
      data.instrumentSerial = instrumentSerial || undefined;
    }
    onSubmit(data);
    // Reset form
    setFile(null);
    setPreview(null);
    setTitle("");
    setDescription("");
    setMeasurementValue("");
    setInstrumentType("");
    setInstrumentSerial("");
  }

  const requirementColor =
    rule.requirement === "required"
      ? "bg-red-500/20 text-red-400 border-red-500/30"
      : rule.requirement === "recommended"
        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
        : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";

  return (
    <div className="space-y-4">
      {/* Rule header */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-400" />
              <CardTitle className="text-lg text-white">
                {classMeta.displayName}
              </CardTitle>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className={requirementColor}>
                {rule.requirement}
              </Badge>
              <Badge
                variant="outline"
                className="border-[#8A6B4E]/30 bg-[#8A6B4E]/20 text-[#D4A574]"
              >
                {classMeta.iicrcRef}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Guidance — always show in apprentice mode; compact in experienced */}
          {isApprentice ? (
            <>
              <div className="flex gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <p className="text-sm text-zinc-300">{rule.guidance}</p>
              </div>
              <div className="flex gap-2 rounded-md border border-[#8A6B4E]/20 bg-[#8A6B4E]/5 p-3">
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#D4A574]" />
                <div>
                  <p className="text-xs font-medium text-[#D4A574]">
                    IICRC {classMeta.iicrcRef}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {classMeta.description}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-400">{rule.guidance}</p>
          )}
          <p className="text-xs text-zinc-500">
            Minimum {rule.minCount} item{rule.minCount !== 1 ? "s" : ""}{" "}
            required &middot; Accepted:{" "}
            {classMeta.mediaTypes.join(", ").toLowerCase()}
          </p>
        </CardContent>
      </Card>

      {/* File upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
          dragActive
            ? "border-cyan-400 bg-cyan-500/10"
            : "border-white/20 bg-white/5 hover:border-white/30"
        }`}
      >
        {preview ? (
          <img
            src={preview}
            alt="Preview"
            className="mb-3 h-32 w-auto rounded-lg object-contain"
          />
        ) : file ? (
          <div className="mb-3 flex items-center gap-2 text-zinc-300">
            <FileText className="h-8 w-8" />
            <span className="text-sm">{file.name}</span>
          </div>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-zinc-500" />
            <p className="text-sm text-zinc-400">
              Drop file here or click to browse
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Photos, videos, documents, or sketches
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileChange(f);
          }}
        />
      </div>

      {/* Media type selector */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Media Type</label>
          <Select
            value={mediaType}
            onValueChange={(v) => setMediaType(v as MediaType)}
          >
            <SelectTrigger className="border-white/10 bg-white/5 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {classMeta.mediaTypes.map((mt: string) => (
                <SelectItem key={mt} value={mt}>
                  {mt.charAt(0) + mt.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={classMeta.displayName}
            className="border-white/10 bg-white/5 text-white placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* Measurement fields */}
      {classMeta.requiresMeasurement && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="grid grid-cols-2 gap-3 pt-4">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Reading Value *
              </label>
              <Input
                type="number"
                step="0.1"
                value={measurementValue}
                onChange={(e) => setMeasurementValue(e.target.value)}
                placeholder="e.g. 18.5"
                className="border-white/10 bg-white/5 text-white placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Unit</label>
              <Select
                value={measurementUnit}
                onValueChange={setMeasurementUnit}
              >
                <SelectTrigger className="border-white/10 bg-white/5 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEASUREMENT_UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Instrument Type
              </label>
              <Input
                value={instrumentType}
                onChange={(e) => setInstrumentType(e.target.value)}
                placeholder="e.g. Protimeter MMS3"
                className="border-white/10 bg-white/5 text-white placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Serial Number
              </label>
              <Input
                value={instrumentSerial}
                onChange={(e) => setInstrumentSerial(e.target.value)}
                placeholder="e.g. PM-2024-0891"
                className="border-white/10 bg-white/5 text-white placeholder:text-zinc-600"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Location fields */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            Room / Area
          </label>
          <Input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="e.g. Master Bedroom"
            className="border-white/10 bg-white/5 text-white placeholder:text-zinc-600"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            Floor Level
          </label>
          <Input
            value={floorLevel}
            onChange={(e) => setFloorLevel(e.target.value)}
            placeholder="e.g. Ground"
            className="border-white/10 bg-white/5 text-white placeholder:text-zinc-600"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Zone Ref</label>
          <Input
            value={zoneRef}
            onChange={(e) => setZoneRef(e.target.value)}
            placeholder="e.g. Z-01"
            className="border-white/10 bg-white/5 text-white placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Notes</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Additional observations or context..."
          rows={3}
          className="border-white/10 bg-white/5 text-white placeholder:text-zinc-600"
        />
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={isUploading}
        className="w-full bg-cyan-600 text-white hover:bg-cyan-700"
      >
        {isUploading ? (
          <>
            <Clock className="mr-2 h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Camera className="mr-2 h-4 w-4" />
            Capture Evidence
          </>
        )}
      </Button>
    </div>
  );
}
