// @vitest-environment jsdom
/**
 * Every API failure toast on the integrations page must be normalised through
 * lib/api-error-message.ts.
 *
 * Two shapes are live at once during the apiError envelope rollout:
 *   legacy     { error: "Something readable" }
 *   structured { error: { code, message, eventId } }
 *
 * Reading `data.error` directly renders "[object Object]" for the structured
 * shape — or crashes React if the object reaches JSX. These tests pin both
 * shapes to the same readable string.
 */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";

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
  default: { error: vi.fn(), success: vi.fn() },
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

vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));

import IntegrationsPage from "../page";

const toastError = toast.error as unknown as ReturnType<typeof vi.fn>;

/** Xero connected, everything else absent, so exactly one Sync button exists. */
function stubFetch(overrides: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url in overrides) return overrides[url];
      if (url === "/api/integrations") {
        return {
          ok: true,
          json: async () => ({
            integrations: [
              {
                id: "int_xero",
                name: "Xero",
                provider: "XERO",
                status: "CONNECTED",
              },
            ],
          }),
        };
      }
      if (url === "/api/user/profile") {
        return {
          ok: true,
          json: async () => ({ profile: { subscriptionStatus: "ACTIVE" } }),
        };
      }
      if (url === "/api/dr-nrpg/connect") {
        return { ok: true, json: async () => ({ integration: null }) };
      }
      if (url === "/api/ascora/connect") {
        return { ok: true, json: async () => ({ integration: null }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
}

async function clickXeroSync() {
  render(<IntegrationsPage />);
  const syncButton = await screen.findByRole("button", { name: /^Sync$/ });
  fireEvent.click(syncButton);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("integrations page — API failure toasts", () => {
  it("surfaces the message from a structured apiError envelope on sync", async () => {
    stubFetch({
      "/api/integrations/oauth/xero/sync": {
        ok: false,
        status: 500,
        json: async () => ({
          error: {
            code: "UPSTREAM",
            message: "Xero rejected the sync request",
            eventId: "evt_1",
          },
        }),
      },
    });

    await clickXeroSync();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Xero rejected the sync request"),
    );
    expect(toastError).not.toHaveBeenCalledWith("[object Object]");
  });

  it("surfaces a legacy string error body on sync", async () => {
    stubFetch({
      "/api/integrations/oauth/xero/sync": {
        ok: false,
        status: 500,
        json: async () => ({ error: "Sync token has expired" }),
      },
    });

    await clickXeroSync();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Sync token has expired"),
    );
  });

  it("falls back to a readable default when the body carries no usable message", async () => {
    stubFetch({
      "/api/integrations/oauth/xero/sync": {
        ok: false,
        status: 500,
        json: async () => ({}),
      },
    });

    await clickXeroSync();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Sync failed"));
  });

  it("surfaces a structured message from a 403 that is not an upgrade prompt", async () => {
    stubFetch({
      "/api/integrations/oauth/xero/sync": {
        ok: false,
        status: 403,
        json: async () => ({
          error: { code: "FORBIDDEN", message: "Workspace is suspended" },
        }),
      },
    });

    await clickXeroSync();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Workspace is suspended"),
    );
  });

  it("surfaces a structured message when disconnecting fails", async () => {
    stubFetch({
      "/api/integrations/oauth/xero/disconnect": {
        ok: false,
        status: 500,
        json: async () => ({
          error: { code: "INTERNAL", message: "Could not revoke the token" },
        }),
      },
    });

    render(<IntegrationsPage />);
    const disconnectButton = await screen.findByRole("button", {
      name: /^Disconnect$/,
    });
    fireEvent.click(disconnectButton);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Could not revoke the token"),
    );
  });
});
