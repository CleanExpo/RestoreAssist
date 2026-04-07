"use client";

import { Badge } from "@/components/ui/badge";
import { Check, Image, FileText, Video } from "lucide-react";

interface CapturedItem {
  id: string;
  title: string;
  mediaType: string;
  fileUrl?: string | null;
  measurementValue?: number | null;
  measurementUnit?: string | null;
  roomName?: string | null;
  createdAt: string;
}

interface CapturedEvidenceListProps {
  items: CapturedItem[];
  requiredCount: number;
}

function getMediaIcon(mediaType: string) {
  switch (mediaType) {
    case "PHOTO":
      return <Image className="h-4 w-4" />;
    case "VIDEO":
      return <Video className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

export function CapturedEvidenceList({
  items,
  requiredCount,
}: CapturedEvidenceListProps) {
  if (items.length === 0) return null;

  const met = items.length >= requiredCount;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-400">
          Captured ({items.length}/{requiredCount})
        </p>
        {met && (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <Check className="mr-1 h-3 w-3" />
            Requirement met
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2"
          >
            {item.fileUrl && item.mediaType === "PHOTO" ? (
              <img
                src={item.fileUrl}
                alt={item.title}
                className="h-10 w-10 rounded object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded bg-white/10 text-zinc-400">
                {getMediaIcon(item.mediaType)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-zinc-300">{item.title}</p>
              {item.measurementValue != null && (
                <p className="text-xs text-cyan-400">
                  {item.measurementValue} {item.measurementUnit ?? ""}
                </p>
              )}
              {item.roomName && (
                <p className="truncate text-xs text-zinc-500">
                  {item.roomName}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
