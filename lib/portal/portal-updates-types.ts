export interface PortalAreaDryingState {
  areaId: string;
  areaLabel: string;
  status: "on-track" | "needs-attention";
  estimateLabel: string;
}

export interface PortalUpdatesFeed {
  currentStep: string;
  progressPct: number;
  steps: { key: string; label: string; done: boolean }[];
  reportReady: boolean;
  pendingApprovals: { id: string; type: string; label: string }[];
  dryingTimeline: PortalAreaDryingState[];
}
