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
  // RA-8337: no inspection tab has a date-of-loss field yet (that needs the
  // column in RA-8332), so this blocker opens the job rather than claiming a
  // tab that cannot fix it.
  loss_date: {
    label: "Date of loss",
    action: "Open job",
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
      // RA-8337: the insurer tab has no date field. Until RA-8332 adds one,
      // there is nowhere on the job to set it, so open the job itself.
      return base;
    case "baseline":
    case "monitoring":
      return `${base}?tab=moisture`;
    case "photos":
      return `${base}?tab=photos`;
    default:
      return base;
  }
}

/**
 * False when no screen on the job can clear this blocker yet, so the UI
 * should show the label without a fix link. Only date of loss today
 * (waits on RA-8332).
 */
export function completenessBlockerHasFix(blockerId: string): boolean {
  return blockerId !== "loss_date";
}

export function completenessBlockerLabel(blockerId: string): string {
  const meta = BLOCKER_META[blockerId as CompletenessBlockerId];
  return meta?.label ?? blockerId.replace(/_/g, " ");
}

export function completenessBlockerAction(blockerId: string): string {
  const meta = BLOCKER_META[blockerId as CompletenessBlockerId];
  return meta?.action ?? "Open job";
}
