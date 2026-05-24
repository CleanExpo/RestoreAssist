import { create } from "zustand";
import type { Inspection } from "@/shared/types";
import type { SyncStatus } from "@/lib/sync/engine";

interface AppStore {
  // Inspection list
  inspections: Inspection[];
  setInspections: (inspections: Inspection[]) => void;
  selectedInspectionId: string | null;
  setSelectedInspection: (id: string | null) => void;

  // Network status
  isOnline: boolean;
  setOnline: (v: boolean) => void;
  syncStatus: SyncStatus;
  queuedMutationCount: number;
  failedMutationCount: number;
  syncError: string | null;
  setSyncSnapshot: (snapshot: {
    syncStatus?: SyncStatus;
    queuedMutationCount?: number;
    failedMutationCount?: number;
    syncError?: string | null;
  }) => void;

  // Trigger list refetch after mutations
  refreshCounter: number;
  triggerRefresh: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  inspections: [],
  setInspections: (inspections) => set({ inspections }),
  selectedInspectionId: null,
  setSelectedInspection: (id) => set({ selectedInspectionId: id }),

  isOnline: true,
  setOnline: (v) => set({ isOnline: v }),
  syncStatus: "idle",
  queuedMutationCount: 0,
  failedMutationCount: 0,
  syncError: null,
  setSyncSnapshot: (snapshot) => set(snapshot),

  refreshCounter: 0,
  triggerRefresh: () => set((s) => ({ refreshCounter: s.refreshCounter + 1 })),
}));
