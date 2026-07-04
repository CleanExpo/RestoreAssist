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

  it('persists manually-entered legal name to the server on blur', async () => {
    useSetupStore.getState().setSectionStatus('businessDetails', 'error');
    render(<BusinessDetailsCard />);
    const input = screen.getByPlaceholderText(/^legal name$/i);
    fireEvent.change(input, { target: { value: 'Acme Restoration Pty Ltd' } });
    fireEvent.blur(input);

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/setup/state',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ legalName: 'Acme Restoration Pty Ltd' }),
        }),
      );
    });
  });

  it('persists manually-entered ABN to the server on blur', async () => {
    useSetupStore.getState().setSectionStatus('businessDetails', 'manual');
    render(<BusinessDetailsCard />);
    const input = screen.getByPlaceholderText(/^abn$/i);
    fireEvent.change(input, { target: { value: '53004085616' } });
    fireEvent.blur(input);

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/setup/state',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ abn: '53004085616' }),
        }),
      );
    });
  });

  it('persists manually-entered state to the server on blur', async () => {
    useSetupStore.getState().setSectionStatus('businessDetails', 'error');
    render(<BusinessDetailsCard />);
    const input = screen.getByPlaceholderText(/state \(nsw, vic, etc\.\)/i);
    fireEvent.change(input, { target: { value: 'QLD' } });
    fireEvent.blur(input);

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/setup/state',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ state: 'QLD' }),
        }),
      );
    });
  });

  it('updates local store immediately on change even before blur', () => {
    useSetupStore.getState().setSectionStatus('businessDetails', 'error');
    render(<BusinessDetailsCard />);
    const input = screen.getByPlaceholderText(/^legal name$/i);
    fireEvent.change(input, { target: { value: 'Acme Restoration Pty Ltd' } });
    expect(useSetupStore.getState().org?.legalName).toBe('Acme Restoration Pty Ltd');
  });

  it('shows running skeleton when status is running', () => {
    useSetupStore.getState().setSectionStatus('businessDetails', 'running');
    render(<BusinessDetailsCard />);
    expect(screen.getByText(/looking up your business/i)).toBeInTheDocument();
  });
});
