"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface Release {
  id: string;
  version: string;
  title: string;
  notes: string;
  mergedAt: string;
}

export function WhatsNewModal() {
  const [release, setRelease] = useState<Release | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/releases/unseen")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load releases: ${r.status}`);
        return r.json();
      })
      .then(({ data }) => {
        if (data) {
          setRelease(data);
          setOpen(true);
        }
      })
      .catch((err) => console.error("[WhatsNewModal]", err));
  }, []);

  function dismiss() {
    if (!release) return;
    setOpen(false);
    fetch(`/api/releases/${release.id}/seen`, { method: "POST" }).catch(
      () => {},
    );
  }

  if (!release) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) dismiss();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-[#D4A574]" />
            <Badge variant="secondary" className="text-xs font-mono">
              {release.version}
            </Badge>
          </div>
          <DialogTitle className="text-xl leading-snug">
            {release.title}
          </DialogTitle>
        </DialogHeader>

        <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground">
          <ReactMarkdown>{release.notes}</ReactMarkdown>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={dismiss}
            className="bg-[#1C2E47] hover:bg-[#1C2E47]/90 text-white"
          >
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
