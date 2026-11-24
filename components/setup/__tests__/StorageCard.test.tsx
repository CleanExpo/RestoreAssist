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

  it('offers Drive and local storage only when OneDrive is not offered', async () => {
    mockFetches({});
    render(<StorageCard />);
    await waitFor(() => screen.getByLabelText(/google drive/i));
    expect(screen.getByLabelText(/google drive/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/keep it local/i)).toBeInTheDocument();
  });

  it('hides the OneDrive option when the catalog does not offer it', async () => {
    mockFetches({});
    render(<StorageCard />);
    await waitFor(() => screen.getByLabelText(/google drive/i));
    expect(screen.queryByLabelText(/onedrive/i)).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/coming soon|microsoft oauth/i);
  });

  it('shows an enabled OneDrive option when the catalog offers it', async () => {
    mockFetches({
      catalog: {
        provider: null,
        catalog: [
          { id: 'drive', enabled: true, tagline: 'Drive' },
          { id: 'onedrive', enabled: true, tagline: 'Mirror to OneDrive' },
        ],
      },
    });
    render(<StorageCard />);
    const onedrive = await waitFor(() => screen.getByLabelText(/onedrive/i));
    expect(onedrive).not.toBeDisabled();
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

  it('RA-8078: a linked Microsoft account does not count as connected storage while OneDrive is not offered', async () => {
    mockFetches({
      onedrive: { connected: true, accountEmail: 'tradie@example.com' },
    });
    render(<StorageCard />);
    await waitFor(() => screen.getByLabelText(/keep it local/i));
    expect(screen.queryByLabelText(/onedrive/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/connected as/i)).not.toBeInTheDocument();
    expect(useSetupStore.getState().sections.storage).not.toBe('ready');
  });
});
