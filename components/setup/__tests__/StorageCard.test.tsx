// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StorageCard } from '../StorageCard';
import { useSetupStore } from '../store';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function mockStatus(body: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => body,
    })),
  );
}

describe('StorageCard', () => {
  beforeEach(() => {
    useSetupStore.getState().reset();
    // jsdom: stub location.href setter so we can assert without navigating
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders all 3 storage options when disconnected', async () => {
    mockStatus({ connected: false, provider: null, accountEmail: null });
    render(<StorageCard />);
    await waitFor(() => screen.getByLabelText(/google drive/i));
    expect(screen.getByLabelText(/google drive/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/onedrive/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/keep it local/i)).toBeInTheDocument();
  });

  it('OneDrive option is disabled (coming soon)', async () => {
    mockStatus({ connected: false, provider: null, accountEmail: null });
    render(<StorageCard />);
    await waitFor(() => screen.getByLabelText(/onedrive/i));
    expect(screen.getByLabelText(/onedrive/i)).toBeDisabled();
  });

  it('STORM T6: disabled OneDrive option is aria-disabled and explains why to AT', async () => {
    mockStatus({ connected: false, provider: null, accountEmail: null });
    render(<StorageCard />);
    const onedrive = await waitFor(() => screen.getByLabelText(/onedrive/i));
    expect(onedrive).toHaveAttribute('aria-disabled', 'true');
    // The reason ("coming soon") must reach screen-reader users via the name.
    expect(onedrive).toHaveAccessibleName(/coming soon/i);
    // The enabled option must NOT be marked aria-disabled.
    expect(screen.getByLabelText(/google drive/i)).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('clicking Keep it local marks storage section as ready', async () => {
    mockStatus({ connected: false, provider: null, accountEmail: null });
    render(<StorageCard />);
    await waitFor(() => screen.getByLabelText(/keep it local/i));
    fireEvent.click(screen.getByLabelText(/keep it local/i));
    expect(useSetupStore.getState().sections.storage).toBe('ready');
  });

  it('clicking Drive navigates to OAuth start path', async () => {
    mockStatus({ connected: false, provider: null, accountEmail: null });
    render(<StorageCard />);
    await waitFor(() => screen.getByLabelText(/google drive/i));
    fireEvent.click(screen.getByLabelText(/google drive/i));
    expect(window.location.href).toContain('/api/oauth/google-drive/start');
  });

  it('renders connected state when status returns GOOGLE_DRIVE', async () => {
    mockStatus({
      connected: true,
      provider: 'GOOGLE_DRIVE',
      accountEmail: 'tradie@example.com',
    });
    render(<StorageCard />);
    await waitFor(() =>
      expect(screen.getByText(/connected as/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('tradie@example.com')).toBeInTheDocument();
    expect(useSetupStore.getState().sections.storage).toBe('ready');
  });

  it('connected state offers a "Switch storage" affordance', async () => {
    mockStatus({
      connected: true,
      provider: 'GOOGLE_DRIVE',
      accountEmail: 'tradie@example.com',
    });
    render(<StorageCard />);
    await waitFor(() => screen.getByText(/switch storage/i));
    fireEvent.click(screen.getByText(/switch storage/i));
    // Now the grid should be visible again
    expect(screen.getByLabelText(/google drive/i)).toBeInTheDocument();
  });
});
