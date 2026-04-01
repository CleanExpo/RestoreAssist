import { create } from 'zustand';
import type { Inspection } from '@/shared/types';

interface AppStore {
  inspections: Inspection[];
  setInspections: (inspections: Inspection[]) => void;
  selectedInspectionId: string | null;
  setSelectedInspection: (id: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  inspections: [],
  setInspections: (inspections) => set({ inspections }),
  selectedInspectionId: null,
  setSelectedInspection: (id) => set({ selectedInspectionId: id }),
}));
