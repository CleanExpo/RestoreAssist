// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PricingCard } from '../PricingCard';
import { useSetupStore } from '../store';

describe('PricingCard', () => {
  beforeEach(() => {
    useSetupStore.getState().reset();
    useSetupStore.getState().setOrg({
      id: 'org-1',
      legalName: 'Acme',
      tradingName: null,
      country: 'AU',
      abn: null,
      nzbn: null,
      acn: null,
      timezone: 'Australia/Sydney',
      state: null,
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
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { updated: [] } }),
    }) as never;
  });

  it('renders waiting copy when status is pending', () => {
    render(<PricingCard />);
    expect(screen.getByText(/waiting for your business details/i)).toBeInTheDocument();
  });

  it('renders skeleton when status is running', () => {
    useSetupStore.getState().setSectionStatus('pricing', 'running');
    render(<PricingCard />);
    expect(screen.getByText(/calculating defaults/i)).toBeInTheDocument();
  });

  it('renders compact rate table when status is ready (8 visible rows)', () => {
    useSetupStore.getState().setSectionStatus('pricing', 'ready');
    render(<PricingCard />);
    expect(screen.getByText(/master tech/i)).toBeInTheDocument();
    expect(screen.getByText(/admin fee/i)).toBeInTheDocument();
    expect(screen.queryByText(/saturday rate/i)).not.toBeInTheDocument();
  });

  it('expands to show all rates', () => {
    useSetupStore.getState().setSectionStatus('pricing', 'ready');
    render(<PricingCard />);
    fireEvent.click(screen.getByRole('button', { name: /show all rates/i }));
    expect(screen.getByText(/saturday rate/i)).toBeInTheDocument();
    expect(screen.getByText(/project mgmt/i)).toBeInTheDocument();
  });

  it('PATCH is called on input blur with parsed number', async () => {
    useSetupStore.getState().setSectionStatus('pricing', 'ready');
    render(<PricingCard />);
    const input = screen.getByLabelText(/admin fee/i);
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);
    await new Promise((r) => setTimeout(r, 50));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/setup/pricing',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"administrationFee":250'),
      }),
    );
  });

  // RA-8087: a failed save used to look saved, so quotes kept the old rate.
  it('shows the server error next to the row when PATCH returns 500', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Could not save pricing' } }),
    }) as never;
    useSetupStore.getState().setSectionStatus('pricing', 'ready');
    render(<PricingCard />);
    const input = screen.getByLabelText(/admin fee/i);
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save pricing');
  });

  it('shows an error when fetch rejects (network failure)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as never;
    useSetupStore.getState().setSectionStatus('pricing', 'ready');
    render(<PricingCard />);
    const input = screen.getByLabelText(/admin fee/i);
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not saved/i);
  });

  it('shows a message for a negative value and does not PATCH', async () => {
    useSetupStore.getState().setSectionStatus('pricing', 'ready');
    render(<PricingCard />);
    const input = screen.getByLabelText(/admin fee/i);
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('alert')).toHaveTextContent(/zero or more/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('clears the row error after a later successful save', async () => {
    useSetupStore.getState().setSectionStatus('pricing', 'ready');
    render(<PricingCard />);
    const input = screen.getByLabelText(/admin fee/i);
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    await screen.findByRole('alert');
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
