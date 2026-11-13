/**
 * Maps completeness inbox blocker ids to the best place on the job to fix them.
 */

export type CompletenessBlockerId =
  | "client"
  | "s500"
  | "loss_date"
  | "baseline"
  | "monitoring"
  | "photos";

const BLOCKER_META: Record<
  CompletenessBlockerId,
  { label: string; action: string }
> = {
  client: {
    label: "Customer linked to job",
    action: "Link client",
  },
  s500: {
    label: "Water category and class",
    action: "Classify",
  },
  loss_date: {
    label: "Date of loss",
    action: "Set loss date",
  },
  baseline: {
    label: "Baseline moisture",
    action: "Add baseline",
  },
  monitoring: {
    label: "Monitoring point",
    action: "Add reading",
  },
  photos: {
    label: "Site photos",
    action: "Add photos",
  },
};

export function completenessBlockerHref(
  inspectionId: string,
  blockerId: string,
): string {
  const base = `/dashboard/inspections/${inspectionId}`;
  switch (blockerId as CompletenessBlockerId) {
    case "client":
      return `${base}?tab=insurer`;
    case "s500":
      return `${base}?tab=classification`;
    case "loss_date":
      return `${base}?tab=insurer`;
    case "baseline":
    case "monitoring":
      return `${base}?tab=moisture`;
    case "photos":
      return `${base}?tab=photos`;
    default:
      return base;
  }
}

export function completenessBlockerLabel(blockerId: string): string {
  const meta = BLOCKER_META[blockerId as CompletenessBlockerId];
  return meta?.label ?? blockerId.replace(/_/g, " ");
}

export function completenessBlockerAction(blockerId: string): string {
  const meta = BLOCKER_META[blockerId as CompletenessBlockerId];
  return meta?.action ?? "Open job";
}
