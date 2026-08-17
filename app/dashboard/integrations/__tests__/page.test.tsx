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
        // Both status sources down, stated explicitly rather than leaning on
        // the unexpected-request throw: this is the total-outage case.
        if (url === "/api/ascora/connect") {
          return { ok: false, status: 503, json: async () => ({}) };
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
  /** Fail GET /api/integrations only — the four OAuth providers' source. */
  genericStatusFails?: boolean;
  /** Fail GET /api/ascora/connect only — Ascora's source. */
  ascoraStatusFails?: boolean;
}): FetchCall[] {
  const {
    legacyIntegrations = [],
    ascoraStatus = { integration: null },
    syncResponse,
    connectResponse,
    genericStatusFails = false,
    ascoraStatusFails = false,
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
            if (genericStatusFails) {
              return { ok: false, status: 503, json: async () => ({}) };
            }
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
            if (ascoraStatusFails) {
              return { ok: false, status: 500, json: async () => ({}) };
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

describe("IntegrationsPage — one status outage does not disable the others", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps Ascora actionable when the generic status source fails", async () => {
    mountAscora({
      genericStatusFails: true,
      ascoraStatus: { integration: null },
    });

    render(<IntegrationsPage />);

    // Only the four providers served by /api/integrations go dark.
    const unavailable = await screen.findAllByRole("button", {
      name: "Status unavailable",
    });
    expect(unavailable).toHaveLength(4);
    unavailable.forEach((button) => expect(button).toBeDisabled());

    // Ascora answered, so its card is still usable.
    const ascora = providerCard("Ascora");
    expect(
      within(ascora).queryByRole("button", { name: "Status unavailable" }),
    ).toBeNull();
    const connect = within(ascora).getByRole("button", { name: /Connect/i });
    expect(connect).toBeEnabled();

    // The banner names what is down without gating anything.
    expect(
      screen.getByText(
        "Some integration statuses are unavailable (Xero, MYOB, QuickBooks, ServiceM8). Every other integration is unaffected.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the generic providers actionable when the Ascora status source fails", async () => {
    mountAscora({ ascoraStatusFails: true, legacyIntegrations: [] });

    render(<IntegrationsPage />);

    const unavailable = await screen.findAllByRole("button", {
      name: "Status unavailable",
    });
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]).toBeDisabled();
    expect(
      within(providerCard("Ascora")).getByRole("button", {
        name: "Status unavailable",
      }),
    ).toBeDisabled();

    // Xero's source answered, so Xero can still be connected.
    const xero = providerCard("Xero");
    expect(
      within(xero).queryByRole("button", { name: "Status unavailable" }),
    ).toBeNull();
    expect(
      within(xero).getByRole("button", { name: /Connect/i }),
    ).toBeEnabled();

    expect(
      screen.getByText(
        "Some integration statuses are unavailable (Ascora). Every other integration is unaffected.",
      ),
    ).toBeInTheDocument();
  });
});

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

describe("IntegrationsPage — Ascora sync success receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  /** Every string this render handed to the success toast. */
  function successToasts(): string[] {
    return vi.mocked(toast.success).mock.calls.map(([arg]) => String(arg));
  }

  async function syncAscora(body: unknown) {
    mountAscora({
      ascoraStatus: CONNECTED_ASCORA,
      syncResponse: { ok: true, status: 200, body },
    });
    render(<IntegrationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Sync/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  }

  it("renders the canonical /api/ascora/sync receipt, not the generic clients/jobs contract", async () => {
    // /api/ascora/sync returns message / jobsImported / lineItemsForImport /
    // rateCardPartsUpserted and never clientsSynced / jobsSynced, so reading
    // the generic contract reports a real import as "0 clients and 0 jobs".
    const message =
      "Imported 37 jobs + 412 line items. 400 ScopePricingDatabase entries seeded with ×1.15 uplift.";
    await syncAscora({
      success: true,
      dryRun: false,
      jobsTotal: 4003,
      jobsImported: 37,
      lineItemsForImport: 412,
      rateCardPartsUpserted: 483,
      message,
    });

    expect(successToasts()).toContain(message);
    // Swept across every success call, not just the first: a renderer that
    // emits both strings must not pass this.
    successToasts().forEach((text) =>
      expect(text).not.toMatch(/0 clients and 0 jobs/),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports a healthy zero-import incremental run as success", async () => {
    // Production shape: jobsTotal 4003, jobsInWindow 0, rateCardPartsUpserted
    // 483 — HTTP 200 with jobsImported legitimately 0. A zero count is not a
    // failure, so nothing here may encode "non-zero means success".
    const message =
      "Imported 0 jobs (no line items — endpoint not found). ScopePricingDatabase seeding skipped.";
    await syncAscora({
      success: true,
      dryRun: false,
      jobsTotal: 4003,
      jobsInWindow: 0,
      jobsImported: 0,
      lineItemsForImport: 0,
      rateCardPartsUpserted: 483,
      message,
    });

    expect(successToasts()).toContain(message);
    successToasts().forEach((text) =>
      expect(text).not.toMatch(/0 clients and 0 jobs/),
    );
    expect(toast.error).not.toHaveBeenCalled();
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
