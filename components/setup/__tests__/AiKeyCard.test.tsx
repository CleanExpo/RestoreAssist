// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiKeyCard } from '../AiKeyCard';

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSuccess() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        connection: {
          id: 'conn-1',
          provider: 'ANTHROPIC',
          status: 'ACTIVE',
          maskedKey: 'sk-ant-***',
          lastValidatedAt: null,
          lastError: null,
          updatedAt: new Date().toISOString(),
        },
      }),
    }) as never,
  );
}

describe('AiKeyCard', () => {
  it('renders the "either one is enough" hint', () => {
    render(<AiKeyCard />);
    expect(screen.getByText(/either one is enough/i)).toBeInTheDocument();
  });

  it('renders a masked key input', () => {
    render(<AiKeyCard />);
    // Use selector to target only the <input> matched by its label
    const input = screen.getByLabelText(/^api key$/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders provider toggle buttons for Anthropic and OpenAI', () => {
    render(<AiKeyCard />);
    expect(screen.getByRole('button', { name: /anthropic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /openai/i })).toBeInTheDocument();
  });

  it('shows success state after filling key and clicking save', async () => {
    mockFetchSuccess();
    render(<AiKeyCard />);

    const input = screen.getByLabelText(/^api key$/i);
    fireEvent.change(input, { target: { value: 'sk-ant-test-key-123' } });

    const btn = screen.getByRole('button', { name: /save key/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/key saved/i)).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/workspace/provider-connections',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows a friendly error message when save fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid key format', code: 'VALIDATION' }),
      }) as never,
    );

    render(<AiKeyCard />);
    const input = screen.getByLabelText(/^api key$/i);
    fireEvent.change(input, { target: { value: 'bad-key' } });

    fireEvent.click(screen.getByRole('button', { name: /save key/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    // Must NOT render the raw server message "Invalid key format" verbatim
    // (friendly message only)
    const alert = screen.getByRole('alert');
    expect(alert.textContent).not.toMatch(/invalid key format/i);
    expect(alert.textContent).toMatch(/incomplete/i);
  });

  it('shows a workspace setup message when save returns 402', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        json: async () => ({ error: 'No workspace found', code: 'NO_WORKSPACE' }),
      }) as never,
    );

    render(<AiKeyCard />);
    const input = screen.getByLabelText(/^api key$/i);
    fireEvent.change(input, { target: { value: 'sk-ant-test-key-1234567890' } });

    fireEvent.click(screen.getByRole('button', { name: /save key/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert').textContent).toMatch(/workspace/i);
    expect(screen.getByRole('alert').textContent).not.toMatch(
      /couldn't save that key/i,
    );
  });

  it('calls onSaved after a successful save', async () => {
    mockFetchSuccess();
    const onSaved = vi.fn();
    render(<AiKeyCard onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/^api key$/i), {
      target: { value: 'sk-ant-test-key-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save key/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it('renders a link to the ai-providers settings page', () => {
    render(<AiKeyCard />);
    const link = screen.getByRole('link', { name: /here'?s how/i });
    expect(link).toHaveAttribute('href', '/dashboard/settings/ai-providers');
  });
});
