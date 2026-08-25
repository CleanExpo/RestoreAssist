// @vitest-environment jsdom
/**
 * Launch-night: the AI-key setup banner.
 *
 * `/api/onboarding/status` marks `ai_provider` as the one REQUIRED step —
 * without a key, report generation returns 402 and the trial cannot produce
 * the thing it was advertised for. But the dashboard only redirected to
 * onboarding when the URL carried `?welcome=1`:
 *
 *     const isWelcome = searchParams?.get("welcome") === "1";
 *     if (!isWelcome) return;                     // app/dashboard/page.tsx
 *
 * So a user who signed up, got distracted, and came back the next day landed
 * on a dashboard with no indication of why reports fail. `OnboardingModal` is
 * mounted nowhere and `OnboardingGuide` only on pricing-config, so nothing
 * else covered the returning-user case.
 *
 * This banner is persistent: it renders whenever the step is outstanding, on
 * every dashboard visit, and disappears the moment the key is added.
 */

import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AiKeySetupBanner } from "../AiKeySetupBanner";

function mockStatus(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }) as unknown as typeof fetch;
}

const INCOMPLETE = {
  isComplete: false,
  incompleteSteps: ["ai_provider"],
  steps: {
    ai_provider: {
      completed: false,
      required: true,
      title: "Add your Anthropic or OpenAI API key",
      description: "An Anthropic or OpenAI API key is required to operate RestoreAssist.",
      route: "/dashboard/settings/ai-providers",
    },
  },
};

describe("AiKeySetupBanner", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("tells the user reports are blocked, and links them to the fix", async () => {
    mockStatus(INCOMPLETE);
    render(<AiKeySetupBanner />);

    // The value of the banner is that it names the CONSEQUENCE, not just the
    // task — "add a key" alone doesn't explain why the report button failed.
    // Apostrophe-agnostic: the UI uses a typographic \u2019, which is correct.
    expect(
      await screen.findByText(/can.t generate reports yet/i),
    ).toBeTruthy();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/dashboard/settings/ai-providers");
  });

  it("disappears once the key is added", async () => {
    mockStatus({
      isComplete: true,
      incompleteSteps: [],
      steps: { ai_provider: { completed: true, required: true } },
    });
    const { container } = render(<AiKeySetupBanner />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("stays hidden while the status is still loading", () => {
    mockStatus(INCOMPLETE);
    const { container } = render(<AiKeySetupBanner />);
    // Nothing before the fetch resolves — no flash of a scary banner for a
    // user who has already completed setup.
    expect(container.textContent).toBe("");
  });

  it("renders nothing when the status call fails — never blocks the dashboard", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const { container } = render(<AiKeySetupBanner />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("does not render when ai_provider is absent from the payload", async () => {
    mockStatus({ isComplete: false, incompleteSteps: ["business_profile"], steps: {} });
    const { container } = render(<AiKeySetupBanner />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
