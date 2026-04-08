import type { Inspection } from "@/shared/types";

interface CompletionItem {
  label: string;
  met: boolean;
}

export interface CompletionResult {
  canSubmit: boolean;
  items: CompletionItem[];
}

export function checkTieredCompletion(
  inspection: Inspection,
): CompletionResult {
  const items: CompletionItem[] = [
    {
      label: "Property address",
      met: !!inspection.propertyAddress,
    },
    {
      label: "Property postcode",
      met: !!inspection.propertyPostcode,
    },
    {
      label: "Inspection date",
      met: !!inspection.inspectionDate,
    },
    {
      label: "At least 1 affected area",
      met: (inspection.affectedAreas?.length ?? 0) > 0,
    },
    {
      label: "At least 1 photo",
      met: (inspection.photos?.length ?? 0) > 0,
    },
  ];

  return {
    canSubmit: items.every((i) => i.met),
    items,
  };
}
