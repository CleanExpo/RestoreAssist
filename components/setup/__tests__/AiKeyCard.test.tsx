// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
  it('renders the "any one of them is enough" hint', () => {
    render(<AiKeyCard />);
    expect(screen.getByText(/any one of them is enough/i)).toBeInTheDocument();
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

// ── Phase 3: OpenRouter key + model picker ──────────────────────────────────

const CATALOGUE = {
  recommended: [
    { id: 'deepseek/deepseek-v4', name: 'DeepSeek V4', family: 'deepseek', contextLength: 128000 },
    { id: 'qwen/qwen3-235b', name: 'Qwen3 235B', family: 'qwen', contextLength: 262144 },
  ],
  models: [
    { id: 'deepseek/deepseek-v4', name: 'DeepSeek V4', family: 'deepseek', contextLength: 128000 },
    { id: 'openai/gpt-x', name: 'GPT-X', family: null, contextLength: 128000 },
    { id: 'qwen/qwen3-235b', name: 'Qwen3 235B', family: 'qwen', contextLength: 262144 },
  ],
  unavailable: false,
};

/**
 * Routes each URL to its own response so a save can be asserted independently
 * of the catalogue fetch the OpenRouter tab fires on mount.
 */
function mockFetchRoutes(
  catalogue: unknown,
  saveResponse: { ok: boolean; status?: number; json?: () => Promise<unknown> } = {
    ok: true,
    json: async () => ({ connection: { id: 'c1' } }),
  },
) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('openrouter-models')) {
      return { ok: catalogue !== null, json: async () => catalogue };
    }
    return { status: 200, json: async () => ({}), ...saveResponse };
  });
  vi.stubGlobal('fetch', fetchMock as never);
  return fetchMock;
}

async function selectOpenRouter() {
  fireEvent.click(screen.getByRole('button', { name: /openrouter/i }));
}

describe('AiKeyCard — OpenRouter', () => {
  it('offers OpenRouter alongside the two first-party providers', () => {
    render(<AiKeyCard />);
    expect(screen.getByRole('button', { name: /openrouter/i })).toBeInTheDocument();
  });

  it('shows no model picker for Anthropic or OpenAI', () => {
    render(<AiKeyCard />);
    expect(screen.queryByLabelText(/^model/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /openai/i }));
    expect(screen.queryByLabelText(/^model/i)).not.toBeInTheDocument();
  });

  it('populates the picker from the live catalogue, default first', async () => {
    mockFetchRoutes(CATALOGUE);
    render(<AiKeyCard />);
    await selectOpenRouter();

    const select = (await screen.findByRole('combobox')) as HTMLSelectElement;
    expect(select).toHaveAccessibleName(expect.stringMatching(/^model/i));
    // Blank value = server-side default, and it must be the initial selection.
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: /use the default/i })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'DeepSeek V4' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'qwen/qwen3-235b' })).toBeInTheDocument();
  });

  it('posts the chosen slug with the key', async () => {
    const fetchMock = mockFetchRoutes(CATALOGUE);
    render(<AiKeyCard />);
    await selectOpenRouter();

    await screen.findByRole('combobox');
    fireEvent.change(screen.getByLabelText(/^api key$/i), {
      target: { value: 'sk-or-v1-abc123' },
    });
    fireEvent.change(screen.getByLabelText(/^model/i), {
      target: { value: 'qwen/qwen3-235b' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save key/i }));

    await waitFor(() => expect(screen.getByText(/key saved/i)).toBeInTheDocument());

    const saveCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === '/api/workspace/provider-connections',
    );
    expect(saveCall).toBeDefined();
    expect(JSON.parse((saveCall![1] as { body: string }).body)).toEqual({
      provider: 'OPENROUTER',
      apiKey: 'sk-or-v1-abc123',
      model: 'qwen/qwen3-235b',
    });
  });

  it('omits the model field when the default is left selected', async () => {
    const fetchMock = mockFetchRoutes(CATALOGUE);
    render(<AiKeyCard />);
    await selectOpenRouter();
    await screen.findByRole('combobox');

    fireEvent.change(screen.getByLabelText(/^api key$/i), {
      target: { value: 'sk-or-v1-abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save key/i }));

    await waitFor(() => expect(screen.getByText(/key saved/i)).toBeInTheDocument());

    const saveCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === '/api/workspace/provider-connections',
    );
    expect(JSON.parse((saveCall![1] as { body: string }).body)).toEqual({
      provider: 'OPENROUTER',
      apiKey: 'sk-or-v1-abc123',
    });
  });

  it('falls back to a free-text slug field when the catalogue is unavailable', async () => {
    mockFetchRoutes({ recommended: [], models: [], unavailable: true });
    render(<AiKeyCard />);
    await selectOpenRouter();

    await waitFor(() =>
      expect(
        screen.getByText(/couldn'?t reach openrouter'?s model list/i),
      ).toBeInTheDocument(),
    );
    const field = screen.getByLabelText(/^model/i);
    expect(field.tagName).toBe('INPUT');
    expect(field).not.toBeDisabled();

    // Onboarding must still be completable without the catalogue.
    fireEvent.change(screen.getByLabelText(/^api key$/i), {
      target: { value: 'sk-or-v1-abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save key/i }));
    await waitFor(() => expect(screen.getByText(/key saved/i)).toBeInTheDocument());
  });

  it('still resolves the picker when the operator toggles away mid-fetch and back', async () => {
    const fetchMock = mockFetchRoutes(CATALOGUE);
    render(<AiKeyCard />);

    await selectOpenRouter();
    // Toggle away before the in-flight catalogue fetch settles, then back.
    fireEvent.click(screen.getByRole('button', { name: /anthropic/i }));
    await selectOpenRouter();

    // Must land on a real picker, not a permanent "Loading models…" field.
    const select = await screen.findByRole('combobox');
    expect(select).toBeInTheDocument();
    // The once-guard must hold — exactly one catalogue request.
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('openrouter-models'),
      ),
    ).toHaveLength(1);
  });

  it('degrades to free text when the catalogue request never settles', async () => {
    // The route's own upstream timeout cannot rescue a browser request that
    // never completes; without a client-side bound the picker sits disabled on
    // "Loading models…" indefinitely, which is precisely the state the
    // free-text fallback exists to prevent.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchMock = vi.fn(async (url: string, init?: { signal?: AbortSignal }) => {
        if (String(url).includes('openrouter-models')) {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          });
        }
        return { ok: true, status: 200, json: async () => ({ connection: { id: 'c1' } }) };
      });
      vi.stubGlobal('fetch', fetchMock as never);

      render(<AiKeyCard />);
      await selectOpenRouter();
      expect(screen.getByLabelText(/^model/i)).toBeDisabled();

      await act(async () => {
        vi.advanceTimersByTime(13_000);
      });

      await waitFor(() => {
        const field = screen.getByLabelText(/^model/i);
        expect(field.tagName).toBe('INPUT');
        expect(field).not.toBeDisabled();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a chosen slug when switching back to a first-party provider', async () => {
    const fetchMock = mockFetchRoutes(CATALOGUE);
    render(<AiKeyCard />);
    await selectOpenRouter();
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByLabelText(/^model/i), {
      target: { value: 'qwen/qwen3-235b' },
    });

    fireEvent.click(screen.getByRole('button', { name: /anthropic/i }));
    fireEvent.change(screen.getByLabelText(/^api key$/i), {
      target: { value: 'sk-ant-abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save key/i }));

    await waitFor(() => expect(screen.getByText(/key saved/i)).toBeInTheDocument());

    const saveCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === '/api/workspace/provider-connections',
    );
    expect(JSON.parse((saveCall![1] as { body: string }).body)).toEqual({
      provider: 'ANTHROPIC',
      apiKey: 'sk-ant-abc',
    });
  });
});
