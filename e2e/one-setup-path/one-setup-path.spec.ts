/**
 * One setup path: a new owner signs up, stops and resumes setup, invites a technician on
 * the free trial seat, and both reach a real job. On day 15 the technician stops until
 * the owner pays for the seat, and comes back when they do.
 *
 * Tests tagged @stripe make real Stripe test-mode purchases. Tests tagged @seeded stand
 * in for them when ONE_SETUP_WITHOUT_STRIPE=1 and prove nothing about buying.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { Client } from "pg";
import { generateValidAbn } from "../helpers/abn";

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const OWNER_EMAIL = `owner-${RUN}@one-setup.test`;
const TECH_EMAIL = `tech-${RUN}@one-setup.test`;
const SECOND_TECH_EMAIL = `tech2-${RUN}@one-setup.test`;
const PASSWORD = "One-setup-local-only-42!";
const TECH_STATE = `test-results/one-setup-path-tech-${RUN}.json`;
const JOB_ADDRESS = `${RUN} Harbour Road, Brisbane`;

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const client = new Client({
    connectionString: process.env.ONE_SETUP_DATABASE_URL,
    ssl: false,
  });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

const mutation = (page: Page) => ({
  origin: new URL(page.url()).origin,
  "idempotency-key": randomUUID(),
});

async function eventsFor(email: string) {
  const rows = await sql<{ eventName: string }>(
    `select a."eventName" from "ActivationEvent" a join "User" u on u.id = a."userId" where u.email = $1`,
    [email],
  );
  return rows.map((row) => row.eventName);
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(dashboard|setup|onboarding)/);
}

async function expectTechnicianBack(browser: Browser) {
  const context = await browser.newContext({ storageState: TECH_STATE });
  const technician = await context.newPage();
  await technician.goto("/api/auth/session");
  await technician.goto("/dashboard");
  await expect(technician).not.toHaveURL(/\/seat-required/);
}

async function sendInvite(page: Page) {
  await page.getByRole("button", { name: /send invitation/i }).click();
}

/** Real hosted Stripe Checkout, test mode, Stripe's published test card. */
async function payOnStripe(page: Page) {
  await page.waitForURL(/checkout\.stripe\.com/);
  await page.locator("#cardNumber").fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("One Setup Owner");
  await page.locator('[data-testid="hosted-payment-submit-button"]').click();
}

test("a Google or Apple owner goes terms, then setup, through the real gate, with one organisation", async ({
  context,
  page,
}) => {
  const id = `oauth_${RUN}`;
  const email = `oauth-${RUN}@one-setup.test`;
  await sql(
    `insert into "User" (id, email, name, role, "needsOnboarding", "updatedAt") values ($1, $2, 'OAuth Owner', 'ADMIN', true, now())`,
    [id, email],
  );
  const token = await encode({
    // What a real provider sign-in mints; lib/auth.ts refuses a token with no customExp.
    token: {
      sub: id,
      email,
      role: "ADMIN",
      needsOnboarding: true,
      customExp: Math.floor(Date.now() / 1000) + 3600,
    },
    secret: process.env.ONE_SETUP_NEXTAUTH_SECRET as string,
  });
  await context.addCookies([
    { name: "next-auth.session-token", value: token, url: "http://localhost:3117", httpOnly: true, sameSite: "Lax" },
  ]);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/onboarding\/account-type/);
  await expect(page.getByLabel(/business name/i)).toBeVisible();

  // Two tabs racing the same submit must not make two businesses.
  const post = () =>
    page.request.post("/api/onboarding/account-type", {
      data: { businessName: "OAuth Restorations", acceptedTerms: true },
      headers: mutation(page),
    });
  const answers = await Promise.all([post(), post()]);
  expect(answers.map((answer) => answer.status())).toEqual([200, 200]);
  const orgs = await sql(`select id from "Organization" where "ownerId" = $1`, [id]);
  expect(orgs).toHaveLength(1);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/setup/);
});

test("a new owner signs up, stops part way, and setup resumes", async ({ page }) => {
  await page.goto("/signup");
  await page.locator("#name").fill("One Setup Owner");
  await page.locator("#email").fill(OWNER_EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#confirmPassword").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /i agree/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/setup/);

  const saved = await page.request.patch("/api/setup/state", {
    data: {
      country: "AU",
      timezone: "Australia/Brisbane",
      legalName: `One Setup ${RUN} Pty Ltd`,
      abn: generateValidAbn(),
      state: "QLD",
    },
    headers: mutation(page),
  });
  expect(saved.status()).toBe(200);

  // Stop: leave altogether. Resume: the saved business is still there, and the gate
  // still holds the owner to setup.
  await page.context().clearCookies();
  await signIn(page, OWNER_EMAIL);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/setup/);
  const orgs = await sql<{ legalName: string }>(
    `select o."legalName" from "Organization" o join "User" u on u."organizationId" = o.id where u.email = $1`,
    [OWNER_EMAIL],
  );
  expect(orgs[0].legalName).toBe(`One Setup ${RUN} Pty Ltd`);

  const finished = await page.request.post("/api/setup/activate", {
    data: { skip: true },
    headers: mutation(page),
  });
  expect(finished.status()).toBe(200);
  // The wizard re-mints the session here; a direct call has to sign in again.
  await page.context().clearCookies();
  await signIn(page, OWNER_EMAIL);
  await page.goto("/dashboard/onboarding");
  await page.getByRole("link", { name: /invite a technician/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/team\?invite=1/);
  expect(await eventsFor(OWNER_EMAIL)).toContain("setup_completed");
});

test("the owner sends a free trial-seat invite, and a second is refused with the price and the entry kept", async ({ page }) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto("/dashboard/team?invite=1");
  const input = page.getByPlaceholder("colleague@example.com");
  await input.fill(TECH_EMAIL);
  await sendInvite(page);
  // Local runs have no email provider, so the invite answers as saved-but-unsent.
  await expect(input).toBeHidden();

  await page.goto("/dashboard/team?invite=1");
  await input.fill(SECOND_TECH_EMAIL);
  await sendInvite(page);
  const panel = page.getByRole("region", { name: /technician seat/i });
  await expect(panel).toContainText("$11");
  await expect(input).toHaveValue(SECOND_TECH_EMAIL);
  expect(await eventsFor(OWNER_EMAIL)).toContain("seat_limit_hit");

  // A closed tab loses nothing either.
  await page.goto("/dashboard/team?invite=1");
  await expect(input).toHaveValue(SECOND_TECH_EMAIL);
  await expect(input).toBeFocused();
});

test("on the free seat, the technician and owner both reach a real job", async ({ browser, page }) => {
  await signIn(page, OWNER_EMAIL);
  const invites = await sql<{ token: string }>(
    `select token from "UserInvite" where email = $1`,
    [TECH_EMAIL],
  );
  expect(invites).toHaveLength(1);

  const created = await page.request.post("/api/inspections", {
    data: { propertyAddress: JOB_ADDRESS, propertyPostcode: "4000", claimType: "WATER" },
    headers: mutation(page),
  });
  expect(created.ok()).toBe(true);
  await page.goto("/dashboard/inspections");
  await expect(page.getByText(JOB_ADDRESS).first()).toBeVisible();

  const technician = await (await browser.newContext()).newPage();
  await technician.goto(`/invite/${invites[0].token}`);
  await technician.getByLabel("Your name").fill("One Setup Tech");
  await technician.getByLabel("Mobile (used for SMS reminders)").fill("0412345678");
  await technician.getByLabel("Set a password (min 12 chars)").fill(PASSWORD);
  await technician.locator("#headshot").setInputFiles({
    name: "headshot.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(technician.getByAltText("Headshot preview")).toBeVisible();
  await technician.getByRole("button", { name: "Continue →" }).click();
  await technician.locator("#terms").click();
  await technician.locator("#cocoa").click();
  await technician.getByRole("button", { name: /^Join / }).click();
  await technician.waitForURL(/\/(login|dashboard)/);
  if (technician.url().includes("/login")) await signIn(technician, TECH_EMAIL);

  // Staff skip the owner's wizard, and they land on work, not on setup.
  await technician.goto("/dashboard");
  await expect(technician).not.toHaveURL(/\/setup/);
  const techJob = await technician.request.post("/api/inspections", {
    data: { propertyAddress: `${JOB_ADDRESS} unit 2`, propertyPostcode: "4000", claimType: "WATER" },
    headers: mutation(technician),
  });
  expect(techJob.ok()).toBe(true);
  await technician.goto("/dashboard/field");
  await expect(technician.getByText(`${JOB_ADDRESS} unit 2`).first()).toBeVisible();
  expect(await eventsFor(TECH_EMAIL)).toContain("technician_accepted");
  await technician.context().storageState({ path: TECH_STATE });
});

test("day 15: the technician stops, nothing is lost, and the owner is shown how to pay", async ({ browser, page }) => {
  // Prisma stores UTC in a column with no zone, so a bare now() would be local time.
  await sql(
    // A trial lasts 15 days, so the trial ends with the seat: the state a real owner is in.
    `update "User" set "createdAt" = (now() at time zone 'utc') - interval '15 days',
       "trialEndsAt" = now() at time zone 'utc', "subscriptionStatus" = 'EXPIRED' where email = $1`,
    [OWNER_EMAIL],
  );

  const context = await browser.newContext({ storageState: TECH_STATE });
  const technician = await context.newPage();
  await technician.goto("/api/auth/session");
  await technician.goto("/dashboard");
  await expect(technician).toHaveURL(/\/seat-required/);
  const refused = await technician.request.post("/api/inspections", {
    data: { propertyAddress: `${JOB_ADDRESS} unit 3`, propertyPostcode: "4000", claimType: "WATER" },
    headers: mutation(technician),
  });
  expect(refused.status()).toBe(402);
  const kept = await sql(`select id from "Inspection" where "propertyAddress" = $1`, [`${JOB_ADDRESS} unit 2`]);
  expect(kept).toHaveLength(1);

  await signIn(page, OWNER_EMAIL);
  await page.goto("/dashboard/team");
  await expect(page.getByRole("region", { name: /technician seat/i })).toContainText("free trial seat has ended");
});

// Has never run: no Stripe test key is available. The real purchase is UNPROVEN.
test("@stripe the owner pays for the plan, then the seat, on real Stripe test mode, and the technician is back", async ({ browser, page }) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto("/dashboard/team");
  // The trial has ended, so the plan comes first and returns here.
  await page.getByRole("button", { name: /buy a seat/i }).click();
  await payOnStripe(page);
  await page.waitForURL(/\/dashboard\/team\?invite=1/);
  await page.getByRole("button", { name: /buy a seat/i }).click();
  await payOnStripe(page);
  await page.waitForURL(/\/dashboard\/team\?invite=1/);
  expect(await eventsFor(OWNER_EMAIL)).toEqual(
    expect.arrayContaining(["seat_checkout_started", "seat_granted"]),
  );
  await expectTechnicianBack(browser);
});

test("@seeded NOT A PURCHASE: a paid row is written to the disposable database, and the technician is back", async ({ browser }) => {
  await sql(
    `update "FeatureEntitlement" set active = true, seats = 1, "stripePriceId" = 'price_seeded_not_paid'
     where "stripePriceId" = 'trial-seat' and "workspaceId" in
       (select w.id from "Workspace" w join "User" u on u.id = w."ownerId" where u.email = $1)`,
    [OWNER_EMAIL],
  );
  await expectTechnicianBack(browser);
});
