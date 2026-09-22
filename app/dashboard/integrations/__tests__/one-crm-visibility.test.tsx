// @vitest-environment jsdom
/**
 * RA-7660 (One CRM, Unit A1) — what the Integrations page lists.
 *
 * ServiceM8, MYOB and QuickBooks have never passed a real sync test, the
 * DR-NRPG referral network is not ready, and "Import Data" re-pulls through a
 * jobs path that always fails yet reports success (RA-7663). Each is behind a
 * NEXT_PUBLIC_* switch that defaults off. A provider the account has ALREADY
 * connected stays on the page with its switch off, so an existing connection
 * can still be synced or disconnected.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/capacitor", () => ({
  isCapacitorIOS: () => false,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u_test", name: "Test" } },
    status: "authenticated",
  }),
}));

import IntegrationsPage from "../page";

const FLAGS = {
  nrpg: "NEXT_PUBLIC_NRPG_ENABLED",
  servicem8: "NEXT_PUBLIC_SERVICEM8_ENABLED",
  myob: "NEXT_PUBLIC_MYOB_ENABLED",
  quickbooks: "NEXT_PUBLIC_QUICKBOOKS_ENABLED",
  importData: "NEXT_PUBLIC_IMPORT_DATA_ENABLED",
} as const;

const HIDDEN_WHEN_OFF =
  /NRPG|ServiceM8|MYOB|QuickBooks|Import Data|Referral Networks/i;

function setFlags(on: Partial<Record<keyof typeof FLAGS, boolean>>) {
  for (const [key, name] of Object.entries(FLAGS)) {
    vi.stubEnv(name, on[key as keyof typeof FLAGS] ? "true" : "");
  }
}

function mountFetch(options: {
  genericIntegrations?: unknown[];
  genericFails?: boolean;
  ascoraFails?: boolean;
  drNrpgIntegration?: unknown;
}) {
  const {
    genericIntegrations = [],
    genericFails = false,
    ascoraFails = false,
    drNrpgIntegration = null,
  } = options;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "/api/integrations") {
        if (genericFails) return { ok: false, status: 503, json: async () => ({}) };
        return {
          ok: true,
          status: 200,
          json: async () => ({ integrations: genericIntegrations }),
        };
      }
      if (url === "/api/user/profile") {
        return { ok: true, json: async () => ({ profile: {} }) };
      }
      if (url === "/api/dr-nrpg/connect") {
        return {
          ok: true,
          json: async () => ({ integration: drNrpgIntegration }),
        };
      }
      if (url === "/api/ascora/connect") {
        if (ascoraFails) return { ok: false, status: 503, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ integration: null }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
}

function providerCard(name: string): HTMLElement {
  const card = screen.getByText(name).closest('[data-slot="card"]');
  if (!card) throw new Error(`No card found for ${name}`);
  return card as HTMLElement;
}

/** Wait until every status source has answered and the cards have settled. */
async function settled() {
  await screen.findByText("Xero");
  await waitFor(() => {
    expect(
      within(providerCard("Xero")).getByRole("button", { name: /Connect/i }),
    ).toBeEnabled();
    expect(
      within(providerCard("Ascora")).getByRole("button", { name: /Connect/i }),
    ).toBeEnabled();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Integrations page with every listing switch off", () => {
  it("shows no NRPG, ServiceM8, MYOB, QuickBooks or Import Data", async () => {
    setFlags({});
    mountFetch({});
    render(<IntegrationsPage />);
    await settled();

    expect(document.body.textContent ?? "").not.toMatch(HIDDEN_WHEN_OFF);
    expect(
      screen.queryByRole("button", { name: /Import Data/i }),
    ).not.toBeInTheDocument();
    // The listed providers are still there.
    expect(providerCard("Xero")).toBeInTheDocument();
    expect(providerCard("Ascora")).toBeInTheDocument();
  });

  it("a total status outage disables only the providers it lists", async () => {
    setFlags({});
    mountFetch({ genericFails: true, ascoraFails: true });
    render(<IntegrationsPage />);

    expect(
      await screen.findByText(
        "Integration status is unavailable. Retry before connecting or disconnecting.",
      ),
    ).toBeInTheDocument();
    const unavailable = await screen.findAllByRole("button", {
      name: "Status unavailable",
    });
    expect(unavailable).toHaveLength(2);
    expect(document.body.textContent ?? "").not.toMatch(HIDDEN_WHEN_OFF);
  });

  it("a partial outage banner names only the providers it lists", async () => {
    setFlags({});
    mountFetch({ genericFails: true });
    render(<IntegrationsPage />);

    expect(
      await screen.findByText(
        "Some integration statuses are unavailable (Xero). Every other integration is unaffected.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(HIDDEN_WHEN_OFF);
  });

  it("keeps a provider the account already connected, so it can still be managed", async () => {
    setFlags({});
    mountFetch({
      genericIntegrations: [
        { provider: "QUICKBOOKS", status: "CONNECTED", lastSyncAt: null },
      ],
      drNrpgIntegration: {
        isActive: true,
        webhookUrl: "https://example.test/hook",
        lastSyncAt: null,
      },
    });
    render(<IntegrationsPage />);
    await settled();

    await waitFor(() => {
      expect(
        within(providerCard("QuickBooks")).getByRole("button", {
          name: /^Disconnect$/,
        }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("DR-NRPG")).toBeInTheDocument();

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/MYOB|ServiceM8|Import Data/);
  });
});

describe("each listing switch brings its own item back", () => {
  it.each([
    ["servicem8", ["ServiceM8"], ["MYOB", "QuickBooks", "Import Data", "DR-NRPG"]],
    ["myob", ["MYOB"], ["ServiceM8", "QuickBooks", "Import Data", "DR-NRPG"]],
    ["quickbooks", ["QuickBooks"], ["ServiceM8", "MYOB", "Import Data", "DR-NRPG"]],
    ["nrpg", ["DR-NRPG", "Referral Networks"], ["ServiceM8", "MYOB", "QuickBooks", "Import Data"]],
    ["importData", ["Import Data"], ["ServiceM8", "MYOB", "QuickBooks", "DR-NRPG"]],
  ] as const)("%s on", async (flag, shown, hidden) => {
    setFlags({ [flag]: true });
    mountFetch({});
    render(<IntegrationsPage />);
    await settled();

    const text = document.body.textContent ?? "";
    for (const s of shown) expect(text).toContain(s);
    for (const h of hidden) expect(text).not.toContain(h);
  });

  it("all switches on lists every provider, as before", async () => {
    setFlags({
      nrpg: true,
      servicem8: true,
      myob: true,
      quickbooks: true,
      importData: true,
    });
    mountFetch({ genericFails: true, ascoraFails: true });
    render(<IntegrationsPage />);

    const unavailable = await screen.findAllByRole("button", {
      name: "Status unavailable",
    });
    expect(unavailable).toHaveLength(5);
    expect(
      screen.getByRole("button", { name: /Import Data/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("DR-NRPG")).toBeInTheDocument();
  });
});
