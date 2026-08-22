// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntegrationsCard } from '../IntegrationsCard';

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, href: '' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A response object shaped like the one `fetch` resolves to. */
function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('IntegrationsCard', () => {
  it('renders all 5 provider buttons', () => {
    render(<IntegrationsCard />);
    expect(screen.getByLabelText(/connect xero/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/connect myob/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/connect quickbooks/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/connect servicem8/i)).toBeInTheDocument();
    // Ascora is key-based, so it is offered as a set-up hand-off, not a connect.
    expect(screen.getByLabelText(/set up ascora/i)).toBeInTheDocument();
  });

  it('clicking Xero POSTs to OAuth connect and navigates to returned authUrl', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse(200, { authUrl: '/api/integrations/oauth/xero/start-redirect' }),
    );
    vi.stubGlobal('fetch', mockFetch);

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/connect xero/i));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/integrations/oauth/xero/connect',
        { method: 'POST' },
      );
      expect(window.location.href).toContain('xero');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // ── The failure surface. Before this, every one of these was a click that
  // did nothing at all and said nothing about why. ───────────────────────────

  it('surfaces the add-on requirement instead of silently doing nothing (402)', async () => {
    // The response every workspace without the BOOKKEEPING add-on gets — i.e.
    // every workspace during onboarding.
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse(402, {
        error: 'The "BOOKKEEPING" add-on is required for this feature',
        code: 'ADDON_REQUIRED',
        sku: 'BOOKKEEPING',
        action: 'upgrade',
        redirectUrl: '/dashboard/subscription',
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/connect xero/i));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Xero needs the Online Bookkeeping Connection add-on/i);
    expect(screen.getByRole('link', { name: /view add-ons/i })).toHaveAttribute(
      'href',
      '/dashboard/subscription',
    );
    // A blocked attempt must not navigate away from the wizard.
    expect(window.location.href).toBe('');
  });

  it('surfaces the paid-plan gate (403) with a link to plans', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(403, {
          error: 'Subscription required',
          upgradeRequired: true,
          currentStatus: 'CANCELED',
          message:
            'External integrations are available for paid subscribers. Please upgrade your plan to connect to Xero, QuickBooks, MYOB, ServiceM8, or Ascora.',
        }),
      ),
    );

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/connect quickbooks/i));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/available for paid subscribers/i);
    expect(screen.getByRole('link', { name: /view plans/i })).toHaveAttribute(
      'href',
      '/dashboard/subscription',
    );
  });

  it('surfaces a server fault without leaking the internal reason (500)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(500, {
          error: { code: 'INTERNAL', message: 'MYOB_CLIENT_ID is not configured', eventId: 'e1' },
        }),
      ),
    );

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/connect myob/i));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/MYOB isn't available right now/i);
    expect(alert).not.toHaveTextContent(/MYOB_CLIENT_ID/);
  });

  it('surfaces a network failure and leaves the buttons usable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/connect servicem8/i));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Couldn't reach RestoreAssist to connect ServiceM8/i);
    expect(screen.getByLabelText(/connect servicem8/i)).toBeEnabled();
  });

  it('does not strand the operator when a 200 carries no authUrl', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { integrationId: 'i1' })));

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/connect xero/i));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/didn't return a sign-in link/i);
    expect(window.location.href).toBe('');
  });

  it('survives an error body that is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      }),
    );

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/connect xero/i));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/isn't available right now/i);
  });

  // ── Pending state ────────────────────────────────────────────────────────

  it('shows pending, blocks a second click, and fires the request once', async () => {
    let release: (value: unknown) => void = () => {};
    const inFlight = new Promise((resolve) => {
      release = resolve;
    });
    const mockFetch = vi.fn().mockReturnValue(inFlight);
    vi.stubGlobal('fetch', mockFetch);

    render(<IntegrationsCard />);
    const xero = screen.getByLabelText(/connect xero/i);
    fireEvent.click(xero);

    await waitFor(() => expect(screen.getByText(/connecting…/i)).toBeInTheDocument());
    expect(xero).toBeDisabled();
    // Every other tile is held too, so a second OAuth flow cannot start mid-flight.
    expect(screen.getByLabelText(/connect myob/i)).toBeDisabled();

    fireEvent.click(xero);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    release(jsonResponse(200, { authUrl: '/go' }));
    await waitFor(() => expect(window.location.href).toBe('/go'));
  });

  it('clears a previous failure when a new attempt starts', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: { code: 'INTERNAL', message: 'x' } }))
      .mockResolvedValueOnce(jsonResponse(200, { authUrl: '/go' }));
    vi.stubGlobal('fetch', mockFetch);

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/connect xero/i));
    await screen.findByRole('alert');

    fireEvent.click(screen.getByLabelText(/connect xero/i));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  // ── Ascora ───────────────────────────────────────────────────────────────

  it('sends Ascora to the Integrations page rather than the OAuth route that rejects it', () => {
    // /api/integrations/oauth/ascora/connect answers 400 "Ascora does not use
    // OAuth" unconditionally, so posting there could only ever fail.
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/set up ascora/i));

    expect(mockFetch).not.toHaveBeenCalled();
    expect(window.location.href).toContain('/dashboard/integrations');
  });

  it('says Ascora needs an API key', () => {
    render(<IntegrationsCard />);
    expect(screen.getByLabelText(/set up ascora/i)).toHaveTextContent(/needs an API key/i);
  });

  // ── BYOK section (unchanged behaviour) ───────────────────────────────────

  it('BYOK section collapses + expands', () => {
    render(<IntegrationsCard />);
    const toggle = screen.getByText(/byok ai keys/i);
    expect(screen.queryByRole('button', { name: /manage ai keys/i })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /manage ai keys/i })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByRole('button', { name: /manage ai keys/i })).not.toBeInTheDocument();
  });

  it('Manage AI keys button navigates to the settings page', () => {
    render(<IntegrationsCard />);
    fireEvent.click(screen.getByText(/byok ai keys/i));
    fireEvent.click(screen.getByRole('button', { name: /manage ai keys/i }));
    expect(window.location.href).toContain('/dashboard/settings/ai-providers');
  });
  // ── Drained from independent review 2026-08-18 ──────────────────────────

  it('un-wedges every tile when the page is restored from bfcache', async () => {
    // Back from the provider's consent screen is the most natural move in an
    // OAuth flow. bfcache restores this component with `pending` still set —
    // without a reset every tile stays disabled reading "Connecting…" with no
    // failure surface to explain it, and no way out but a manual reload.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { authUrl: '/go' })));

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/connect xero/i));
    await waitFor(() => expect(window.location.href).toBe('/go'));
    // The success path deliberately leaves the lock on while navigating away.
    expect(screen.getByLabelText(/connect xero/i)).toBeDisabled();

    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));

    await waitFor(() => expect(screen.getByLabelText(/connect xero/i)).toBeEnabled());
    expect(screen.getByLabelText(/connect myob/i)).toBeEnabled();
    expect(screen.queryByText(/connecting…/i)).not.toBeInTheDocument();
  });

  it('holds the other tiles while the Ascora hand-off navigates', () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    render(<IntegrationsCard />);
    fireEvent.click(screen.getByLabelText(/set up ascora/i));

    expect(window.location.href).toContain('/dashboard/integrations');
    // A fast second click must not fire an OAuth POST on the way out.
    expect(screen.getByLabelText(/connect xero/i)).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/connect xero/i));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
