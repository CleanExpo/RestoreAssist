// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// RA-7427: "Skip setup for now" activates the organisation without the
// red-check gate, re-mints the JWT (the setup gate reads setupCompletedAt off
// the token), then does a full document load of /dashboard. Same ordering
// discipline as the finish CTA: activate → refresh → navigate.
const updateSession = vi.fn().mockResolvedValue(null);
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "authenticated", update: updateSession }),
}));

vi.mock("../VideoExplainer", () => ({ VideoExplainer: () => <div>VIDEO_BODY</div> }));
vi.mock("../AiKeyCard", () => ({ AiKeyCard: () => <div>AIKEY_BODY</div> }));
vi.mock("../BusinessDetailsCard", () => ({ BusinessDetailsCard: () => <div>BIZ_BODY</div> }));
vi.mock("../BrandCard", () => ({ BrandCard: () => <div>BRAND_BODY</div> }));
vi.mock("../PricingCard", () => ({ PricingCard: () => <div>PRICING_BODY</div> }));
vi.mock("../IntegrationsCard", () => ({ IntegrationsCard: () => <div>INTEG_BODY</div> }));
vi.mock("../FeatureHealthCard", () => ({ FeatureHealthCard: () => <div>HEALTH_BODY</div> }));

const storeState = { org: null as Record<string, unknown> | null, setOrg: vi.fn(), setSectionStatus: vi.fn() };
vi.mock("../store", () => ({
  useSetupStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

import { SetupShell } from "../SetupShell";

const initial = { id: "o1", hydrationJobs: [] } as never;
const ORIGINAL_LOCATION = window.location;
let assign: ReturnType<typeof vi.fn>;

function stubFetch(activate: () => Promise<unknown> | unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/api/setup/activate")) return activate();
      return { ok: true, json: async () => ({ steps: { ai_provider: { completed: false } } }) };
    }),
  );
  return calls;
}

beforeEach(() => {
  storeState.org = null;
  updateSession.mockReset();
  updateSession.mockResolvedValue(null);
  assign = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...ORIGINAL_LOCATION, assign } });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: ORIGINAL_LOCATION });
});

describe("SetupShell — Skip setup for now (RA-7427)", () => {
  it("from the locked AI-key step: posts skip, refreshes the session, then loads /dashboard", async () => {
    const order: string[] = [];
    const calls = stubFetch(() => {
      order.push("activate");
      return { ok: true, json: async () => ({ data: { organizationId: "o1", redirectTo: "/dashboard" } }) };
    });
    updateSession.mockImplementation(async () => { order.push("refresh"); return null; });
    assign.mockImplementation(() => order.push("navigate"));

    render(<SetupShell initial={initial} />);
    await screen.findByText(/Step 1 of 7/);
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(await screen.findByText(/Step 2 of 7/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /skip setup for now/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/dashboard"));
    const activate = calls.find((c) => c.url.includes("/api/setup/activate"));
    expect(activate?.init?.method).toBe("POST");
    expect(JSON.parse(String(activate?.init?.body))).toEqual({ skip: true });
    expect(order).toEqual(["activate", "refresh", "navigate"]);
  });

  it("treats 409 'already activated' as success", async () => {
    stubFetch(() => ({ ok: false, status: 409, json: async () => ({ error: { code: "CONFLICT" } }) }));
    render(<SetupShell initial={initial} />);
    await screen.findByText(/Step 1 of 7/);
    fireEvent.click(screen.getByRole("button", { name: /skip setup for now/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/dashboard"));
  });

  it("surfaces a server refusal in place and does not navigate", async () => {
    stubFetch(() => ({ ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) }));
    render(<SetupShell initial={initial} />);
    await screen.findByText(/Step 1 of 7/);
    fireEvent.click(screen.getByRole("button", { name: /skip setup for now/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
    expect(updateSession).not.toHaveBeenCalled();
  });
});
