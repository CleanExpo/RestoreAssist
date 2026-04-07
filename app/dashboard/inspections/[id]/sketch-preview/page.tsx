"use client";

/**
 * /dashboard/inspections/[id]/sketch-preview
 * Homeowner-facing preview of the inspection floor plan sketches (RA2-054 / RA-124).
 * Restorers use this to verify what the homeowner will see before sharing.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SketchViewer } from "@/components/sketch/SketchViewer";

interface InspectionMeta {
  id: string;
  title?: string;
  propertyAddress?: string;
}

export default function SketchPreviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const inspectionId = params.id;

  const [meta, setMeta] = useState<InspectionMeta | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // Fetch inspection metadata for the header
  useEffect(() => {
    if (!inspectionId || status !== "authenticated") return;
    (async () => {
      try {
        const res = await fetch(`/api/inspections/${inspectionId}`);
        if (!res.ok) return;
        const data = await res.json();
        setMeta({
          id: inspectionId,
          title: data.inspection?.title ?? data.title,
          propertyAddress:
            data.inspection?.propertyAddress ?? data.propertyAddress,
        });
      } catch {
        // non-fatal — viewer still loads
      }
    })();
  }, [inspectionId, status]);

  if (status === "loading" || status === "unauthenticated") {
    return null;
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-slate-950 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Back navigation */}
        <div className="flex items-center justify-between">
          <Link
            href={`/dashboard/inspections/${inspectionId}`}
            className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-slate-400 hover:text-neutral-800 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft size={15} />
            Back to inspection
          </Link>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
              Homeowner view
            </span>
            <span className="text-xs text-neutral-400 dark:text-slate-500">
              This is how the floor plan appears to your client
            </span>
          </div>
        </div>

        {/* Viewer */}
        <SketchViewer
          inspectionId={inspectionId}
          propertyAddress={meta?.propertyAddress}
          reportTitle={meta?.title ?? "Property Floor Plan"}
        />

        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/10 text-sm text-blue-800 dark:text-blue-300">
          <ExternalLink size={15} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium mb-0.5">Sharing options</p>
            <p className="opacity-80">
              Use the <strong>Download PDF</strong> button above to export a
              branded floor plan document. You can attach this to your report or
              email it directly to your client. Moisture readings, equipment
              placements, and technical annotations are excluded from this view.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
