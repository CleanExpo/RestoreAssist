import { create } from 'zustand';
import type { HydrationState } from '@/lib/setup/hydration-state-machine';

type SectionKey = 'businessDetails' | 'branding' | 'pricing' | 'storage' | 'integrations';

export interface SetupOrganization {
  id: string;
  legalName: string | null;
  tradingName: string | null;
  abn: string | null;
  acn: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  aboutCopy: string | null;
  tradingStatus: 'ACTIVE' | 'PRE_TRADING';
  setupStartedAt: string | null;
  setupCompletedAt: string | null;
}

interface SetupState {
  org: SetupOrganization | null;
  sections: Record<SectionKey, HydrationState>;
  setOrg: (org: SetupOrganization | null) => void;
  setSectionStatus: (key: SectionKey, status: HydrationState) => void;
  updateOrgField: <K extends keyof SetupOrganization>(key: K, value: SetupOrganization[K]) => void;
  reset: () => void;
}

const INITIAL_SECTIONS: Record<SectionKey, HydrationState> = {
  businessDetails: 'pending',
  branding: 'pending',
  pricing: 'pending',
  storage: 'pending',
  integrations: 'pending',
};

export const useSetupStore = create<SetupState>((set) => ({
  org: null,
  sections: INITIAL_SECTIONS,
  setOrg: (org) => set({ org }),
  setSectionStatus: (key, status) =>
    set((s) => ({ sections: { ...s.sections, [key]: status } })),
  updateOrgField: (key, value) =>
    set((s) => (s.org ? { org: { ...s.org, [key]: value } } : s)),
  reset: () => set({ org: null, sections: INITIAL_SECTIONS }),
}));
