// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import OnboardingClient from "../OnboardingClient";

// The server's canonical 6-step response (subset of fields the client reads).
function statusResponse() {
  const s = (
    title: string,
    route: string,
    completed = false,
    required = false,
  ) => ({ title, route, completed, required, description: `${title} desc` });
  return {
    isComplete: false,
    incompleteSteps: ["business_profile", "pricing_config"],
    nextStep: "business_profile",
    steps: {
      ai_provider: s("Add your Anthropic or OpenAI API key", "/dashboard/settings/ai-providers", true, false),
      first_inspection: s("Create your first inspection", "/dashboard/inspections/new"),
      first_report: s("Generate your first report", "/dashboard/reports/new"),
      business_profile: s("Settings & Profile", "/dashboard/settings", false, true),
      pricing_config: s("Pricing Configuration", "/dashboard/pricing-config", false, true),
      property_data: s("Connect Property Data", "/dashboard/integrations"),
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("OnboardingClient", () => {
  it("renders exactly the server's canonical steps with no contradicting duplicates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => statusResponse(),
      }) as never,
    );

    render(<OnboardingClient />);

    // Canonical server step renders...
    await waitFor(() =>
      expect(screen.getByText("Pricing Configuration")).toBeInTheDocument(),
    );

    // ...and the stale FALLBACK_STEPS titles/ids must NOT be injected alongside
    // it (the bug: "Configure pricing" duplicated "Pricing Configuration", and
    // "Connect an integration" duplicated "Connect Property Data").
    expect(screen.queryByText("Configure pricing")).not.toBeInTheDocument();
    expect(screen.queryByText("Connect an integration")).not.toBeInTheDocument();

    // Header reflects the server's step count (6), not 6 + fallback extras.
    expect(screen.getByText(/of 6 steps complete/i)).toBeInTheDocument();
  });

  it("falls back to the static list only when the status API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as never,
    );

    render(<OnboardingClient />);

    // On error the fallback list IS shown (its titles appear).
    await waitFor(() =>
      expect(screen.getByText("Complete business profile")).toBeInTheDocument(),
    );
    expect(screen.getByText("Configure pricing")).toBeInTheDocument();
  });
});
