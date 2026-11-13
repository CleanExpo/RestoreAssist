// @vitest-environment jsdom
// RA-8087: a rate that fails to save must say so on its own row, never look saved.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PricingCard } from '../PricingCard';
import { useSetupStore } from '../store';

function readyCard() {
  useSetupStore.getState().reset();
  useSetupStore.getState().setSectionStatus('pricing', 'ready');
  render(<PricingCard />);
}

function editAdminFee(value: string) {
  const input = screen.getByLabelText(/admin fee/i);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('PricingCard save feedback (RA-8087)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { updated: ['administrationFee'] } }),
    }) as never;
  });

  it('shows the server message on the row when the save returns 500', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL', message: 'Could not save the rate' } }),
    }) as never;
    readyCard();
    editAdminFee('250');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the rate');
  });

  it('names the status when a failed save has no readable message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => {
        throw new Error('not json');
      },
    }) as never;
    readyCard();
    editAdminFee('250');
    expect(await screen.findByRole('alert')).toHaveTextContent(/not saved/i);
  });

  it('shows an error on the row when the network request rejects', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as never;
    readyCard();
    editAdminFee('250');
    expect(await screen.findByRole('alert')).toHaveTextContent(/not saved/i);
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('refuses a negative rate with a message and sends nothing', async () => {
    readyCard();
    editAdminFee('-5');
    expect(await screen.findByRole('alert')).toHaveTextContent(/0 or more/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('says a blank rate is not saved and sends nothing', async () => {
    readyCard();
    editAdminFee('');
    expect(await screen.findByRole('alert')).toHaveTextContent(/blank rate is not saved/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // Codex review of d0173211: a slower, older reply must never decide the row.
  function deferred() {
    let resolve!: (v: unknown) => void;
    const promise = new Promise((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }
  const failed = { ok: false, status: 500, json: async () => ({ error: { code: 'INTERNAL', message: 'Could not save the rate' } }) };
  const saved = { ok: true, status: 200, json: async () => ({ data: {} }) };

  it('keeps a newer failure when an older save succeeds later', async () => {
    const first = deferred();
    const second = deferred();
    global.fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) as never;
    readyCard();
    editAdminFee('250');
    editAdminFee('260');
    second.resolve(failed);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the rate');
    first.resolve(saved);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the rate');
    expect(screen.queryByText(/saving/i)).not.toBeInTheDocument();
  });

  it('keeps a newer success when an older save fails later', async () => {
    const first = deferred();
    const second = deferred();
    global.fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) as never;
    readyCard();
    editAdminFee('250');
    editAdminFee('260');
    second.resolve(saved);
    await new Promise((r) => setTimeout(r, 20));
    first.resolve(failed);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the blank-rate message when an earlier save succeeds afterwards', async () => {
    const first = deferred();
    global.fetch = vi.fn().mockReturnValueOnce(first.promise) as never;
    readyCard();
    editAdminFee('250');
    editAdminFee('');
    expect(await screen.findByRole('alert')).toHaveTextContent(/blank rate is not saved/i);
    first.resolve(saved);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('alert')).toHaveTextContent(/blank rate is not saved/i);
    expect(screen.queryByText(/saving/i)).not.toBeInTheDocument();
  });

  it('clears the row error once the rate saves', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL', message: 'Could not save the rate' } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: {} }) }) as never;
    readyCard();
    editAdminFee('250');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    editAdminFee('260');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
