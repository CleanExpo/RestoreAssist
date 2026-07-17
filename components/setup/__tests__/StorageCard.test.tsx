// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StorageCard } from '../StorageCard';
import { useSetupStore } from '../store';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function mockFetches(body: {
  drive?: Record<string, unknown>;
  onedrive?: Record<string, unknown>;
  catalog?: Record<string, unknown>;
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('google-drive/status')) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            body.drive ?? { connected: false, provider: null, accountEmail: null },
        };
      }
      if (url.includes('microsoft-onedrive/status')) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            body.onedrive ?? { connected: false, accountEmail: null },
        };
      }
      if (url.includes('/api/user/cloud-mirror')) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            body.catalog ?? {
              provider: null,
              catalog: [
                { id: 'drive', enabled: true, tagline: 'Drive' },
                { id: 'onedrive', enabled: false, tagline: 'Coming soon' },
                { id: 'icloud', enabled: false, tagline: 'CloudKit' },
              ],
            },
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
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
    mockFetches({});
    render(<StorageCard />);
    await waitFor(() => screen.getByLabelText(/google drive/i));
    expect(screen.getByLabelText(/google drive/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/onedrive/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/keep it local/i)).toBeInTheDocument();
  });

  it('OneDrive option is disabled when catalog says so', async () => {
    mockFetches({});
    render(<StorageCard />);
    await waitFor(() => screen.getByLabelText(/onedrive/i));
    expect(screen.getByLabelText(/onedrive/i)).toBeDisabled();
  });

  it('STORM T6: disabled OneDrive option is aria-disabled and explains why to AT', async () => {
    mockFetches({});
    render(<StorageCard />);
    const onedrive = await waitFor(() => screen.getByLabelText(/onedrive/i));
    expect(onedrive).toHaveAttribute('aria-disabled', 'true');
    // The reason ("coming soon") must reach screen-reader users via the name.
    expect(onedrive).toHaveAccessibleName(/requires microsoft oauth configuration|coming soon/i);
    // The enabled option must NOT be marked aria-disabled.
    expect(screen.getByLabelText(/google drive/i)).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('clicking Keep it local marks storage section as ready', async () => {
    mockFetches({});
    render(<StorageCard />);
    await waitFor(() => screen.getByLabelText(/keep it local/i));
    fireEvent.click(screen.getByLabelText(/keep it local/i));
    expect(useSetupStore.getState().sections.storage).toBe('ready');
  });

  it('clicking Drive navigates to OAuth start path', async () => {
    mockFetches({});
    render(<StorageCard />);
    await waitFor(() => screen.getByLabelText(/google drive/i));
    fireEvent.click(screen.getByLabelText(/google drive/i));
    expect(window.location.href).toContain('/api/oauth/google-drive/start');
  });

  it('renders connected state when status returns GOOGLE_DRIVE', async () => {
    mockFetches({
      drive: {
        connected: true,
        provider: 'GOOGLE_DRIVE',
        accountEmail: 'tradie@example.com',
      },
    });
    render(<StorageCard />);
    await waitFor(() =>
      expect(screen.getByText(/connected as/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('tradie@example.com')).toBeInTheDocument();
    expect(useSetupStore.getState().sections.storage).toBe('ready');
  });

  it('connected state offers a "Switch storage" affordance', async () => {
    mockFetches({
      drive: {
        connected: true,
        provider: 'GOOGLE_DRIVE',
        accountEmail: 'tradie@example.com',
      },
    });
    render(<StorageCard />);
    await waitFor(() => screen.getByText(/switch storage/i));
    fireEvent.click(screen.getByText(/switch storage/i));
    // Now the grid should be visible again
    expect(screen.getByLabelText(/google drive/i)).toBeInTheDocument();
  });
});
