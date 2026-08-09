// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
        if (url === "/api/ascora/connect") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ integration: null }),
          };
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

  it("uses canonical per-user Ascora status instead of a stale generic connection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/integrations") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              integrations: [
                {
                  id: "stale-ascora-row",
                  name: "Ascora legacy row",
                  provider: "ASCORA",
                  status: "CONNECTED",
                  createdAt: "2026-08-10T00:00:00.000Z",
                  updatedAt: "2026-08-10T00:00:00.000Z",
                },
              ],
            }),
          };
        }
        if (url === "/api/ascora/connect") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ integration: null }),
          };
        }
        if (url === "/api/user/profile") {
          return { ok: true, status: 200, json: async () => ({ profile: {} }) };
        }
        if (url === "/api/dr-nrpg/connect") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ integration: null }),
          };
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<IntegrationsPage />);

    const description = await screen.findByText(
      "Import work orders + line-item history from Ascora for scope generation.",
    );
    const ascoraCard = description.closest('[data-slot="card"]');
    expect(ascoraCard).not.toBeNull();

    await waitFor(() =>
      expect(
        within(ascoraCard as HTMLElement).getByRole("button", {
          name: /connect/i,
        }),
      ).toBeEnabled(),
    );
    expect(
      within(ascoraCard as HTMLElement).queryByRole("button", { name: "Sync" }),
    ).not.toBeInTheDocument();
  });

  it("fails Ascora status closed without hiding healthy provider statuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/integrations") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ integrations: [] }),
          };
        }
        if (url === "/api/ascora/connect") {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        if (url === "/api/user/profile") {
          return { ok: true, status: 200, json: async () => ({ profile: {} }) };
        }
        if (url === "/api/dr-nrpg/connect") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ integration: null }),
          };
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<IntegrationsPage />);

    expect(
      await screen.findByText(
        "Ascora status is unavailable. Retry before connecting or disconnecting.",
      ),
    ).toBeInTheDocument();

    const ascoraDescription = screen.getByText(
      "Import work orders + line-item history from Ascora for scope generation.",
    );
    const ascoraCard = ascoraDescription.closest(
      '[data-slot="card"]',
    ) as HTMLElement;
    expect(
      within(ascoraCard).getByRole("button", { name: "Status unavailable" }),
    ).toBeDisabled();

    const xeroDescription = screen.getByText(
      "Auto-sync invoices + payments — saves ~3 hrs/week of manual entry. Most popular for AU contractors.",
    );
    const xeroCard = xeroDescription.closest(
      '[data-slot="card"]',
    ) as HTMLElement;
    expect(
      within(xeroCard).getByRole("button", { name: /connect/i }),
    ).toBeEnabled();
  });

  it("connects Ascora through the API-key endpoint instead of generic OAuth", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          if (url === "/api/integrations") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ integrations: [] }),
            };
          }
          if (url === "/api/ascora/connect" && init?.method === "POST") {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                message: "Ascora connected",
              }),
            };
          }
          if (url === "/api/ascora/connect") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ integration: null }),
            };
          }
          if (url === "/api/user/profile") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ profile: {} }),
            };
          }
          if (url === "/api/dr-nrpg/connect") {
            return {
              ok: true,
              status: 200,
              json: async () => ({ integration: null }),
            };
          }
          throw new Error(`Unexpected request: ${url}`);
        },
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<IntegrationsPage />);

    const description = await screen.findByText(
      "Import work orders + line-item history from Ascora for scope generation.",
    );
    const ascoraCard = description.closest('[data-slot="card"]') as HTMLElement;
    await waitFor(() =>
      expect(
        within(ascoraCard).getByRole("button", { name: /connect/i }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      within(ascoraCard).getByRole("button", { name: /connect/i }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Connect Ascora",
    });
    fireEvent.change(within(dialog).getByLabelText("Ascora API Key"), {
      target: { value: "mock-ascora-api-key" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/ascora/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "mock-ascora-api-key" }),
      }),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input]) => String(input) === "/api/integrations/oauth/ascora/connect",
      ),
    ).toBe(false);
  });

  it("syncs a connected Ascora account through the canonical incremental endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/integrations") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ integrations: [] }),
          };
        }
        if (url === "/api/ascora/connect") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              integration: {
                id: "ascora-user-integration",
                isActive: true,
                lastSyncAt: null,
                totalJobsImported: 12,
              },
            }),
          };
        }
        if (url === "/api/ascora/sync?incremental=true") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, jobsImported: 2 }),
          };
        }
        if (url === "/api/user/profile") {
          return { ok: true, status: 200, json: async () => ({ profile: {} }) };
        }
        if (url === "/api/dr-nrpg/connect") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ integration: null }),
          };
        }
        throw new Error(`Unexpected request: ${url}`);
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<IntegrationsPage />);

    const description = await screen.findByText(
      "Import work orders + line-item history from Ascora for scope generation.",
    );
    const ascoraCard = description.closest('[data-slot="card"]') as HTMLElement;
    const syncButton = await within(ascoraCard).findByRole("button", {
      name: "Sync",
    });
    fireEvent.click(syncButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ascora/sync?incremental=true",
        { method: "POST" },
      ),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input]) => String(input) === "/api/integrations/oauth/ascora/sync",
      ),
    ).toBe(false);
  });
});
