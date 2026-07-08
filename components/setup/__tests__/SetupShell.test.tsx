// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// Stub the heavy card children so only SetupShell's wiring (item construction +
// stepper integration) is under test.
vi.mock("../VideoExplainer", () => ({ VideoExplainer: () => <div>VIDEO_BODY</div> }));
vi.mock("../AiKeyCard", () => ({ AiKeyCard: () => <div>AIKEY_BODY</div> }));
vi.mock("../BusinessDetailsCard", () => ({ BusinessDetailsCard: () => <div>BIZ_BODY</div> }));
vi.mock("../BrandCard", () => ({ BrandCard: () => <div>BRAND_BODY</div> }));
vi.mock("../PricingCard", () => ({ PricingCard: () => <div>PRICING_BODY</div> }));
vi.mock("../StorageCard", () => ({ StorageCard: () => <div>STORAGE_BODY</div> }));
vi.mock("../DatabaseCard", () => ({ DatabaseCard: () => <div>DB_BODY</div> }));
vi.mock("../IntegrationsCard", () => ({ IntegrationsCard: () => <div>INTEG_BODY</div> }));
vi.mock("../FeatureHealthCard", () => ({ FeatureHealthCard: () => <div>HEALTH_BODY</div> }));

const storeState = { org: null, setOrg: vi.fn(), setSectionStatus: vi.fn() };
vi.mock("../store", () => ({
  useSetupStore: (selector: (s: typeof storeState) => unknown) =>
    selector(storeState),
}));

import { SetupShell } from "../SetupShell";

const initial = { id: "o1", hydrationJobs: [] } as never;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ steps: { ai_provider: { completed: false } } }),
    }),
  );
});

describe("SetupShell — one-step wizard wiring", () => {
  it("renders the wizard starting at the Welcome step (one step visible)", async () => {
    render(<SetupShell initial={initial} />);
    expect(await screen.findByText(/Step 1 of 8: Welcome/)).toBeInTheDocument();
    expect(screen.getByText("VIDEO_BODY")).toBeInTheDocument();
    // Later steps' bodies are NOT mounted yet (locked one-step-at-a-time).
    expect(screen.queryByText("AIKEY_BODY")).not.toBeInTheDocument();
    expect(screen.queryByText("BIZ_BODY")).not.toBeInTheDocument();
  });

  it("advances from the optional Welcome step to the AI-key step", async () => {
    render(<SetupShell initial={initial} />);
    await screen.findByText(/Step 1 of 8: Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/Step 2 of 8: Add your AI key/)).toBeInTheDocument();
    expect(screen.getByText("AIKEY_BODY")).toBeInTheDocument();
    // AI-key is required + incomplete (status stub → completed:false) → locked.
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(
      screen.getByText(/complete this step to continue/i),
    ).toBeInTheDocument();
  });
});
