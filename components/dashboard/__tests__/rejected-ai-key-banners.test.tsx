// @vitest-environment jsdom
/**
 * RA-7428: a stored key that failed validation must produce ONE dashboard
 * warning that says it was rejected — not the two stacked "add a key"
 * banners Phill saw on 25/8.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AiProviderBanner } from "../AiProviderBanner";
import { AiKeySetupBanner } from "../AiKeySetupBanner";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

const rejectedStatus = {
  isComplete: false,
  incompleteSteps: ["ai_provider"],
  nextStep: "ai_provider",
  steps: {
    ai_provider: {
      completed: false,
      required: true,
      title: "Your Anthropic key was rejected on 25 Aug 2026",
      description:
        "The stored key failed validation. Replace it to generate reports.",
      route: "/dashboard/settings/ai-providers?provider=ANTHROPIC",
      rejectedKey: {
        provider: "ANTHROPIC",
        rejectedAt: "2026-08-25T00:00:00.000Z",
      },
    },
  },
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => rejectedStatus,
  });
});

describe("rejected stored AI key — dashboard banners (RA-7428)", () => {
  it("shows one rejected warning and one Replace key button, not two add-a-key banners", async () => {
    render(
      <>
        <AiProviderBanner />
        <AiKeySetupBanner />
      </>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Your Anthropic key was rejected on 25 Aug 2026/),
      ).toBeInTheDocument(),
    );

    expect(screen.getAllByText(/Your Anthropic key was rejected/)).toHaveLength(
      1,
    );
    expect(screen.getByRole("link", { name: "Replace key" })).toHaveAttribute(
      "href",
      "/dashboard/settings/ai-providers?provider=ANTHROPIC",
    );
    expect(screen.queryByRole("link", { name: "Add AI key" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add your key" })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Reports will not generate without an AI key/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/add your AI key/i)).not.toBeInTheDocument();
  });
});
