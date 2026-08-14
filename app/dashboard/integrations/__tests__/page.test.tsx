// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/**
 * Mount the page with a connected Ascora integration.
 *
 * `/api/integrations` feeds BOTH the external provider statuses and the
 * legacy AI-key list, which is why an Ascora row could surface under
 * "AI Providers". `syncResponse` drives what the Ascora sync returns.
 */
function mountWithConnectedAscora(syncResponse: {
  ok: boolean;
  status: number;
  body: unknown;
}) {
  const calledUrls: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      calledUrls.push(url);

      if (url === "/api/integrations") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            integrations: [
              {
                id: "int-ascora",
                name: "Ascora",
                provider: "ASCORA",
                status: "CONNECTED",
              },
            ],
          }),
        };
      }
      if (url === "/api/user/profile") {
        return { ok: true, json: async () => ({ profile: {} }) };
      }
      if (url === "/api/dr-nrpg/connect") {
        return { ok: true, json: async () => ({ integration: null }) };
      }
      if (url === "/api/ascora/sync") {
        return {
          ok: syncResponse.ok,
          status: syncResponse.status,
          json: async () => syncResponse.body,
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );

  return calledUrls;
}

describe("IntegrationsPage — Ascora sync error rendering (RA toast regression)", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it("renders a readable message from the structured error envelope instead of crashing", async () => {
    // The apiError envelope: { error: { code, message, eventId } }. Passing
    // this object straight to react-hot-toast throws "Objects are not valid
    // as a React child" and takes down the whole integrations page.
    const calledUrls = mountWithConnectedAscora({
      ok: false,
      status: 500,
      body: {
        error: {
          code: "UPSTREAM_FAILED",
          message: "Ascora rejected the request",
          eventId: "evt_123",
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
    expect(calledUrls).toContain("/api/ascora/sync");
    expect(
      calledUrls.some((u) => u.includes("/api/integrations/oauth/ascora/sync")),
    ).toBe(false);

    // The page survived — it still renders rather than unmounting on throw.
    expect(screen.getByText("AI Providers")).toBeInTheDocument();
  });

  it("still renders the legacy string error shape", async () => {
    mountWithConnectedAscora({
      ok: false,
      status: 500,
      body: { error: "Legacy flat message" },
    });

    render(<IntegrationsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Sync/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toBe(
      "Legacy flat message",
    );
  });

  it("falls back to a static message when the body carries no usable error", async () => {
    mountWithConnectedAscora({ ok: false, status: 500, body: {} });

    render(<IntegrationsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Sync/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toBe("Sync failed");
  });
});

describe("IntegrationsPage — AI provider categorisation", () => {
  it("does not render an external job/accounting provider under AI Providers", async () => {
    // Ascora owns an Integration row for legacy bookkeeping. Workspace
    // provider-connections are the AI SSOT, so that row must never appear
    // in the AI Providers section.
    mountWithConnectedAscora({ ok: true, status: 200, body: {} });

    render(<IntegrationsPage />);

    expect(await screen.findByText("AI Providers")).toBeInTheDocument();
    expect(
      await screen.findByText("No AI integrations yet"),
    ).toBeInTheDocument();
  });
});
