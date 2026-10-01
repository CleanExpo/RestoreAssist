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
  let requests = 0;
  await page.route("**/api/auth/forgot-password", async (route) => {
    requests++;
    await route.fulfill({ status: requests === 1 ? 503 : 200, json: requests === 1 ? { error: { message: "Synthetic outage" } } : { success: true } });
  });
  await page.route("**/api/auth/reset-password", (route) => route.fulfill({ status: 400, json: { error: { message: "Invalid verification code." } } }));
  await page.goto("/forgot-password");
  await page.getByLabel("Email Address").fill("synthetic@example.com");
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
