"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { RAIcon } from "@/components/brand/RAIcon";
import {
  createEstimateFromSketch,
  type EstimatePostLineItem,
} from "@/lib/sketch/seed-estimate-from-sketch";

export interface ImportRoomsFromFloorPlanButtonProps {
  inspectionId?: string | null;
  reportId: string;
  scopeId?: string;
  existingLineItems?: Array<{ code?: string | null } & Record<string, unknown>>;
  estimateFields?: Record<string, unknown>;
  disabled?: boolean;
  onImported: (estimate: {
    id?: string;
    lineItems?: EstimatePostLineItem[];
  }) => void;
}

export function ImportRoomsFromFloorPlanButton({
  inspectionId,
  reportId,
  scopeId,
  existingLineItems,
  estimateFields,
  disabled,
  onImported,
}: ImportRoomsFromFloorPlanButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!inspectionId) {
      toast.error("This report is not linked to an inspection floor plan");
      return;
    }
    setLoading(true);
    try {
      const result = await createEstimateFromSketch({
        inspectionId,
        reportId,
        scopeId,
        existingLineItems,
        estimateFields,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onImported(result.estimate);
      toast.success("Imported measured rooms from the floor plan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className="bg-brand-cta hover:bg-brand-cta-hover text-white"
    >
      <RAIcon name="room" size={16} decorative className="mr-2" />
      {loading ? "Importing rooms..." : "Import rooms from floor plan"}
    </Button>
  );
}
