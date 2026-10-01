import { test as baseTest, expect, type Page, type Route } from "@playwright/test";
import { encode } from "next-auth/jwt";

// Fixed loopback target. Never take a production URL, storage state or secret
// from the environment. API replies and writes in this file are synthetic.
const BASE = "http://127.0.0.1:3100";
const SECRET = "synthetic-local-browser-secret";
const EXPIRY = "2099-01-01T00:00:00.000Z";
const DATE = "2026-10-01T00:00:00.000Z";

interface FixtureUser {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: "ADMIN";
  needsOnboarding: false;
  organizationScopeVerified: true;
}
interface Metadata {
  integrations: Record<string, unknown>[];
  aiConnections: Record<string, unknown>[];
  workspaceId: string;
  truncated: boolean;
}
interface Reply { status?: number; json: unknown }
interface Mutation { method: string; path: string; body: Record<string, unknown> | null }
interface Fixture {
  user: FixtureUser;
  metadata: Metadata;
  metadataStatus: number;
  metadataWait?: Promise<void>;
  onMutation?: (request: Mutation) => Promise<Reply | undefined> | Reply | undefined;
  writes: Mutation[];
  sessionReads: number;
}
function user(suffix: string): FixtureUser {
  return {
    id: `synthetic-${suffix}`, email: `${suffix}@example.com`, name: `Synthetic ${suffix}`,
    organizationId: `synthetic-org-${suffix}`, role: "ADMIN", needsOnboarding: false,
    organizationScopeVerified: true,
  };
}
function syntheticToken(identity: FixtureUser) {
  return encode({ secret: SECRET, token: {
    sub: identity.id, role: identity.role, needsOnboarding: false,
    setupCompletedAt: DATE, organizationId: identity.organizationId,
  } });
}
function metadata(integrations: Record<string, unknown>[] = [], aiConnections: Record<string, unknown>[] = []): Metadata {
  return { integrations, aiConnections, workspaceId: "synthetic-workspace-a", truncated: false };
}
function legacyAi(provider: "ANTHROPIC" | "OPENAI") {
  return {
    id: `synthetic-legacy-${provider}`, name: provider === "ANTHROPIC" ? "Anthropic Claude" : "OpenAI GPT",
    provider: "XERO", icon: "[ra:ai]", status: "CONNECTED", hasOAuthCredentials: false,
    tenantId: null, realmId: null, tokenExpiresAt: null, createdAt: DATE, updatedAt: DATE,
  };
}
function canonical(provider: string, status = "ACTIVE") {
  return { id: `synthetic-canonical-${provider}`, provider, status, lastValidatedAt: null, createdAt: DATE, updatedAt: DATE };
}
function xero(tenantId: string | null = "synthetic-xero-org") {
  return {
    id: "synthetic-xero", provider: "XERO", name: "Xero", icon: "/integrations/xero.svg",
    status: "CONNECTED", tenantId, hasOAuthCredentials: true, tokenExpiresAt: EXPIRY,
  };
}
function card(page: Page, name: string) {
  return page.locator('[data-slot="card"]').filter({ has: page.getByText(name, { exact: true }) });
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const test = baseTest.extend<{ app: Fixture }>({
  app: async ({ context, page }, runWithFixture, testInfo) => {
    const app: Fixture = { user: user("a"), metadata: metadata(), metadataStatus: 200, writes: [], sessionReads: 0 };
    const blockedApis: string[] = [];
    const blockedExternal: string[] = [];
    const blockedLocal: { method: string; path: string; resourceType: string; navigation: boolean; reason: string }[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await context.addCookies([{
      name: "next-auth.session-token", url: BASE, httpOnly: true, sameSite: "Lax",
      value: await syntheticToken(app.user),
    }]);

    const reply = (route: Route, data: Reply) => route.fulfill({ status: data.status ?? 200, json: data.json });
    await context.routeWebSocket("**/*", (socket) => {
      blockedExternal.push("websocket-blocked");
      socket.close({ code: 1008, reason: "Synthetic fixture blocks sockets" });
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== BASE) {
        blockedExternal.push(url.origin);
        return route.abort("blockedbyclient");
      }
      const path = url.pathname;
      const method = request.method();
      if (path.startsWith("/api/")) {
        if (method === "GET") {
          if (path === "/api/auth/session") {
            app.sessionReads++;
            return reply(route, { json: { user: app.user, expires: EXPIRY } });
          }
          if (path === "/api/integrations") {
            // Capture the response when requested; delayed replies cannot read
            // a later account's fixture data by accident.
            const snapshot = structuredClone(app.metadata);
            const status = app.metadataStatus;
            if (app.metadataWait) await app.metadataWait;
            return reply(route, { status, json: status === 200 ? snapshot : { error: "Synthetic metadata outage" } });
          }
          if (path === "/api/user/profile") return reply(route, { json: { profile: {
            ...app.user, businessName: `Synthetic business ${app.user.id}`, subscriptionStatus: "ACTIVE",
          } } });
          if (path === "/api/ascora/connect" || path === "/api/dr-nrpg/connect") return reply(route, { json: { integration: null } });
          if (path === "/api/notifications") return reply(route, { json: { notifications: [] } });
          // Chatbot mounts in the dashboard shell and reads history. No chat
          // POST is allowed: browser evidence must never invoke a model.
          if (path === "/api/chatbot") return reply(route, { json: { messages: [] } });
          if (path === "/api/releases/unseen") return reply(route, { json: { data: null } });
          if (path === "/api/user/experience-mode") return reply(route, { json: { experienceMode: "APPRENTICE" } });
          if (path === "/api/user/product-tour") return reply(route, { json: { dismissed: true } });
          if (path === "/api/onboarding/first-run") return reply(route, { json: { dismissed: true, allComplete: true, steps: [], completedCount: 0, totalCount: 0 } });
          if (path === "/api/onboarding/status") return reply(route, { json: { steps: { ai_provider: { required: false, completed: true } }, isComplete: true, nextStep: null } });
          if (path === "/api/billing/trial-status") return reply(route, { json: { data: { lifetimeAccess: true, showCountdownBanner: false, daysRemaining: 0 } } });
          if (path === "/api/user/trial-status") return reply(route, { json: { lifetimeAccess: true, subscriptionStatus: "ACTIVE", daysRemaining: 0 } });
          if (path === "/api/subscription") return reply(route, { json: { subscription: null } });
          if (path === "/api/workspace/status") return reply(route, { status: 404, json: { hasWorkspace: false, status: null, workspaceId: null } });
          if (path === "/api/auth/offline-context") return reply(route, { status: 401, json: { error: "Synthetic fixture disables offline replay" } });
          if (path === "/api/pricing-config") return reply(route, { json: { pricingConfig: { id: "synthetic-pricing" } } });
        } else {
          let body: Record<string, unknown> | null = null;
          try { body = request.postDataJSON(); } catch { /* A body is optional on connect. */ }
          const mutation = { method, path, body };
          app.writes.push(mutation);
          const handled = await app.onMutation?.(mutation);
          if (handled) return reply(route, handled);
        }
        blockedApis.push(`${method} ${path}`);
        return reply(route, { status: 501, json: { error: "Blocked unmatched synthetic API request" } });
      }
      // This fixture needs one document load, not a server-side RSC prefetch.
      // Block RSC explicitly so a sidebar prefetch cannot reach unmocked data.
      if (url.searchParams.has("_rsc") || await request.headerValue("rsc") === "1") {
        blockedLocal.push({ method, path, resourceType: request.resourceType(), navigation: request.isNavigationRequest(), reason: "rsc" });
        return route.abort("blockedbyclient");
      }
      // Allow only this app page and local static assets. In particular, never
      // let a remote image URL escape through the server's image optimiser.
      if (method === "GET" && path === "/dashboard/integrations" && request.isNavigationRequest() && request.resourceType() === "document") {
        // The production layout's getServerSession reads the __Secure- name;
        // the proxy chooses the unprefixed name for the loopback HTTP URL.
        // Supply only this fixture's fixed-secret JWT to both consumers on
        // this one allowed document. No cookie, API, RSC or auth guard bypass
        // is added to the application, and other navigation stays blocked.
        const jwt = await syntheticToken(app.user);
        // Playwright forbids overriding Cookie with route.continue. Fetch
        // this exact local document without following redirects, then serve
        // its untouched response so the real server guard still decides.
        const response = await route.fetch({
          url: `${BASE}/dashboard/integrations`, maxRedirects: 0,
          headers: {
            ...request.headers(),
            cookie: `next-auth.session-token=${jwt}; __Secure-next-auth.session-token=${jwt}`,
          },
        });
        return route.fulfill({ response });
      }
      if (method === "GET" && path === "/_next/image") {
        const source = url.searchParams.get("url");
        if (source?.startsWith("/") && !source.includes("\\") && new URL(source, BASE).origin === BASE) return route.continue();
        blockedLocal.push({ method, path, resourceType: request.resourceType(), navigation: request.isNavigationRequest(), reason: "nonlocal-image" });
        return route.abort("blockedbyclient");
      }
      if (method === "GET" && (path.startsWith("/_next/static/") || /\.(?:svg|png|jpg|jpeg|webp|ico|woff2?|css|webmanifest)$/.test(path))) return route.continue();
      blockedLocal.push({ method, path, resourceType: request.resourceType(), navigation: request.isNavigationRequest(), reason: "unmatched" });
      return route.abort("blockedbyclient");
    });

    await runWithFixture(app);
    await testInfo.attach("synthetic-network-boundary", {
      contentType: "application/json",
      body: JSON.stringify({ blockedApis, blockedLocal, blockedExternalOrigins: [...new Set(blockedExternal)], writes: app.writes.map(({ method, path }) => ({ method, path })), pageErrors }, null, 2),
    });
    expect(blockedApis, "Unmatched APIs were blocked; extend a named fixture if the shell contract changed").toEqual([]);
    expect(pageErrors, "The real integration page should render without JavaScript exceptions").toEqual([]);
  },
});

async function open(page: Page) {
  await page.goto(`${BASE}/dashboard/integrations`);
  await expect(page.getByRole("heading", { name: "AI Providers", exact: true })).toBeVisible();
}

test("legacy AI rows never create a Xero or Ascora connection", async ({ page, app }, testInfo) => {
  app.metadata = metadata([legacyAi("ANTHROPIC"), legacyAi("OPENAI")]);
  await open(page);
  await expect(card(page, "Anthropic Claude").getByText("Configured", { exact: true })).toBeVisible();
  await expect(card(page, "OpenAI GPT").getByText("Configured", { exact: true })).toBeVisible();
  await expect(card(page, "Xero").getByRole("button", { name: "Connect", exact: true })).toBeEnabled();
  await expect(card(page, "Xero").getByText("Connected", { exact: true })).toHaveCount(0);
  await expect(card(page, "Xero").getByRole("button", { name: "Sync", exact: true })).toHaveCount(0);
  await expect(card(page, "Ascora").getByRole("button", { name: "Start import", exact: true })).toBeEnabled();
  await expect(card(page, "Ascora").getByText("Connected", { exact: true })).toHaveCount(0);
  expect(app.writes).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath("ai-only.png"), fullPage: true });
});

test("canonical Configured and Disabled states override legacy connected records", async ({ page, app }, testInfo) => {
  app.metadata = metadata([legacyAi("ANTHROPIC"), legacyAi("OPENAI")], [canonical("ANTHROPIC"), canonical("OPENAI", "DISABLED")]);
  await open(page);
  await expect(card(page, "Anthropic Claude")).toHaveCount(1);
  await expect(card(page, "Anthropic Claude").getByText("Configured", { exact: true })).toBeVisible();
  await expect(card(page, "Anthropic Claude").getByText("Connected", { exact: true })).toHaveCount(0);
  await expect(card(page, "OpenAI GPT")).toHaveCount(1);
  await expect(card(page, "OpenAI GPT").getByText("Disabled", { exact: true })).toBeVisible();
  await expect(card(page, "OpenAI GPT").getByRole("button", { name: "Disconnect", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("canonical-states.png"), fullPage: true });
});

test("a repeated save writes only one canonical key and disconnect disables that provider", async ({ page, app }) => {
  const saved = canonical("ANTHROPIC");
  const gate = deferred();
  app.onMutation = async (request) => {
    if (request.path !== "/api/workspace/provider-connections") return undefined;
    if (request.method === "POST") {
      expect(request.body).toEqual({ provider: "ANTHROPIC", apiKey: "sk-ant-synthetic-browser-fixture-only" });
      await gate.promise;
      app.metadata = metadata([], [saved]);
      return { json: { connection: saved } };
    }
    if (request.method === "DELETE") {
      expect(request.body).toEqual({ provider: "ANTHROPIC" });
      app.metadata = metadata([], [{ ...saved, status: "DISABLED" }]);
      return { json: { success: true } };
    }
  };
  await open(page);
  await page.getByRole("button", { name: "Add Integration", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Enter your Anthropic API key").fill("sk-ant-synthetic-browser-fixture-only");
  const save = dialog.getByRole("button", { name: "Add Integration", exact: true });
  try {
    // Two native click events in one turn exercise the in-flight ref guard,
    // independently of Playwright waiting for the disabled visual state.
    await save.evaluate((element) => { const button = element as HTMLButtonElement; button.click(); button.click(); });
    await expect.poll(() => app.writes.length).toBe(1);
    await expect(save).toBeDisabled();
  } finally {
    gate.resolve();
  }
  await expect(dialog).toHaveCount(0);
  await expect(card(page, "Anthropic Claude").getByText("Configured", { exact: true })).toBeVisible();
  await card(page, "Anthropic Claude").getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(card(page, "Anthropic Claude").getByText("Disabled", { exact: true })).toBeVisible();
  expect(app.writes.map(({ method, path }) => ({ method, path }))).toEqual([
    { method: "POST", path: "/api/workspace/provider-connections" },
    { method: "DELETE", path: "/api/workspace/provider-connections" },
  ]);
});

test("a genuine Xero record without an organisation can reconnect or disconnect, but cannot sync", async ({ page, app }, testInfo) => {
  const ai = legacyAi("ANTHROPIC");
  app.metadata = metadata([ai, xero(null)]);
  app.onMutation = (request) => {
    if (request.method === "POST" && request.path === "/api/integrations/oauth/xero/connect") {
      return { status: 400, json: { error: "Synthetic authorisation remains incomplete" } };
    }
    if (request.method === "POST" && request.path === "/api/integrations/oauth/xero/disconnect") {
      app.metadata = metadata([ai, { ...xero(null), status: "DISCONNECTED" }]);
      return { json: { success: true } };
    }
  };
  await open(page);
  const xeroCard = card(page, "Xero");
  await expect(xeroCard.getByText("Needs attention", { exact: true })).toBeVisible();
  await expect(xeroCard.getByRole("button", { name: "Reconnect", exact: true })).toBeEnabled();
  await expect(xeroCard.getByRole("button", { name: "Disconnect", exact: true })).toBeEnabled();
  await expect(xeroCard.getByRole("button", { name: "Sync", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("xero-needs-organisation.png"), fullPage: true });
  await xeroCard.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByText("Synthetic authorisation remains incomplete", { exact: true })).toBeVisible();
  await xeroCard.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(xeroCard.getByRole("button", { name: "Connect", exact: true })).toBeEnabled();
  await expect(card(page, "Anthropic Claude").getByText("Configured", { exact: true })).toBeVisible();
  expect(app.writes.map(request => request.path)).toEqual([
    "/api/integrations/oauth/xero/connect", "/api/integrations/oauth/xero/disconnect",
  ]);
});

for (const receipt of ["zero", "malformed"] as const) {
  test(`Xero ${receipt} sync receipt is shown truthfully`, async ({ page, app }) => {
    app.metadata = metadata([xero()]);
    app.onMutation = (request) => {
      if (request.method !== "POST" || request.path !== "/api/integrations/oauth/xero/sync") return undefined;
      expect(request.body).toEqual({ syncClients: true, syncJobs: true });
      return { json: receipt === "zero" ? { clientsSynced: 0, jobsSynced: 0 } : { clientsSynced: 0 } };
    };
    await open(page);
    await card(page, "Xero").getByRole("button", { name: "Sync", exact: true }).click();
    if (receipt === "zero") {
      await expect(page.getByText("Synced 0 clients and 0 jobs", { exact: true })).toBeVisible();
    } else {
      await expect(page.getByText("Sync returned an incomplete result. Refresh its status before retrying.", { exact: true })).toBeVisible();
      await expect(page.getByText(/^Synced \d+ clients and \d+ jobs$/)).toHaveCount(0);
    }
    expect(app.writes).toHaveLength(1);
  });
}

test("multiple genuine Xero records remain blocked instead of choosing one", async ({ page, app }) => {
  app.metadata = metadata([xero(), { ...xero(), id: "synthetic-other-xero" }]);
  await open(page);
  const xeroCard = card(page, "Xero");
  await expect(xeroCard.getByText("Multiple connections", { exact: true })).toBeVisible();
  await expect(xeroCard.getByRole("button", { name: "Choose a workspace connection", exact: true })).toBeDisabled();
  await expect(xeroCard.getByRole("button", { name: "Sync", exact: true })).toHaveCount(0);
  await expect(xeroCard.getByRole("button", { name: "Disconnect", exact: true })).toHaveCount(0);
  expect(app.writes).toHaveLength(0);
});

test("a same-document account switch clears old cards and typed keys while new metadata loads", async ({ page, context, app }, testInfo) => {
  app.metadata = metadata([legacyAi("ANTHROPIC")]);
  await open(page);
  await card(page, "Anthropic Claude").getByRole("button", { name: "Update Key", exact: true }).click();
  await page.getByRole("dialog").getByPlaceholder("Enter your Anthropic API key").fill("sk-ant-synthetic-unsaved-fixture");
  const gate = deferred();
  app.user = user("b");
  app.metadata = { ...metadata([], [canonical("GOOGLE")]), workspaceId: "synthetic-workspace-b" };
  app.metadataWait = gate.promise;
  await context.addCookies([{
    name: "next-auth.session-token", url: BASE, httpOnly: true, sameSite: "Lax",
    value: await syntheticToken(app.user),
  }]);
  const before = app.sessionReads;
  try {
    await page.evaluate(() => {
      // This is the actual NextAuth browser-session refresh event, not a
      // component hook override. It does not start OAuth or call a provider.
      Object.defineProperty(window, "__integrationFixtureDocument", { value: "same-document", configurable: true });
      window.dispatchEvent(new StorageEvent("storage", {
        key: "nextauth.message", newValue: JSON.stringify({ event: "session", data: { trigger: "synthetic-account-switch" } }),
      }));
    });
    await expect.poll(() => app.sessionReads).toBeGreaterThan(before);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(card(page, "Anthropic Claude")).toHaveCount(0);
    expect(await page.locator("input").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).not.toContain("sk-ant-synthetic-unsaved-fixture");
    await page.getByRole("button", { name: "Account and workspace", exact: true }).click();
    const accountMenu = page.getByRole("menu", { name: "Account and workspace", exact: true });
    await expect(accountMenu.getByText("b@example.com", { exact: true })).toBeVisible();
    await expect(accountMenu.getByText("Organisation: synthetic-org-b", { exact: true })).toBeVisible();
    await expect(page.getByText("a@example.com", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Use another Google account", exact: true })).toHaveAttribute("href", "/login?switchAccount=google");
    await page.keyboard.press("Escape");
  } finally {
    app.metadataWait = undefined;
    gate.resolve();
  }
  await expect(card(page, "Google Gemini").getByText("Configured", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __integrationFixtureDocument?: string }).__integrationFixtureDocument)).toBe("same-document");
  expect(app.writes).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath("switched-account.png"), fullPage: true });
});

test("a failed metadata response is unavailable rather than empty or disconnected", async ({ page, app }) => {
  app.metadataStatus = 503;
  await open(page);
  await expect(page.getByText("AI provider status is unavailable. Retry before changing keys.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Integration", exact: true })).toBeDisabled();
  await expect(card(page, "Xero").getByRole("button", { name: "Status unavailable", exact: true })).toBeDisabled();
  await expect(page.getByText("No AI integrations yet", { exact: true })).toHaveCount(0);
  expect(app.writes).toHaveLength(0);
});
