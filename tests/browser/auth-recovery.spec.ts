import { test, expect } from "@playwright/test";

const base = "http://127.0.0.1:3100";
test.beforeEach(async ({ context }) => {
  // All traffic is local; unmatched APIs never reach a real service or DB.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: null });
    return route.continue();
  });
});

test("account switch uses NextAuth CSRF and Google chooser parameters, then supports cancelled/back and wrong-account returns", async ({ page }, testInfo) => {
  let currentUser: { id: string; email: string; name: string } | null = { id: "synthetic-demo", email: "demo@example.com", name: "Demo" };
  let signOuts = 0;
  let starts = 0;
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: currentUser ? { user: currentUser, expires: "2099-01-01T00:00:00.000Z" } : null }));
  await page.route("**/api/auth/csrf", (route) => route.fulfill({ json: { csrfToken: "synthetic-csrf" } }));
  await page.route("**/api/auth/providers", (route) => route.fulfill({ json: { google: { id: "google", name: "Google", type: "oauth", signinUrl: `${base}/api/auth/signin/google`, callbackUrl: `${base}/api/auth/callback/google` } } }));
  await page.route("**/api/auth/signout", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(new URLSearchParams(route.request().postData()!).get("csrfToken")).toBe("synthetic-csrf");
    currentUser = null; signOuts++;
    await route.fulfill({ json: { url: `${base}/login` } });
  });
  await page.route("**/api/auth/signin/google?*", async (route) => {
    expect(signOuts).toBeGreaterThan(0);
    expect(currentUser).toBeNull();
    expect(new URL(route.request().url()).searchParams.get("prompt")).toBe("select_account");
    const body = new URLSearchParams(route.request().postData()!);
    expect(body.get("csrfToken")).toBe("synthetic-csrf");
    expect(body.get("callbackUrl")).toBe("/dashboard");
    starts++;
    await route.fulfill({ json: { url: `${base}/synthetic-google-choice` } });
  });
  await page.route("**/synthetic-google-choice", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Synthetic provider boundary</h1>" }));
  await page.goto("/login?switchAccount=google&callbackUrl=/dashboard/inspections/other-account-job");
  await expect(page.getByText("demo@example.com", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use another Google account" }).click();
  await expect(page).toHaveURL(`${base}/synthetic-google-choice`);
  expect(starts).toBe(1);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Use another Google account" })).toBeEnabled();
  await page.goto("/login?error=AccessDenied&switchAccount=google");
  await expect(page.getByText(/Sign-in was cancelled or could not be completed/)).toBeVisible();
  expect(starts).toBe(1); // No automatic OAuth restart.
  currentUser = { id: "synthetic-wrong", email: "wrong@example.com", name: "Wrong selection" };
  await page.reload();
  await expect(page.getByText("wrong@example.com", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use another Google account" })).toBeEnabled();
  await page.screenshot({ path: `/tmp/restoreassist-auth-evidence/login-${testInfo.project.name}.png`, fullPage: true });
});

test("recovery keeps errors truthful and lets an invalid code be corrected", async ({ page }, testInfo) => {
  // Isolate this UI test from the external BotID challenge transport. Save
  // native fetch before the SDK wraps it; every API is intercepted below and
  // external requests stay blocked. This does NOT evaluate BotID itself.
  await page.addInitScript(() => {
    (window as any).__syntheticFetch = window.fetch.bind(window);
  });
  let requests = 0;
  await page.route("**/api/auth/forgot-password", async (route) => {
    requests++;
    await route.fulfill({ status: requests === 1 ? 503 : 200, json: requests === 1 ? { error: { message: "Synthetic outage" } } : { success: true } });
  });
  await page.route("**/api/auth/reset-password", (route) => route.fulfill({ status: 400, json: { error: { message: "Invalid verification code." } } }));
  await page.goto("/forgot-password");
  await page.getByLabel("Email Address").fill("synthetic@example.com");
  await page.evaluate(() => { window.fetch = (window as any).__syntheticFetch; });
  await page.getByRole("button", { name: "Send Verification Code" }).click();
  await expect(page.getByText("Could not process the reset request. Please try again.", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Email Address")).toBeVisible();
  await page.getByRole("button", { name: "Send Verification Code" }).click();
  await expect(page.getByLabel("Verification Code")).toBeVisible();
  await expect(page.getByText(/Codes expire 10 minutes/)).toBeVisible();
  await page.getByLabel("Verification Code").fill("123456");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(/Code verified/)).toHaveCount(0);
  await expect(page.getByLabel("New Password", { exact: true })).toHaveAttribute("minlength", "12");
  await page.getByLabel("New Password", { exact: true }).fill("synthetic-long-password");
  await page.getByLabel("Confirm Password", { exact: true }).fill("synthetic-long-password");
  await page.getByRole("button", { name: "Reset Password", exact: true }).click();
  await expect(page.getByLabel("Verification Code")).toBeVisible();
  await expect(page.getByLabel("Verification Code")).toHaveValue("");
  await expect(page.getByRole("link", { name: /Continue with Google/ })).toBeVisible();
  await page.screenshot({ path: `/tmp/restoreassist-auth-evidence/recovery-${testInfo.project.name}.png`, fullPage: true });
});

test("dashboard preserves authorised legacy records when one resource fails and identifies the signed-in account", async ({ page, context }, testInfo) => {
  const { encode } = await import("next-auth/jwt");
  // This value matches only the isolated local test server. It is not a live credential.
  const cookie = await encode({ secret: "synthetic-local-browser-secret", token: { sub: "synthetic-a", role: "ADMIN", needsOnboarding: false, setupCompletedAt: "2026-01-01T00:00:00.000Z" } });
  await context.addCookies([{ name: "next-auth.session-token", value: cookie, url: base }]);
  const user = { id: "synthetic-a", email: "real-fixture@example.com", name: "Synthetic owner", role: "ADMIN", needsOnboarding: false };
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user, expires: "2099-01-01T00:00:00.000Z" } });
    if (path === "/api/user/profile") return route.fulfill({ json: { profile: { ...user, organizationId: "synthetic-org", businessName: "Synthetic real-jobs business", subscriptionStatus: "ACTIVE" } } });
    if (path === "/api/workspace/status") return route.fulfill({ status: 404, json: { hasWorkspace: false, status: null, workspaceId: null } });
    if (path === "/api/reports") return route.fulfill({ json: { reports: [{ id: "report-a", title: "Preserved synthetic report", status: "DRAFT", createdAt: "2026-10-01T00:00:00Z" }] } });
    if (path === "/api/clients") return route.fulfill({ status: 500, json: { error: { code: "INTERNAL", message: "Synthetic error", eventId: "synthetic-client-error" } } });
    if (path === "/api/inspections") return route.fulfill({ json: { inspections: [] } });
    if (path === "/api/invoices") return route.fulfill({ json: { invoices: [{ id: "invoice-a", invoiceNumber: "SYNTHETIC-INVOICE", status: "SENT" }] } });
    if (path === "/api/user/experience-mode") return route.fulfill({ json: { experienceMode: "APPRENTICE" } });
    if (path === "/api/user/product-tour") return route.fulfill({ json: { dismissed: true } });
    if (path === "/api/onboarding/first-run") return route.fulfill({ json: { dismissed: true, allComplete: true, completedCount: 0, totalCount: 0, steps: [] } });
    if (path === "/api/billing/trial-status") return route.fulfill({ json: { data: { lifetimeAccess: true, showCountdownBanner: true, daysRemaining: 1 } } });
    if (path === "/api/user/trial-status") return route.fulfill({ json: { lifetimeAccess: true, subscriptionStatus: "TRIAL", daysRemaining: 1 } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/dashboard");
  await expect(page.getByText("Preserved synthetic report", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("SYNTHETIC-INVOICE", { exact: true })).toBeVisible();
  await expect(page.getByText(/Clients: HTTP 500.*synthetic-client-error/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start the first job" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Upgrade now/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Account and workspace" }).click();
  await expect(page.getByText("Organisation: synthetic-org", { exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Use another Google account" })).toHaveAttribute("href", "/login?switchAccount=google");
  await page.screenshot({ path: `/tmp/restoreassist-auth-evidence/dashboard-${testInfo.project.name}.png`, fullPage: true });
});

test("product-tour contract: undismissed tour can be dismissed before using the account menu", async ({ page, context }) => {
  let dismissed = false;
  let dismissRequests = 0;
  const { encode } = await import("next-auth/jwt");
  // This value matches only the isolated local test server. It is not a live credential.
  const cookie = await encode({ secret: "synthetic-local-browser-secret", token: { sub: "synthetic-a", role: "ADMIN", needsOnboarding: false, setupCompletedAt: "2026-01-01T00:00:00.000Z" } });
  await context.addCookies([{ name: "next-auth.session-token", value: cookie, url: base }]);
  const user = { id: "synthetic-a", email: "real-fixture@example.com", name: "Synthetic owner", role: "ADMIN", needsOnboarding: false };
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user, expires: "2099-01-01T00:00:00.000Z" } });
    if (path === "/api/user/profile") return route.fulfill({ json: { profile: { ...user, organizationId: "synthetic-org", businessName: "Synthetic real-jobs business", subscriptionStatus: "ACTIVE" } } });
    if (path === "/api/workspace/status") return route.fulfill({ status: 404, json: { hasWorkspace: false, status: null, workspaceId: null } });
    if (path === "/api/reports") return route.fulfill({ json: { reports: [{ id: "report-a", title: "Preserved synthetic report", status: "DRAFT", createdAt: "2026-10-01T00:00:00Z" }] } });
    if (path === "/api/clients") return route.fulfill({ status: 500, json: { error: { code: "INTERNAL", message: "Synthetic error", eventId: "synthetic-client-error" } } });
    if (path === "/api/inspections") return route.fulfill({ json: { inspections: [] } });
    if (path === "/api/invoices") return route.fulfill({ json: { invoices: [{ id: "invoice-a", invoiceNumber: "SYNTHETIC-INVOICE", status: "SENT" }] } });
    if (path === "/api/user/product-tour") {
      if (route.request().method() === "GET") return route.fulfill({ json: { dismissed } });
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({ action: "dismiss" });
      dismissed = true;
      dismissRequests++;
      return route.fulfill({ json: { success: true } });
    }
    if (path === "/api/user/experience-mode") return route.fulfill({ json: { experienceMode: "APPRENTICE" } });
    if (path === "/api/onboarding/first-run") return route.fulfill({ json: { dismissed: true, allComplete: true, completedCount: 0, totalCount: 0, steps: [] } });
    if (path === "/api/billing/trial-status") return route.fulfill({ json: { data: { lifetimeAccess: true, showCountdownBanner: true, daysRemaining: 1 } } });
    if (path === "/api/user/trial-status") return route.fulfill({ json: { lifetimeAccess: true, subscriptionStatus: "TRIAL", daysRemaining: 1 } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Welcome to RestoreAssist", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect.poll(() => dismissRequests).toBe(1);
  expect(dismissed).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Account and workspace" }).click();
  await expect(page.getByText("Organisation: synthetic-org", { exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Use another Google account" })).toHaveAttribute("href", "/login?switchAccount=google");
  expect(dismissRequests).toBe(1);
});
