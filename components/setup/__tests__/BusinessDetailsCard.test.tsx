// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BusinessDetailsCard } from '../BusinessDetailsCard';
import { useSetupStore } from '../store';

const TEST_ORG = {
  id: 'org-1',
  legalName: null, tradingName: null, abn: null, acn: null, state: null,
  address: null, phone: null, email: null, website: null, logoUrl: null,
  primaryColor: null, accentColor: null, aboutCopy: null,
  tradingStatus: 'ACTIVE' as const,
  setupStartedAt: null, setupCompletedAt: null,
};

describe('BusinessDetailsCard', () => {
  beforeEach(() => {
    useSetupStore.getState().reset();
    useSetupStore.getState().setOrg(TEST_ORG);
    // jsdom doesn't have fetch by default
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { accepted: true } }) }) as never;
  });

  it('renders the ABN input when pending', () => {
    render(<BusinessDetailsCard />);
    expect(screen.getByPlaceholderText(/53 004/i)).toBeInTheDocument();
  });

  it('disables submit on invalid ABN', () => {
    render(<BusinessDetailsCard />);
    fireEvent.change(screen.getByPlaceholderText(/53 004/i), { target: { value: '123' } });
    expect(screen.getByRole('button', { name: /start setup/i })).toBeDisabled();
  });

  it('enables submit on valid ABN', () => {
    render(<BusinessDetailsCard />);
    fireEvent.change(screen.getByPlaceholderText(/53 004/i), { target: { value: '53004085616' } });
    expect(screen.getByRole('button', { name: /start setup/i })).not.toBeDisabled();
  });

  it('renders ready state with org data after status flip', () => {
    useSetupStore.getState().setOrg({ ...TEST_ORG, legalName: 'Acme Pty Ltd', abn: '53004085616', state: 'NSW' });
    useSetupStore.getState().setSectionStatus('businessDetails', 'ready');
    render(<BusinessDetailsCard />);
    expect(screen.getByText('Acme Pty Ltd')).toBeInTheDocument();
    expect(screen.getByText('53004085616')).toBeInTheDocument();
    expect(screen.getByText('NSW')).toBeInTheDocument();
  });

  it('shows manual-entry fallback in error state', () => {
    useSetupStore.getState().setSectionStatus('businessDetails', 'error');
    render(<BusinessDetailsCard />);
    expect(screen.getByText(/couldn't reach the business register/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/legal name/i)).toBeInTheDocument();
  });

  it('shows running skeleton when status is running', () => {
    useSetupStore.getState().setSectionStatus('businessDetails', 'running');
    render(<BusinessDetailsCard />);
    expect(screen.getByText(/looking up your business/i)).toBeInTheDocument();
  });
});
