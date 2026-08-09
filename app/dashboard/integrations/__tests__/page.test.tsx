// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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
