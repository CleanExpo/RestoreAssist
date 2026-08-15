// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Activation re-mints the NextAuth JWT before navigating — the setup gate in
// proxy.ts reads `setupCompletedAt` off the token, so leaving on a stale one
// bounces the operator into a /setup ↔ /dashboard redirect loop.
const updateSession = vi.fn().mockResolvedValue(null);
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'authenticated', update: updateSession }),
}));

import { FeatureHealthCard } from '../FeatureHealthCard';

const CHECKS_ALL_GREEN = [
  { capability: 'business_profile', label: 'Business profile complete', status: 'green' as const },
  { capability: 'branding', label: 'Branding set', status: 'green' as const },
  { capability: 'pricing', label: 'Pricing config', status: 'green' as const },
];
const CHECKS_WITH_RED = [
  { capability: 'business_profile', label: 'Business profile complete', status: 'red' as const, note: 'Add ABN' },
  { capability: 'branding', label: 'Branding set', status: 'green' as const },
];
const CHECKS_WITH_YELLOW = [
  { capability: 'business_profile', label: 'Business profile complete', status: 'green' as const },
  { capability: 'cloud_storage', label: 'Cloud storage', status: 'yellow' as const, note: 'Not connected — optional' },
];

function mockChecksFetch(rows: any[]) {
  global.fetch = vi.fn((url: string, init?: any) => {
    if (typeof url === 'string' && url.includes('/api/setup/checks')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { checks: rows } }),
      });
    }
    if (typeof url === 'string' && url.includes('/api/setup/activate')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { redirectTo: '/dashboard?firstRun=1' } }),
      });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
  }) as never;
}

describe('FeatureHealthCard', () => {
  beforeEach(() => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows skeleton before checks load', () => {
    mockChecksFetch(CHECKS_ALL_GREEN);
    const { container } = render(<FeatureHealthCard />);
    // 4 skeleton rows in the initial render
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(4);
  });

  it('renders all rows when loaded', async () => {
    mockChecksFetch(CHECKS_ALL_GREEN);
    render(<FeatureHealthCard />);
    await waitFor(() => expect(screen.getByText('Business profile complete')).toBeInTheDocument());
    expect(screen.getByText('Branding set')).toBeInTheDocument();
    expect(screen.getByText('Pricing config')).toBeInTheDocument();
  });

  it('disables Activate when any check is red', async () => {
    mockChecksFetch(CHECKS_WITH_RED);
    render(<FeatureHealthCard />);
    await waitFor(() => expect(screen.getByText('Business profile complete')).toBeInTheDocument());
    const btn = screen.getByRole('button', { name: /activate my workspace/i });
    expect(btn).toBeDisabled();
  });

  it('enables Activate when only yellow (with explanatory note)', async () => {
    mockChecksFetch(CHECKS_WITH_YELLOW);
    render(<FeatureHealthCard />);
    await waitFor(() => expect(screen.getByText('Cloud storage')).toBeInTheDocument());
    const btn = screen.getByRole('button', { name: /activate my workspace/i });
    expect(btn).not.toBeDisabled();
    expect(screen.getByText(/you can activate now and connect/i)).toBeInTheDocument();
  });

  it('clicking Activate navigates on success', async () => {
    mockChecksFetch(CHECKS_ALL_GREEN);
    render(<FeatureHealthCard />);
    await waitFor(() => expect(screen.getByRole('button', { name: /activate my workspace/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /activate my workspace/i }));
    await waitFor(() => expect(window.location.href).toBe('/dashboard?firstRun=1'));
  });

  it('refreshes the session BEFORE navigating, so the setup gate sees a fresh token', async () => {
    const order: string[] = [];
    mockChecksFetch(CHECKS_ALL_GREEN);
    updateSession.mockImplementation(async () => {
      order.push('refreshSession');
      return null;
    });
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: {
        set href(_v: string) {
          order.push('navigate');
        },
        get href() {
          return '';
        },
      },
    });

    render(<FeatureHealthCard />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /activate my workspace/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /activate my workspace/i }));

    // Order is load-bearing: navigating first leaves the operator on a stale
    // JWT and the gate ping-pongs /dashboard ↔ /setup until the browser gives up.
    await waitFor(() => expect(order).toEqual(['refreshSession', 'navigate']));
  });

  it('hides Activate when postActivation=true', async () => {
    mockChecksFetch(CHECKS_ALL_GREEN);
    render(<FeatureHealthCard postActivation />);
    await waitFor(() => expect(screen.getByText('Business profile complete')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /activate my workspace/i })).not.toBeInTheDocument();
  });
});
