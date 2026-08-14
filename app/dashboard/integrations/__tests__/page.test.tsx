// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import toast from "react-hot-toast";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/ConfirmDialog", () => ({
  useConfirmDialog: () => ({
    ask: vi.fn().mockResolvedValue(false),
    Mount: () => null,
  }),
}));

vi.mock("@/components/capacitor/BillingGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/integrations/ImportModal", () => ({
  default: () => null,
}));

vi.mock("@/lib/capacitor", () => ({
  isCapacitorIOS: () => false,
}));

import IntegrationsPage from "../page";

describe("IntegrationsPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/integrations") {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        if (url === "/api/user/profile") {
          return { ok: true, json: async () => ({ profile: {} }) };
        }
        if (url === "/api/dr-nrpg/connect") {
          return { ok: true, json: async () => ({ integration: null }) };
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
  });

  it("shows external statuses as unavailable instead of disconnected after a load error", async () => {
    render(<IntegrationsPage />);

    expect(
      await screen.findByText(
        "Integration status is unavailable. Retry before connecting or disconnecting.",
      ),
    ).toBeInTheDocument();

    const unavailableButtons = await screen.findAllByRole("button", {
      name: "Status unavailable",
    });
    expect(unavailableButtons).toHaveLength(5);
    unavailableButtons.forEach((button) => expect(button).toBeDisabled());
  });
});

interface FetchCall {
  url: string;
  init?: RequestInit;
}

interface StubResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

/**
 * Mount the page with controllable Ascora state.
 *
 * `legacyIntegrations` feeds BOTH the legacy AI-key list and the non-Ascora
 * external statuses. `ascoraStatus` is what GET /api/ascora/connect returns —
 * the canonical source of truth for whether Ascora is connected. The two are
 * deliberately separable so a test can prove which one the UI believes.
 */
function mountAscora(options: {
  legacyIntegrations?: unknown[];
  ascoraStatus?: unknown;
  syncResponse?: StubResponse;
  connectResponse?: StubResponse;
}): FetchCall[] {
  const {
    legacyIntegrations = [],
    ascoraStatus = { integration: null },
    syncResponse,
    connectResponse,
  } = options;
  const calls: FetchCall[] = [];

  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          calls.push({ url, init });

          if (url === "/api/integrations") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ integrations: legacyIntegrations }),
            };
          }
          if (url === "/api/user/profile") {
            return { ok: true, json: async () => ({ profile: {} }) };
          }
          if (url === "/api/dr-nrpg/connect") {
            return { ok: true, json: async () => ({ integration: null }) };
          }
          if (url === "/api/ascora/connect") {
            if (init?.method === "POST") {
              const res = connectResponse ?? {
                ok: true,
                status: 200,
                body: { success: true },
              };
              return {
                ok: res.ok,
                status: res.status,
                json: async () => res.body,
              };
            }
            return { ok: true, status: 200, json: async () => ascoraStatus };
          }
          if (url === "/api/ascora/sync") {
            const res = syncResponse ?? {
              ok: true,
              status: 200,
              body: {},
            };
            return {
              ok: res.ok,
              status: res.status,
              json: async () => res.body,
            };
          }
          throw new Error(`Unexpected request: ${url}`);
        },
      ),
  );

  return calls;
}

const CONNECTED_ASCORA = {
  integration: { id: "asc_1", isActive: true, lastSyncAt: null },
};

/** The card whose title is `name`, so "Connect" resolves unambiguously. */
function providerCard(name: string): HTMLElement {
  const card = screen.getByText(name).closest('[data-slot="card"]');
  if (!card) throw new Error(`No card found for ${name}`);
  return card as HTMLElement;
}

describe("IntegrationsPage — Ascora status source of truth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("treats GET /api/ascora/connect as the canonical status, not the legacy Integration list", async () => {
    // The legacy list carries NO Ascora row. If the page still derived Ascora's
    // status from /api/integrations it would render as disconnected.
    const calls = mountAscora({
      legacyIntegrations: [],
      ascoraStatus: CONNECTED_ASCORA,
    });

    render(<IntegrationsPage />);

    const card = await waitFor(() => providerCard("Ascora"));
    expect(within(card).getByText("Connected")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: /Sync/i }),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/ascora/connect")).toBe(true);
  });

  it("renders Ascora as disconnected when the canonical status has no record, even with a legacy CONNECTED row", async () => {
    mountAscora({
      legacyIntegrations: [
        {
          id: "int-ascora",
          name: "Ascora",
          provider: "ASCORA",
          status: "CONNECTED",
        },
      ],
      ascoraStatus: { integration: null },
    });

    render(<IntegrationsPage />);

    const card = await waitFor(() => providerCard("Ascora"));
    expect(within(card).queryByText("Connected")).not.toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: /Connect/i }),
    ).toBeInTheDocument();
  });
});

describe("IntegrationsPage — Ascora connect dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  async function openDialogAndSubmit(key: string) {
    const card = await waitFor(() => providerCard("Ascora"));
    fireEvent.click(within(card).getByRole("button", { name: /Connect/i }));

    const input = await screen.findByLabelText("Ascora API Key");
    fireEvent.change(input, { target: { value: key } });

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Connect" }));

    return input as HTMLInputElement;
  }

  it("posts only the API key to the canonical connect route and never exposes it", async () => {
    const calls = mountAscora({ ascoraStatus: { integration: null } });

    render(<IntegrationsPage />);
    const input = await openDialogAndSubmit("ascora-secret-key");

    // The field is masked and the value is never echoed into the document.
    expect(input).toHaveAttribute("type", "password");

    const post = await waitFor(() => {
      const call = calls.find(
        (c) => c.url === "/api/ascora/connect" && c.init?.method === "POST",
      );
      if (!call) throw new Error("No POST to /api/ascora/connect");
      return call;
    });

    expect(JSON.parse(String(post.init?.body))).toEqual({
      apiKey: "ascora-secret-key",
    });
    // Never the OAuth route, which cannot carry a static key.
    expect(
      calls.some((c) => c.url.includes("/api/integrations/oauth/ascora")),
    ).toBe(false);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    // The key does not outlive the attempt.
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("surfaces a structured connect failure and still clears the key", async () => {
    mountAscora({
      ascoraStatus: { integration: null },
      connectResponse: {
        ok: false,
        status: 422,
        body: {
          error: {
            code: "VALIDATION",
            message: "Could not connect to Ascora with the provided API key.",
            eventId: "evt_9",
          },
        },
      },
    });

    render(<IntegrationsPage />);
    const input = await openDialogAndSubmit("bad-key");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not connect to Ascora with the provided API key.",
      ),
    );
    await waitFor(() => expect(input.value).toBe(""));
  });
});

describe("IntegrationsPage — Ascora sync error rendering (RA toast regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders a readable message from the structured error envelope instead of crashing", async () => {
    // The apiError envelope: { error: { code, message, eventId } }. Passing
    // this object straight to react-hot-toast throws "Objects are not valid
    // as a React child" and takes down the whole integrations page.
    const calls = mountAscora({
      ascoraStatus: CONNECTED_ASCORA,
      syncResponse: {
        ok: false,
        status: 500,
        body: {
          error: {
            code: "UPSTREAM_FAILED",
            message: "Ascora rejected the request",
            eventId: "evt_123",
          },
        },
      },
    });

    render(<IntegrationsPage />);

    const syncButton = await screen.findByRole("button", { name: /Sync/i });
    fireEvent.click(syncButton);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    const arg = vi.mocked(toast.error).mock.calls[0]?.[0];
    expect(typeof arg).toBe("string");
    expect(arg).toBe("Ascora rejected the request");

    // Part 2: the UI must drive the canonical static-key route, never the
    // generic OAuth sync that authenticates with bearer tokens Ascora
    // never issues.
    expect(calls.some((c) => c.url === "/api/ascora/sync")).toBe(true);
    expect(
      calls.some((c) => c.url.includes("/api/integrations/oauth/ascora/sync")),
    ).toBe(false);

    // The page survived — it still renders rather than unmounting on throw.
    expect(screen.getByText("AI Providers")).toBeInTheDocument();
  });
});

describe("IntegrationsPage — AI provider categorisation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not render an external job/accounting provider under AI Providers", async () => {
    // Ascora owns an Integration row for legacy bookkeeping. Workspace
    // provider-connections are the AI SSOT, so that row must never appear
    // in the AI Providers section.
    mountAscora({
      legacyIntegrations: [
        {
          id: "int-ascora",
          name: "Ascora",
          provider: "ASCORA",
          status: "CONNECTED",
        },
      ],
      ascoraStatus: CONNECTED_ASCORA,
    });

    render(<IntegrationsPage />);

    expect(await screen.findByText("AI Providers")).toBeInTheDocument();
    expect(
      await screen.findByText("No AI integrations yet"),
    ).toBeInTheDocument();
  });

  it("does not render an arbitrary non-AI Integration row with AI key controls", async () => {
    // Excluding the known external providers is not enough: the legacy
    // `provider` column is unreliable (an AI row can carry XERO), so an
    // unrecognised row must be excluded by the positive discriminator too —
    // it must never reach the AI card's "Update Key" / "Disconnect" controls.
    mountAscora({
      legacyIntegrations: [
        {
          id: "int-mystery",
          name: "Some Internal Connector",
          provider: "XERO",
          status: "CONNECTED",
        },
      ],
      ascoraStatus: { integration: null },
    });

    render(<IntegrationsPage />);

    expect(
      await screen.findByText("No AI integrations yet"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Some Internal Connector"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update Key" }),
    ).not.toBeInTheDocument();
  });

  it("still renders a genuine AI provider row", async () => {
    // Positive control: the discriminator is not vacuously excluding
    // everything — a known AI row still renders with its key controls.
    mountAscora({
      legacyIntegrations: [
        {
          id: "int-claude",
          name: "Anthropic Claude",
          provider: "XERO",
          status: "CONNECTED",
        },
      ],
      ascoraStatus: { integration: null },
    });

    render(<IntegrationsPage />);

    expect(await screen.findByText("Anthropic Claude")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update Key" }),
    ).toBeInTheDocument();
  });
});
