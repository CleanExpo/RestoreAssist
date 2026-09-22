/**
 * middleware-setup-gate.test.ts
 *
 * Tests for the SETUP_WIZARD_ENABLED feature-flag gate in proxy.ts.
 * The gate redirects any authenticated user without setupCompletedAt to /setup.
 * Role-agnostic: no OWNER/TECHNICIAN/ADMIN branching (C1+C3 fix).
 *
 * This file lives in lib/__tests__/ so vitest picks it up via the existing
 * include pattern for lib tests.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Must mock before importing middleware so the module-level import of
// next-auth/jwt resolves to the mock.
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
// SP-3 T15 added a hard-paywall block that calls getTrialStatus when an
// authenticated user lands on a non-whitelisted path. Mock it here so this
// suite stays Prisma-free.
vi.mock("@/lib/trial-handling", () => ({
  getTrialStatus: vi.fn().mockResolvedValue({ showHardWall: false }),
}));

import { getToken } from "next-auth/jwt";
import { proxy } from "../../proxy";

function mkReq(pathname: string, search: string = "", method: string = "GET") {
  const parsed = new URL(`http://test${pathname}${search}`);
  return {
    nextUrl: {
      pathname,
      clone: () => new URL(`http://test${pathname}${search}`),
      search,
      searchParams: parsed.searchParams,
    },
    url: `http://test${pathname}${search}`,
    method,
    headers: new Headers(),
  } as any;
}

describe("legacy invitation signup compatibility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SETUP_WIZARD_ENABLED = "false";
  });

  it("redirects one valid legacy invitation token to the canonical invite route", async () => {
    const token = "a".repeat(48);
    const res = await proxy(mkReq("/signup", `?invite=${token}&utm_source=legacy`));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`http://test/invite/${token}`);
    expect(getToken).not.toHaveBeenCalled();
  });

  it.each([
    ["short token", "?invite=abc"],
    ["empty token", "?invite="],
    ["duplicate tokens", `?invite=${"a".repeat(48)}&invite=${"b".repeat(48)}`],
  ])("fails closed on %s without returning to account creation", async (_case, search) => {
    const res = await proxy(mkReq("/signup", search));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://test/invite/invalid");
    expect(getToken).not.toHaveBeenCalled();
  });
});

describe("middleware setup gate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SETUP_WIZARD_ENABLED = "true";
  });

  it("is inert when SETUP_WIZARD_ENABLED is not true", async () => {
    process.env.SETUP_WIZARD_ENABLED = "false";
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
    });
    const res = await proxy(mkReq("/dashboard"));
    // Should NOT redirect when flag is off
    expect((res as any).status).not.toBe(307);
  });

  it("redirects any authenticated user with null setupCompletedAt to /setup", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
    });
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain("/setup");
  });

  it("ADMIN with null setupCompletedAt is redirected to /setup (C1 regression)", async () => {
    // Regression for C1: ADMIN must be gated same as any other role.
    // Old code relied on role === "OWNER" || role === "ADMIN" — "OWNER" doesn't
    // exist in the schema, making that branch partially dead. New code is
    // role-agnostic so ADMIN is covered by the generic setupCompletedAt check.
    (getToken as any).mockResolvedValue({
      sub: "u2",
      role: "ADMIN",
      setupCompletedAt: null,
    });
    const res = await proxy(mkReq("/reports"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain("/setup");
  });

  it("does NOT redirect when setupCompletedAt is set", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });

  it("allows /setup itself even when flag is on + user not completed", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
    });
    const res = await proxy(mkReq("/setup"));
    expect((res as any).status).not.toBe(307);
  });

  it("allows /api/setup/* even when flag is on", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
    });
    const res = await proxy(mkReq("/api/setup/hydrate"));
    expect((res as any).status).not.toBe(307);
  });

  // ── The wizard's Integrations step ──────────────────────────────────────
  // Every path below is reached FROM /setup by a control the operator can
  // see. Without a bypass entry each one 307s straight back to /setup, so
  // the control it belongs to becomes a dead end the moment the flag is on.

  it("allows the Integrations step's OAuth connect POST through", async () => {
    // The card fetches this and parses JSON. A 307 to /setup resolves as a
    // 200 of HTML — `res.ok` is true and `json()` throws.
    (getToken as any).mockResolvedValue({ sub: "u1", setupCompletedAt: null });
    const res = await proxy(mkReq("/api/integrations/oauth/xero/connect", "", "POST"));
    expect((res as any).status).not.toBe(307);
  });

  it("allows the provider's OAuth callback back through", async () => {
    (getToken as any).mockResolvedValue({ sub: "u1", setupCompletedAt: null });
    const res = await proxy(
      mkReq("/api/integrations/oauth/quickbooks/callback", "?code=abc&state=s"),
    );
    expect((res as any).status).not.toBe(307);
  });

  it.each([
    ["/dashboard/subscription", 'IntegrationsCard "View add-ons" / "View plans"'],
    ["/dashboard/addons", 'IntegrationsCard "View add-ons" checkout destination'],
    ["/dashboard/success", "Stripe checkout fulfillment return"],
    ["/dashboard/integrations", 'IntegrationsCard "Set up Ascora"'],
    ["/dashboard/settings/ai-providers", 'IntegrationsCard "Manage AI keys"'],
  ])("allows %s — the destination of %s", async (pathname) => {
    (getToken as any).mockResolvedValue({ sub: "u1", setupCompletedAt: null });
    const res = await proxy(mkReq(pathname));
    expect((res as any).status).not.toBe(307);
  });

  it.each([
    ["/api/subscription", "GET"],
    ["/api/subscription/portal", "POST"],
    ["/api/create-checkout-session", "POST"],
    ["/api/addons/catalog", "GET"],
    ["/api/addons/checkout", "POST"],
    ["/api/addons/verify", "POST"],
    ["/api/verify-subscription", "POST"],
    ["/api/check-active-subscription", "POST"],
    ["/api/integrations", "GET"],
    ["/api/ascora/connect", "POST"],
    ["/api/workspace/provider-connections", "GET"],
    ["/api/workspace/provider-connections/validate", "POST"],
    ["/api/user/cloud-mirror", "GET"],
  ])("allows wizard dependency %s through on %s", async (pathname, method) => {
    (getToken as any).mockResolvedValue({ sub: "u1", setupCompletedAt: null });
    const res = await proxy(mkReq(pathname, "", method));
    expect((res as any).status).not.toBe(307);
  });

  it.each([
    "/api/oauth/google-drive/status",
    "/api/oauth/google-drive/start",
    "/api/oauth/google-drive/callback",
    "/api/oauth/microsoft-onedrive/status",
    "/api/oauth/microsoft-onedrive/start",
    "/api/oauth/microsoft-onedrive/callback",
  ])("allows the Storage step dependency %s through on GET", async (pathname) => {
    (getToken as any).mockResolvedValue({ sub: "u1", setupCompletedAt: null });
    const res = await proxy(mkReq(pathname));
    expect((res as any).status).not.toBe(307);
  });

  it("does not let onboarding redirect block a wizard destination", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
      needsOnboarding: true,
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const res = await proxy(mkReq("/dashboard/integrations"));
    expect((res as any).status).not.toBe(307);
    expect((res as any).headers.get("location")).toBeNull();
  });

  it("keeps the legacy onboarding gate when the setup wizard flag is off", async () => {
    process.env.SETUP_WIZARD_ENABLED = "false";
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: null,
      needsOnboarding: true,
    });

    const res = await proxy(mkReq("/dashboard/integrations"));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain(
      "/onboarding/account-type",
    );
  });

  it("matches wizard destinations exactly, not descendants or bare prefixes", async () => {
    (getToken as any).mockResolvedValue({ sub: "u1", setupCompletedAt: null });

    for (const gated of [
      "/dashboard/subscription/invoices",
      "/dashboard/subscription-audit",
      "/dashboard/addons/history",
      "/dashboard/success/history",
      "/dashboard/integrations/health",
      "/dashboard/integrations/sync-history",
      "/dashboard/integrations/webhooks",
      "/dashboard/integrations-admin",
      "/dashboard/settings/ai-providers/openrouter",
      "/dashboard/settings/ai-providers-internal",
    ]) {
      const res = await proxy(mkReq(gated));
      expect((res as any).status).toBe(307);
      expect((res as any).headers.get("location")).toContain("/setup");
    }
  });

  it.each([
    ["/api/integrations/oauth/xero/disconnect", "POST"],
    ["/api/integrations/oauth/xero/sync", "POST"],
    ["/api/integrations/oauth/xero/jobs", "GET"],
    ["/api/integrations/oauth/xero/clients", "POST"],
    ["/api/integrations/oauth/ascora/connect", "POST"],
    ["/api/integrations/oauth/xero/connect", "GET"],
    ["/api/integrations/oauth/xero/callback", "POST"],
    ["/api/addons/checkout", "DELETE"],
    ["/api/oauth/google-drive/disconnect", "POST"],
    ["/api/oauth/microsoft-onedrive/status", "POST"],
  ])("keeps non-wizard OAuth/API operation %s %s gated", async (pathname, method) => {
    (getToken as any).mockResolvedValue({ sub: "u1", setupCompletedAt: null });
    const res = await proxy(mkReq(pathname, "", method));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain("/setup");
  });

  it("still gates the rest of /dashboard — the bypass is not a blanket one", async () => {
    (getToken as any).mockResolvedValue({ sub: "u1", setupCompletedAt: null });
    for (const pathname of [
      "/dashboard",
      "/dashboard/reports/new",
      "/dashboard/settings",
      "/api/integrations/health",
      "/api/integrations-admin",
      "/api/workspace/provider-connections-internal",
    ]) {
      const res = await proxy(mkReq(pathname));
      expect((res as any).status).toBe(307);
      expect((res as any).headers.get("location")).toContain("/setup");
    }
  });

  // P1 #16 added an unauth → /login redirect that runs BEFORE the setup
  // gate. For an unauthenticated request to /dashboard, middleware now
  // (correctly) returns a 307 to /login — but that 307 is from the login
  // redirect, not the setup gate. To assert the setup gate's own
  // pass-through behaviour, the test now uses an AUTHENTICATED token with
  // setup already complete + the flag disabled. That isolates the
  // setup-gate codepath cleanly.
  it("does not 307 when setup is complete (setup gate path)", async () => {
    process.env.SETUP_WIZARD_ENABLED = "false";
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    const res = await proxy(mkReq("/dashboard"));
    expect((res as any).status).not.toBe(307);
  });
});

describe("middleware login redirect (P1 #16)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Setup gate off so we isolate the login-redirect logic.
    process.env.SETUP_WIZARD_ENABLED = "false";
  });

  it("redirects unauthenticated /dashboard/* requests to /login with callbackUrl", async () => {
    (getToken as any).mockResolvedValue(null);
    const res = await proxy(mkReq("/dashboard/inspections/123"));
    expect((res as any).status).toBe(307);
    const location = (res as any).headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain(
      `callbackUrl=${encodeURIComponent("/dashboard/inspections/123")}`,
    );
  });

  it("preserves search params in the callbackUrl", async () => {
    (getToken as any).mockResolvedValue(null);
    const res = await proxy(
      mkReq("/dashboard/inspections", "?tab=open&page=2"),
    );
    expect((res as any).status).toBe(307);
    const location = (res as any).headers.get("location");
    expect(location).toContain(
      `callbackUrl=${encodeURIComponent("/dashboard/inspections?tab=open&page=2")}`,
    );
  });

  it("redirects /reports/* and /compliance/* similarly", async () => {
    (getToken as any).mockResolvedValue(null);
    for (const path of ["/reports/42", "/compliance"]) {
      const res = await proxy(mkReq(path));
      expect((res as any).status).toBe(307);
      const location = (res as any).headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain(`callbackUrl=${encodeURIComponent(path)}`);
    }
  });

  it("does NOT redirect /invite/[token] — uses its own token-based auth", async () => {
    (getToken as any).mockResolvedValue(null);
    const res = await proxy(mkReq("/invite/abc123"));
    // Should fall through (NextResponse.next) — no redirect.
    expect((res as any).status).not.toBe(307);
  });

  // RA-7583 — homeowners sign via an unguessable URL token and have no
  // account. The previous assertion here required a 307 to /login and
  // pinned the production defect. Same contract as /invite/[token].
  it("does NOT redirect /sign/[token] — uses its own token-based auth", async () => {
    (getToken as any).mockResolvedValue(null);
    const token = "11111111-2222-4333-8444-555555555555";
    const res = await proxy(mkReq(`/sign/${token}`));
    expect((res as any).status).toBe(200);
    expect((res as any).headers.get("location")).toBeNull();
  });

  // RA-7635 — the owner shares a finished report with the homeowner via
  // /api/reports/[id]/share-link, which mints an HMAC insurer token and builds
  // /reports/<id>/view?token=<t>. Every /reports path sits behind the login
  // gate, so the homeowner was sent to /login and never saw the report.
  //
  // app/reports/[id]/view/page.tsx already verifies that token against THAT
  // report id and 404s otherwise, and already sends robots noindex. The token
  // in the query is the credential, exactly as the path token is for /sign and
  // /invite. Only this one URL shape is exempt.
  it("does NOT redirect /reports/[id]/view?token=... — the token is the credential", async () => {
    (getToken as any).mockResolvedValue(null);
    const token = "a".repeat(64);
    const res = await proxy(
      mkReq("/reports/rep_123/view", `?token=${token}`),
    );
    expect((res as any).status).toBe(200);
    expect((res as any).headers.get("location")).toBeNull();
  });

  // The exemption is the narrowest shape that works. Each case below would be
  // a way into the contractor's report surface without a session, so each must
  // still be gated. These are the assertions that make the exemption safe
  // rather than merely convenient.
  //
  // Rows 7-8 pin the `[^/]+` in PUBLIC_TOKENED_REPORT_VIEW — the id is ONE path
  // segment. Without them, widening it to `.+` passes the whole suite: the six
  // rows above vary the token and the tail of the path but never the number of
  // segments in the id, so none of them notices.
  //
  // Rows 9-10 pin the two things the regex claims and nothing asserted: that it
  // is anchored at the START, and that it is case-SENSITIVE. Round two of the
  // independent review dropped the `^` and all 68 tests still passed, while
  // /reports/x/reports/y/view?token=… flipped from 307 to 200 — a gated path
  // made public by a one-character edit no test could see. The `/i` mutant does
  // the same for /reports/<id>/VIEW.
  //
  // Every one of these four rows exists because a reviewer mutated the regex and
  // the suite stayed green. That is the whole lesson: an anchor written in a
  // pattern is a claim, and a claim with no control behind it is decoration.
  it.each([
    ["the view route with no token at all", "/reports/rep_123/view", ""],
    ["the view route with an empty token", "/reports/rep_123/view", "?token="],
    ["a report page that is not /view", "/reports/rep_123", `?token=${"a".repeat(64)}`],
    ["a nested route under the id", "/reports/rep_123/edit", `?token=${"a".repeat(64)}`],
    ["the reports index", "/reports", `?token=${"a".repeat(64)}`],
    ["a deeper path below /view", "/reports/rep_123/view/raw", `?token=${"a".repeat(64)}`],
    ["a multi-segment id", "/reports/a/b/view", `?token=${"a".repeat(64)}`],
    ["a deeper multi-segment id", "/reports/a/b/c/view", `?token=${"a".repeat(64)}`],
    ["a path that merely ENDS with the view route", "/reports/x/reports/y/view", `?token=${"a".repeat(64)}`],
    ["an uppercase VIEW segment", "/reports/rep_123/VIEW", `?token=${"a".repeat(64)}`],
    ["an empty id segment", "/reports//view", `?token=${"a".repeat(64)}`],
    ["a views (plural) segment", "/reports/rep_123/views", `?token=${"a".repeat(64)}`],
  ])("still gates %s", async (_case, pathname, search) => {
    (getToken as any).mockResolvedValue(null);
    const res = await proxy(mkReq(pathname, search));
    expect((res as any).status).toBe(307);
    expect((res as any).headers.get("location")).toContain("/login");
  });

  // THE PATTERN ITSELF, not one more example of it.
  //
  // Three independent review rounds each found a different claim this regex makes
  // that no behavioural row asserted: the id segment count (`[^/]+` -> `.+`), the
  // start anchor (dropping `^`), the case (`/i`), the non-empty id (`+` -> `*`),
  // and the literal segment (`view` -> `views?`). Every round the fix was one more
  // negative row, and every round the next mutation walked through the gap the
  // rows did not happen to cover.
  //
  // That cannot converge. A regex's claim space is larger than any list of
  // examples, so example-based negatives are a denylist of widenings someone
  // thought of -- the same "the rule is universal, the guard is a list" defect
  // this repo keeps paying for. `lib/__tests__/stripe-api-version.test.ts` solves
  // the same shape by asserting the literal rather than enumerating its uses, and
  // this is that idiom.
  //
  // The rows above prove the pattern is WIRED correctly. This proves it has not
  // been CHANGED. Any edit to that one line fails here, including mutations nobody
  // has thought of yet -- which is the only property that ends the loop.
  //
  // If you are here because this test failed and your change to the pattern was
  // deliberate: update the literal below, and add a behavioural row proving the new
  // shape gates what it should. Do not delete this assertion.
  it("pins the exemption pattern itself, so any edit to it fails here", () => {
    const source = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    expect(source).toContain(
      "const PUBLIC_TOKENED_REPORT_VIEW = /^\\/reports\\/[^/]+\\/view\\/?$/;",
    );
  });

  // requiresLogin() guards two gates — the login redirect above and the hard
  // paywall below it. The exemption has to be applied at both, or a homeowner
  // opening a share link belonging to a lapsed contractor gets bounced to a
  // payment page for somebody else's subscription. The pair below is what
  // makes the second call site load-bearing: remove the exemption from the
  // paywall gate and the first case fails, while the second proves the paywall
  // really does fire on this token.
  it("does NOT send a tokened report view to the paywall when the owner's subscription lapsed", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
      subscriptionStatus: "CANCELED",
    });
    const res = await proxy(
      mkReq("/reports/rep_123/view", `?token=${"a".repeat(64)}`),
    );
    expect((res as any).status).not.toBe(307);
  });

  it("still paywalls an ordinary /reports path for that same lapsed token", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
      subscriptionStatus: "CANCELED",
    });
    const res = await proxy(mkReq("/reports/rep_123"));
    expect((res as any).status).toBe(307);
  });

  it("does NOT redirect authenticated users", async () => {
    (getToken as any).mockResolvedValue({
      sub: "u1",
      setupCompletedAt: "2026-01-01T00:00:00Z",
    });
    const res = await proxy(mkReq("/dashboard/inspections/123"));
    // Authenticated → no login redirect. (Setup gate is off in this block.)
    expect((res as any).status).not.toBe(307);
  });
});
