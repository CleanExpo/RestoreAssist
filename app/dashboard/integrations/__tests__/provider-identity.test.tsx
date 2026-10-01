// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import toast from "react-hot-toast";
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

const account = vi.hoisted(() => ({ id: "u_test" }));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: account.id, name: "Test" } },
    status: "authenticated",
  }),
}));

import IntegrationsPage from "../page";

const legacyAi = { id: "ai_legacy", name: "Anthropic Claude", provider: "XERO", icon: "[ra:ai]", status: "CONNECTED" };
const canonical = { id: "ai_canonical", provider: "ANTHROPIC", status: "ACTIVE", lastValidatedAt: null, createdAt: "2026-10-01", updatedAt: "2026-10-01" };
const xero = { id: "xero_real", name: "Xero", provider: "XERO", status: "CONNECTED", tenantId: "synthetic_org", hasOAuthCredentials: true };
function response(body: unknown, ok = true) { return { ok, status: ok ? 200 : 503, json: async () => body }; }
function mountData(data: Record<string, unknown>, write?: (url: string, init?: RequestInit) => unknown) {
  const calls: {url: string; init?: RequestInit}[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({url, init});
    if (init?.method && init.method !== "GET") return write?.(url, init) ?? response({});
    if (url === "/api/integrations") return response(data);
    if (url === "/api/user/profile") return response({profile: { subscriptionStatus: "ACTIVE" }});
    if (url === "/api/ascora/connect" || url === "/api/dr-nrpg/connect") return response({integration: null});
    if (url === "/api/pricing-config") return response({pricingConfig: {}});
    throw new Error(`Unexpected request: ${url}`);
  }));
  return calls;
}
function card(name: string) { return screen.getByText(name).closest('[data-slot="card"]') as HTMLElement; }
beforeEach(() => { vi.clearAllMocks(); account.id = "u_test"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("integration provider identities", () => {
  it("never renders legacy AI rows as a Xero or Ascora connection", async () => {
    mountData({ integrations: [legacyAi, {...legacyAi, id: "ai_openai", name: "OpenAI GPT"}] });
    render(<IntegrationsPage />);
    await screen.findByText("Anthropic Claude");
    await waitFor(() => expect(within(card("Xero")).getByRole("button", {name: "Connect"})).toBeEnabled());
    expect(within(card("Xero")).queryByText("Connected")).toBeNull();
    expect(within(card("Ascora")).queryByText("Connected")).toBeNull();
  });
  it("shows canonical configuration once and does not claim live validation", async () => {
    mountData({ integrations: [legacyAi], aiConnections: [canonical] });
    render(<IntegrationsPage />);
    expect(await screen.findByText("Configured")).toBeInTheDocument();
    expect(screen.getAllByText("Anthropic Claude")).toHaveLength(1);
    expect(within(card("Anthropic Claude")).queryByText("Connected")).toBeNull();
  });
  it.each(["FAILED", "DISABLED"])("canonical %s supersedes the legacy connected row", async status => {
    mountData({integrations: [legacyAi], aiConnections: [{...canonical, status}]});
    render(<IntegrationsPage />);
    await screen.findByText("Anthropic Claude");
    expect(within(card("Anthropic Claude")).getByText(status === "FAILED" ? "Needs attention" : "Disabled")).toBeInTheDocument();
    expect(within(card("Anthropic Claude")).queryByText("Connected")).toBeNull();
  });
  it("requires a real Xero organisation before offering sync", async () => {
    mountData({integrations: [{...xero, tenantId: null}]});
    render(<IntegrationsPage />);
    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    expect(within(card("Xero")).queryByRole("button", {name: "Sync"})).toBeNull();
  });
  it("offers a genuine incomplete Xero connection an explicit reconnect without sync", async () => {
    const calls = mountData({integrations: [{...xero, tenantId: null}]});
    render(<IntegrationsPage />);
    const reconnect = await screen.findByRole("button", {name: "Reconnect"});
    expect(within(card("Xero")).getByRole("button", {name: "Disconnect"})).toBeEnabled();
    expect(within(card("Xero")).queryByRole("button", {name: "Sync"})).toBeNull();
    fireEvent.click(reconnect);
    await waitFor(() => expect(calls.some(c => c.url === "/api/integrations/oauth/xero/connect" && c.init?.method === "POST")).toBe(true));
  });
  it("does not start two OAuth states on repeated clicks", async () => {
    let finish!: (result: unknown) => void;
    const calls = mountData({integrations: []}, () => new Promise(resolve => { finish = resolve; }));
    render(<IntegrationsPage />);
    await waitFor(() => expect(within(card("Xero")).getByRole("button", {name: "Connect"})).toBeEnabled());
    const connect = within(card("Xero")).getByRole("button", {name: "Connect"});
    fireEvent.click(connect); fireEvent.click(connect);
    finish(response({}));
    await waitFor(() => expect(calls.filter(c => c.init?.method === "POST")).toHaveLength(1));
  });
  it("keeps a genuine custom-named Xero record usable alongside legacy AI", async () => {
    mountData({integrations: [legacyAi, {...xero, name: "My accounts"}]});
    render(<IntegrationsPage />);
    await waitFor(() => expect(within(card("Xero")).getByRole("button", {name: "Sync"})).toBeEnabled());
  });
  it("does not guess between two real Xero records", async () => {
    mountData({integrations: [xero, {...xero, id: "xero_other"}]});
    render(<IntegrationsPage />);
    expect(await screen.findByText("Multiple connections")).toBeInTheDocument();
    expect(within(card("Xero")).queryByRole("button", {name: "Sync"})).toBeNull();
  });
  it("does not call a truncated list disconnected", async () => {
    mountData({integrations: [], truncated: true});
    render(<IntegrationsPage />);
    await waitFor(() => expect(within(card("Xero")).getByRole("button", {name: "Status unavailable"})).toBeDisabled());
  });
  it("saves a new key only to its canonical provider and suppresses repeated clicks", async () => {
    let finish!: (result: unknown) => void;
    const calls = mountData({integrations: []}, () => new Promise(resolve => { finish = resolve; }));
    render(<IntegrationsPage />);
    await screen.findByText("No AI integrations yet");
    fireEvent.click(screen.getByRole("button", {name: "Add Integration"}));
    fireEvent.change(screen.getByPlaceholderText("Enter your Anthropic API key"), {target: {value: "sk-ant-synthetic-fixture-key-only"}});
    const save = within(screen.getByRole("dialog")).getByRole("button", {name: "Add Integration"});
    fireEvent.click(save); fireEvent.click(save);
    finish(response({connection: canonical}));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(calls.filter(c => c.init?.method === "POST")).toHaveLength(1);
    expect(calls.filter(c => c.init?.method === "POST")[0].url).toBe("/api/workspace/provider-connections");
  });
  it("disconnects the authoritative canonical provider without deleting legacy data", async () => {
    const calls = mountData({integrations: [legacyAi], aiConnections: [canonical]});
    render(<IntegrationsPage />);
    await screen.findByText("Anthropic Claude");
    fireEvent.click(within(card("Anthropic Claude")).getByRole("button", {name: "Disconnect"}));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const writes = calls.filter(c => c.init?.method);
    expect(writes).toEqual([{url: "/api/workspace/provider-connections", init: expect.objectContaining({method: "DELETE", body: JSON.stringify({provider: "ANTHROPIC"})})}]);
  });
  it("disables a legacy-only key through canonical intent without writing or deleting legacy data", async () => {
    const calls = mountData({integrations: [legacyAi]});
    render(<IntegrationsPage />);
    await screen.findByText("Anthropic Claude");
    fireEvent.click(within(card("Anthropic Claude")).getByRole("button", {name: "Disconnect"}));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(calls.filter(c => c.init?.method)).toEqual([{url: "/api/workspace/provider-connections", init: expect.objectContaining({method: "DELETE", body: JSON.stringify({provider: "ANTHROPIC"})})}]);
  });
  it("uses the selected provider identity when updating a key and never rewrites the legacy record", async () => {
    const calls = mountData({integrations: [{...legacyAi, name: "OpenAI GPT"}], aiConnections: [{...canonical, provider: "OPENAI"}]});
    render(<IntegrationsPage />);
    await screen.findByText("OpenAI GPT");
    fireEvent.click(within(card("OpenAI GPT")).getByRole("button", {name: "Update Key"}));
    expect(within(screen.getByRole("dialog")).getByRole("combobox")).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Enter your OpenAI API key"), {target: {value: "sk-synthetic-openai-key-only"}});
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Save Connection"}));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(calls.filter(c => c.init?.method)).toEqual([{url: "/api/workspace/provider-connections", init: expect.objectContaining({method: "POST", body: JSON.stringify({provider: "OPENAI", apiKey: "sk-synthetic-openai-key-only"})})}]);
  });
  it("keeps an existing provider that needs attention visible with its listing flag off", async () => {
    vi.stubEnv("NEXT_PUBLIC_QUICKBOOKS_ENABLED", "false");
    mountData({integrations: [{...xero, name: "QuickBooks", provider: "QUICKBOOKS", tenantId: null, realmId: null}]});
    render(<IntegrationsPage />);
    await screen.findByText("QuickBooks");
    expect(within(card("QuickBooks")).getByRole("button", {name: "Reconnect"})).toBeEnabled();
    expect(within(card("QuickBooks")).getByRole("button", {name: "Disconnect"})).toBeEnabled();
    vi.unstubAllEnvs();
  });
  it.each([{}, {clientsSynced: 0}, {clientsSynced: -1, jobsSynced: 0}, {clientsSynced: 0.5, jobsSynced: 0}, {clientsSynced: "1", jobsSynced: 0}, {clientsSynced: Infinity, jobsSynced: 0}, {clientsSynced: 0, jobsSynced: NaN}])("refuses malformed sync success receipts", async receipt => {
    mountData({integrations: [xero]}, () => response(receipt));
    render(<IntegrationsPage />);
    fireEvent.click(await screen.findByRole("button", {name: "Sync"}));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
  it("reports an explicit successful zero-count sync faithfully", async () => {
    mountData({integrations: [xero]}, () => response({clientsSynced: 0, jobsSynced: 0}));
    render(<IntegrationsPage />);
    fireEvent.click(await screen.findByRole("button", {name: "Sync"}));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Synced 0 clients and 0 jobs"));
    expect(toast.error).not.toHaveBeenCalled();
  });
  it("clears old account data immediately when session identity changes", async () => {
    mountData({integrations: [legacyAi]});
    const view = render(<IntegrationsPage />);
    await screen.findByText("Anthropic Claude");
    account.id = "another_account";
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    view.rerender(<IntegrationsPage />);
    expect(screen.queryByText("Anthropic Claude")).toBeNull();
    expect(screen.queryByRole("button", {name: "Update Key"})).toBeNull();
  });
});
