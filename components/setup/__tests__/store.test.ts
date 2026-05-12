import { describe, expect, it, beforeEach } from 'vitest';
import { useSetupStore } from '../store';

describe('useSetupStore', () => {
  beforeEach(() => {
    useSetupStore.getState().reset();
  });

  it('starts with org=null and all sections pending', () => {
    const { org, sections } = useSetupStore.getState();
    expect(org).toBeNull();
    expect(sections.businessDetails).toBe('pending');
    expect(sections.branding).toBe('pending');
    expect(sections.pricing).toBe('pending');
    expect(sections.storage).toBe('pending');
    expect(sections.integrations).toBe('pending');
  });

  it('setOrg replaces the org snapshot', () => {
    useSetupStore.getState().setOrg({
      id: 'org-1',
      legalName: 'Acme',
      tradingName: null,
      abn: '53004085616',
      acn: null,
      state: 'NSW',
      address: null,
      phone: null,
      email: null,
      website: null,
      logoUrl: null,
      primaryColor: null,
      accentColor: null,
      aboutCopy: null,
      tradingStatus: 'ACTIVE',
      setupStartedAt: null,
      setupCompletedAt: null,
    });
    expect(useSetupStore.getState().org?.legalName).toBe('Acme');
  });

  it('setSectionStatus updates one section without touching others', () => {
    useSetupStore.getState().setSectionStatus('businessDetails', 'running');
    const { sections } = useSetupStore.getState();
    expect(sections.businessDetails).toBe('running');
    expect(sections.branding).toBe('pending');
  });

  it('updateOrgField is a no-op when org is null', () => {
    useSetupStore.getState().updateOrgField('legalName', 'X');
    expect(useSetupStore.getState().org).toBeNull();
  });

  it('updateOrgField patches a single field when org is set', () => {
    useSetupStore.getState().setOrg({
      id: 'org-1', legalName: 'Old', tradingName: null, abn: null, acn: null, state: null,
      address: null, phone: null, email: null, website: null, logoUrl: null,
      primaryColor: null, accentColor: null, aboutCopy: null, tradingStatus: 'ACTIVE',
      setupStartedAt: null, setupCompletedAt: null,
    });
    useSetupStore.getState().updateOrgField('legalName', 'New');
    expect(useSetupStore.getState().org?.legalName).toBe('New');
    // Other fields untouched
    expect(useSetupStore.getState().org?.id).toBe('org-1');
  });

  it('reset returns to initial state', () => {
    useSetupStore.getState().setSectionStatus('branding', 'ready');
    useSetupStore.getState().reset();
    const { org, sections } = useSetupStore.getState();
    expect(org).toBeNull();
    expect(sections.branding).toBe('pending');
  });
});
