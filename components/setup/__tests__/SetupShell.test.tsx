// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Finishing setup re-mints the NextAuth JWT before navigating (the setup gate
// in proxy.ts reads `setupCompletedAt` off the token), so the shell needs a
// session context.
const updateSession = vi.fn().mockResolvedValue(null);
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "authenticated", update: updateSession }),
}));

// Stub the heavy card children so only SetupShell's wiring (item construction +
// stepper integration) is under test.
vi.mock("../VideoExplainer", () => ({ VideoExplainer: () => <div>VIDEO_BODY</div> }));
vi.mock("../AiKeyCard", () => ({ AiKeyCard: () => <div>AIKEY_BODY</div> }));
vi.mock("../BusinessDetailsCard", () => ({ BusinessDetailsCard: () => <div>BIZ_BODY</div> }));
vi.mock("../BrandCard", () => ({ BrandCard: () => <div>BRAND_BODY</div> }));
vi.mock("../PricingCard", () => ({ PricingCard: () => <div>PRICING_BODY</div> }));
vi.mock("../IntegrationsCard", () => ({ IntegrationsCard: () => <div>INTEG_BODY</div> }));
vi.mock("../FeatureHealthCard", () => ({ FeatureHealthCard: () => <div>HEALTH_BODY</div> }));

const storeState: {
  org: Record<string, unknown> | null;
  setOrg: ReturnType<typeof vi.fn>;
  setSectionStatus: ReturnType<typeof vi.fn>;
} = { org: null, setOrg: vi.fn(), setSectionStatus: vi.fn() };
vi.mock("../store", () => ({
  useSetupStore: (selector: (s: typeof storeState) => unknown) =>
    selector(storeState),
}));

import { SetupShell } from "../SetupShell";
import { activationErrorMessage } from "@/lib/setup/activation-error";

const initial = { id: "o1", hydrationJobs: [] } as never;

beforeEach(() => {
  storeState.org = null;
  storeState.setOrg.mockClear();
  storeState.setSectionStatus.mockClear();
  // mockReset, not mockClear: the ordering test installs a deferred
  // implementation that never settles on its own, and leaking that into the
  // next test hangs it.
  updateSession.mockReset();
  updateSession.mockResolvedValue(null);
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
    expect(await screen.findByText(/Step 1 of 7: Welcome/)).toBeInTheDocument();
    expect(screen.getByText("VIDEO_BODY")).toBeInTheDocument();
    // Later steps' bodies are NOT mounted yet (locked one-step-at-a-time).
    expect(screen.queryByText("AIKEY_BODY")).not.toBeInTheDocument();
    expect(screen.queryByText("BIZ_BODY")).not.toBeInTheDocument();
  });

  it("advances from the optional Welcome step to the AI-key step", async () => {
    render(<SetupShell initial={initial} />);
    await screen.findByText(/Step 1 of 7: Welcome/);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/Step 2 of 7: Add your AI key/)).toBeInTheDocument();
    expect(screen.getByText("AIKEY_BODY")).toBeInTheDocument();
    // AI-key is required + incomplete (status stub → completed:false) → locked.
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(
      screen.getByText(/complete this step to continue/i),
    ).toBeInTheDocument();
  });

  it("restores a completed New Zealand business step without an ABR hydration job", async () => {
    const nzInitial = {
      id: "nz-org",
      country: "NZ",
      timezone: "Pacific/Auckland",
      legalName: "Aotearoa Restoration Limited",
      nzbn: "9429031234566",
      state: "Auckland",
      hydrationJobs: [],
    } as never;

    render(<SetupShell initial={nzInitial} />);

    await waitFor(() => {
      expect(storeState.setSectionStatus).toHaveBeenCalledWith(
        "businessDetails",
        "ready",
      );
    });
  });
});

/**
 * The terminal CTA is the finish path essentially every operator takes.
 * Before this it only navigated — `POST /api/setup/activate` was reachable
 * ONLY from the Activate button inside FeatureHealthCard, which sits in the
 * *optional* Integrations step. With `SETUP_WIZARD_ENABLED=true` an operator
 * who skipped the optional steps never set `setupCompletedAt`, and the setup
 * gate in proxy.ts redirected every dashboard path back to /setup forever.
 */
describe("SetupShell — the finish CTA completes setup", () => {
  const ORIGINAL_LOCATION = window.location;
  let assign: ReturnType<typeof vi.fn>;

  /** Route the shell's two fetches; `activate` decides the activation reply. */
  function stubFetch(activate: () => Promise<unknown> | unknown) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string }) => {
        calls.push(String(url));
        if (String(url).includes("/api/setup/activate")) {
          expect(init?.method).toBe("POST");
          return activate();
        }
        return {
          ok: true,
          json: async () => ({ steps: { ai_provider: { completed: true } } }),
        };
      }),
    );
    return calls;
  }

  /** Walk the locked wizard to its last step with both required steps done. */
  async function reachFinalStep() {
    render(<SetupShell initial={initial} />);
    await screen.findByText(/Step 1 of 7/);
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    }
    return screen.findByRole("button", {
      name: /generate your first report/i,
    });
  }

  beforeEach(() => {
    // Required-step completion: business details come from the store, the AI
    // key from /api/onboarding/status (stubbed complete in stubFetch).
    storeState.org = {
      legalName: "Acme Restoration",
      country: "AU",
      abn: "12345678901",
      state: "NSW",
      timezone: "Australia/Sydney",
    };
    assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...ORIGINAL_LOCATION, assign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: ORIGINAL_LOCATION,
    });
  });

  it("activates, refreshes the session, THEN navigates to the first report", async () => {
    const order: string[] = [];
    const calls = stubFetch(() => {
      order.push("activate");
      return { ok: true, status: 200, json: async () => ({ data: {} }) };
    });

    // The refresh is held open deliberately. Recording only when the mocks are
    // CALLED would let a fire-and-forget mutant (dropping the `await`) produce
    // the same order array and survive — and that mutant is precisely the
    // navigate-before-the-cookie-is-re-minted race this change exists to fix.
    // Gating on completion is what makes this control able to fail.
    let releaseRefresh!: () => void;
    updateSession.mockImplementation(() => {
      order.push("refreshSession:start");
      return new Promise((resolve) => {
        releaseRefresh = () => {
          order.push("refreshSession:done");
          resolve(null);
        };
      });
    });
    assign.mockImplementation(() => order.push("navigate"));

    fireEvent.click(await reachFinalStep());

    await waitFor(() => expect(order).toContain("refreshSession:start"));
    // Nothing may navigate while the refresh is still in flight.
    expect(assign).not.toHaveBeenCalled();

    releaseRefresh();

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/dashboard/reports/new"));
    expect(calls.some((u) => u.includes("/api/setup/activate"))).toBe(true);
    expect(order).toEqual([
      "activate",
      "refreshSession:start",
      "refreshSession:done",
      "navigate",
    ]);
  });

  it("treats 409 'already activated' as success rather than a dead end", async () => {
    stubFetch(() => ({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "CONFLICT", message: "Setup already activated" } }),
    }));

    fireEvent.click(await reachFinalStep());

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/dashboard/reports/new"));
    expect(updateSession).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("names the blocking capabilities and does NOT navigate when pre-flight fails", async () => {
    stubFetch(() => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: "Pre-flight checks failed",
        failedChecks: [
          { capability: "cloud_storage", label: "Cloud storage", note: "not connected" },
          { capability: "accounting", label: "Accounting", note: "token rejected" },
        ],
      }),
    }));

    fireEvent.click(await reachFinalStep());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Cloud storage, Accounting");
    expect(assign).not.toHaveBeenCalled();
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("does not navigate when activation throws (network failure)", async () => {
    stubFetch(() => {
      throw new Error("offline");
    });

    fireEvent.click(await reachFinalStep());

    await screen.findByRole("alert");
    expect(assign).not.toHaveBeenCalled();
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("does not navigate when the session refresh fails", async () => {
    stubFetch(() => ({ ok: true, status: 200, json: async () => ({ data: {} }) }));
    updateSession.mockRejectedValueOnce(new Error("session refresh failed"));

    fireEvent.click(await reachFinalStep());

    await screen.findByRole("alert");
    // Navigating on a JWT we know is stale would land the operator in the
    // /setup ↔ /dashboard redirect loop this whole change exists to prevent.
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("activationErrorMessage", () => {
  it("prefers the failed-capability labels over the generic error string", () => {
    expect(
      activationErrorMessage(400, {
        error: "Pre-flight checks failed",
        failedChecks: [{ label: "Cloud storage" }, { label: "Accounting" }],
      }),
    ).toBe("Setup can't finish yet — Cloud storage, Accounting need attention.");
  });

  it("reads the RA-1548 envelope's nested message", () => {
    expect(
      activationErrorMessage(404, {
        error: { code: "NOT_FOUND", message: "No organization for this user" },
      }),
    ).toBe("No organization for this user");
  });

  it("reads a raw string error body", () => {
    expect(activationErrorMessage(400, { error: "Pre-flight checks failed" })).toBe(
      "Pre-flight checks failed",
    );
  });

  it("falls back to the status when the body is unusable", () => {
    for (const body of [null, undefined, {}, { error: "   " }, { error: {} }, "nonsense"]) {
      expect(activationErrorMessage(500, body)).toBe(
        "Could not finish setup (500). Please try again.",
      );
    }
  });

  it("ignores malformed failedChecks entries rather than emitting a blank list", () => {
    // No usable label survives, so it must fall through to the body's own
    // error string — never emit "— , , need attention."
    const msg = activationErrorMessage(400, {
      error: "Pre-flight checks failed",
      failedChecks: [null, { label: "" }, { label: "  " }, { note: "no label" }],
    });
    expect(msg).toBe("Pre-flight checks failed");
    expect(msg).not.toMatch(/need attention/);
  });

  it("drops only the malformed entries when some labels are usable", () => {
    expect(
      activationErrorMessage(400, {
        error: "Pre-flight checks failed",
        failedChecks: [null, { label: "Accounting" }, { label: "  " }],
      }),
    ).toBe("Setup can't finish yet — Accounting need attention.");
  });

  it("falls back to the status when failedChecks is not an array", () => {
    expect(activationErrorMessage(400, { failedChecks: "Cloud storage" })).toBe(
      "Could not finish setup (400). Please try again.",
    );
  });
});
