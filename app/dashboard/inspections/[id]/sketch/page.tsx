"use client";

/**
 * /dashboard/inspections/[id]/sketch
 * Full-screen floor plan editor for technicians (RA-124 / RA-786).
 * Renders SketchEditor which provides multi-floor Fabric.js canvas,
 * moisture/equipment markers, FloorPlanUnderlayLoader integration,
 * auto-save (2 s debounce), and PDF export.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SketchEditor } from "@/components/sketch/SketchEditor";

interface InspectionMeta {
  id: string;
  propertyAddress?: string;
  propertyPostcode?: string;
}

export default function SketchPage() {
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

  // Fetch lightweight inspection metadata (address + postcode for floor plan search)
  useEffect(() => {
    if (!inspectionId || status !== "authenticated") return;
    (async () => {
      try {
        const res = await fetch(`/api/inspections/${inspectionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const insp = data.inspection ?? data;
        setMeta({
          id: inspectionId,
          propertyAddress: insp.propertyAddress,
          propertyPostcode: insp.propertyPostcode,
        });
      } catch {
        // non-fatal — editor still works without address pre-fill
      }
    })();
  }, [inspectionId, status]);

  if (status === "loading" || status === "unauthenticated") {
    return null;
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-slate-950 flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <Link
          href={`/dashboard/inspections/${inspectionId}?tab=sketch`}
          className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-slate-400 hover:text-neutral-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to inspection
        </Link>

        <span className="text-sm font-medium text-neutral-700 dark:text-slate-300">
          {meta?.propertyAddress ?? "Floor Plan Editor"}
        </span>

        <div className="w-32" aria-hidden="true" />
      </div>

      {/* Full-height editor */}
      <div className="flex-1 overflow-hidden">
        <SketchEditor
          inspectionId={inspectionId}
          propertyAddress={meta?.propertyAddress}
          propertyPostcode={meta?.propertyPostcode}
        />
      </div>
    </div>
  );
}
