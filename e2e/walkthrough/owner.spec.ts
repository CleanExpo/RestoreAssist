/**
 * Owner journey (O1-O14) of the three-persona walkthrough.
 *
 *   npx playwright test -c e2e/walkthrough/walkthrough.config.ts --project=owner
 *
 * A brand-new restoration business signs up, runs the setup wizard, "buys" the plan and
 * every add-on, invites staff, adds a client and a water-damage job, loads every dashboard
 * page, and checks it cannot see another business's data. It hands the technician and
 * client journeys what they need through state.json (see recorder.ts).
 *
 * What this spec is written around (each checked in the source, 19/09/2026):
 * - Local production build on plain http: lib/auth.ts names the session cookie
 *   `__Secure-next-auth.session-token`, but proxy.ts getToken() reads
 *   `next-auth.session-token` because NEXTAUTH_URL is not https. See setSessionCookies().
 * - No Stripe keys: every checkout route stops at the Stripe call. Purchases are SIMULATED
 *   (a correctly signed webhook, only when STRIPE_WEBHOOK_SECRET is exported) or BYPASS (the
 *   entitlement is written to the LOCAL database the way scripts/seed-full-access-account.ts
 *   writes it; that script cannot run here because it hard-codes tenant A's ABN). A purchase
 *   step is never PASS.
 * - No email provider: invite and portal tokens are read from the local database.
 */
import {
  test,
  expect,
  request as pwRequest,
  type APIResponse,
  type BrowserContext,
  type Locator,
  type Page,
  type Response as PwResponse,
} from "@playwright/test";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { generateValidAbn } from "../helpers/abn";
import { RESULTS_DIR, localQuery, step, watch, writeState } from "./recorder";

test.describe.configure({ mode: "serial" });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");
const TITLES: Record<string, string> = Object.fromEntries(
  (JSON.parse(readFileSync(path.join(HERE, "steps.json"), "utf8")).steps as { id: string; title: string }[]).map(
    (s) => [s.id, s.title],
  ),
);
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const HOST = new URL(BASE).hostname;
const RUN = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const SECURE_COOKIE = "__Secure-next-auth.session-token";
const PLAIN_COOKIE = "next-auth.session-token";
// Tenant B: seeded by .github/workflows/sketch-e2e.yml through scripts/seed-e2e-user.ts (role USER).
const TENANT_B_EMAIL = "e2e-tenant-b@restoreassist.app";
// AddonSku -> Stripe subscription metadata.type (lib/billing/*-addon.ts, addon-registry.ts).
const ADDONS: Record<string, string> = {
  FLOORPLAN_UNDERLAY: "floorplan_underlay_addon",
  BOOKKEEPING: "bookkeeping_addon",
  SERVICE_CRM: "service_crm_addon",
  PAYMENTS: "payments_addon",
  CLIENT_COMMS: "client_comms_addon",
  VOICE: "voice_addon",
  TECHNICIAN_SEATS: "technician_seats_addon",
  CLIENT_EDUCATION: "client_education_addon",
  AI_COPILOT: "ai_copilot_addon",
};
const TECH_SEATS = 2;

type Role = "ADMIN" | "USER" | "MANAGER";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

// ---------------------------------------------------------------- small helpers
const ok = (s: number) => s >= 200 && s < 300;
const clip = (v: unknown, n = 200) =>
  (typeof v === "string" ? v : JSON.stringify(v ?? "")).replace(/\s+/g, " ").slice(0, n);
const safePath = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};
const causes = (a: string, b: string, c: string) => `; likely causes: (1) ${a} (2) ${b} (3) ${c}`;
/** Headers every mutating call needs: CSRF origin (team invites require it) and an idempotency key. */
const mutation = () => ({ origin: BASE, "idempotency-key": `walkthrough-${randomUUID()}` });
const isCall = (fragment: string) => (r: PwResponse) => r.url().includes(fragment) && r.request().method() === "POST";
const visible = (l: Locator, ms: number) => l.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);

async function body(res: APIResponse): Promise<Json> {
  try {
    return (await res.json()) as Json;
  } catch {
    return {};
  }
}
function errText(j: Json): string {
  const e = j?.error;
  return String(typeof e === "string" ? e : (e?.message ?? j?.message ?? ""));
}

// ---------------------------------------------------------------- sessions
/** Mint a session JWT through the test helper, from a cookie-less context (the helper is not setup-gate exempt). */
async function helperJwt(email: string, role: Role, setupDone: boolean): Promise<{ jwt?: string; status: number; note: string }> {
  const api = await pwRequest.newContext({ baseURL: BASE });
  try {
    const res = await api.post("/api/test/sign-in-as", {
      data: setupDone ? { role, email } : { role, email, setupCompletedAt: null },
      failOnStatusCode: false,
      timeout: 20_000,
    });
    const m = (res.headers()["set-cookie"] ?? "").match(/next-auth\.session-token=([^;\s]+)/);
    return {
      jwt: res.ok() && m ? m[1] : undefined,
      status: res.status(),
      note: res.ok() ? "" : clip(await res.text().catch(() => ""), 160),
    };
  } finally {
    await api.dispose();
  }
}

/**
 * Local-http harness workaround, not product behaviour: store the one session JWT under BOTH
 * cookie names, because proxy.ts (middleware) reads `next-auth.session-token` on http while
 * NextAuth and getServerSession use `__Secure-next-auth.session-token` in a production build.
 */
async function setSessionCookies(ctx: BrowserContext, jwt: string): Promise<string[]> {
  const problems: string[] = [];
  for (const [name, secure] of [
    [PLAIN_COOKIE, false],
    [SECURE_COOKIE, true],
  ] as const) {
    try {
      await ctx.addCookies([{ name, value: jwt, domain: HOST, path: "/", httpOnly: true, secure, sameSite: "Lax" }]);
    } catch (e) {
      problems.push(`${name}: ${clip((e as Error).message, 100)}`);
    }
  }
  return problems;
}

/** Who getServerSession says is signed in (the API side, not the middleware side). */
async function sessionEmail(page: Page): Promise<string> {
  const r = await page.request.get("/api/auth/session", { failOnStatusCode: false, timeout: 15_000 });
  return String((await body(r))?.user?.email ?? "").toLowerCase();
}

async function signInAs(page: Page, email: string, role: Role, setupDone: boolean): Promise<{ ok: boolean; note: string }> {
  const h = await helperJwt(email, role, setupDone);
  if (!h.jwt) return { ok: false, note: `sign-in-as ${h.status} ${h.note}` };
  const problems = await setSessionCookies(page.context(), h.jwt);
  const who = await sessionEmail(page);
  return {
    ok: who === email.toLowerCase(),
    note: `test-helper session (sign-in-as ${h.status}), server sees ${who || "nobody"}${problems.length ? `; cookie errors: ${problems.join(" | ")}` : ""}`,
  };
}

/** Re-use the browser's own NextAuth cookie when it has one; returns the email the server then sees. */
async function mirrorRealCookie(page: Page): Promise<string> {
  const real = (await page.context().cookies()).find((c) => c.name === SECURE_COOKIE);
  if (!real) return "";
  await setSessionCookies(page.context(), real.value);
  return sessionEmail(page);
}

// ---------------------------------------------------------------- purchases (SIMULATED / BYPASS)
let webhookUsable = false;

/** A Stripe-format signed event sent to the LOCAL webhook. Needs STRIPE_WEBHOOK_SECRET; never logs it. */
async function sendStripeEvent(type: string, object: Json): Promise<{ status: number; note: string }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { status: 0, note: "no STRIPE_WEBHOOK_SECRET exported, so no signed event could be built" };
  const created = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    id: `evt_walkthrough_${RUN}_${randomUUID().slice(0, 8)}`,
    object: "event",
    created,
    livemode: false,
    type,
    data: { object },
  });
  const sig = createHmac("sha256", secret).update(`${created}.${payload}`).digest("hex");
  const api = await pwRequest.newContext({ baseURL: BASE });
  try {
    const r = await api.post("/api/webhooks/stripe", {
      data: payload,
      headers: { "content-type": "application/json", "stripe-signature": `t=${created},v1=${sig}` },
      failOnStatusCode: false,
      timeout: 30_000,
    });
    return { status: r.status(), note: `${type} -> ${r.status()} ${clip(await r.text().catch(() => ""), 120)}` };
  } finally {
    await api.dispose();
  }
}

/**
 * BYPASS writer, the only write this spec makes outside the app's own HTTP routes. Mirrors
 * scripts/seed-full-access-account.ts (User -> ACTIVE, FeatureEntitlement rows), refuses any
 * non-local DATABASE_URL, and accepts exactly two statement shapes.
 */
async function bypassWrite(sql: string, params: unknown[]): Promise<number> {
  const url = process.env.DATABASE_URL || "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  if (host !== "localhost" && host !== "127.0.0.1") throw new Error(`BYPASS refuses non-local DATABASE_URL host "${host}"`);
  if (!/^\s*(update "User" set|insert into "FeatureEntitlement")/i.test(sql)) throw new Error("BYPASS writer: statement not allowed");
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query(sql, params)).rowCount ?? 0;
  } finally {
    await c.end();
  }
}

async function subscriptionStatus(userId: string): Promise<string> {
  const r = await localQuery<{ s: string | null }>(`select "subscriptionStatus"::text as s from "User" where id = $1`, [userId]);
  return r[0]?.s ?? "";
}
async function entitled(workspaceId: string, sku: string): Promise<boolean> {
  const r = await localQuery<{ active: boolean }>(
    `select active from "FeatureEntitlement" where "workspaceId" = $1 and sku = $2::"AddonSku"`,
    [workspaceId, sku],
  );
  return r[0]?.active === true;
}
async function addonReports(userId: string): Promise<number> {
  const r = await localQuery<{ n: number | null }>(`select "addonReports" as n from "User" where id = $1`, [userId]);
  return Number(r[0]?.n ?? 0);
}

// ---------------------------------------------------------------- page loading (O9, O13)
interface Load {
  route: string;
  status: number;
  finalPath: string;
  fiveXX: string[];
  error?: string;
}

async function loadRoute(page: Page, route: string, shotDir?: string): Promise<Load> {
  const out: Load = { route, status: 0, finalPath: "", fiveXX: [] };
  const on5xx = (r: PwResponse) => {
    if (r.status() >= 500) out.fiveXX.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 120)}`);
  };
  page.on("response", on5xx);
  try {
    const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 25_000 });
    out.status = res?.status() ?? 0;
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
    if (shotDir) {
      await page
        .screenshot({ path: path.join(shotDir, `${route.replace(/[^\w-]+/g, "_").slice(0, 150)}.png`) })
        .catch(() => undefined);
    }
  } catch (e) {
    out.error = clip((e as Error).message, 120);
  } finally {
    page.off("response", on5xx);
    out.finalPath = safePath(page.url());
  }
  return out;
}

function judge(loads: Load[]) {
  const fiveXX = loads.filter((l) => l.fiveXX.length > 0 || l.status >= 500);
  const bounced = loads.filter(
    (l) => /^\/(login|setup)(\/|$)/.test(l.finalPath) && !/^\/(login|setup)/.test(l.route),
  );
  const errors = loads.filter((l) => l.error);
  const clientErr = loads.filter((l) => l.status >= 400 && l.status < 500);
  const brief = (ls: Load[], f: (l: Load) => string) => clip(ls.map(f).join(", "), 500);
  return { fiveXX, bounced, errors, clientErr, brief };
}

/**
 * Every app/dashboard/** /page.tsx as a URL. A dynamic segment is filled from `fill`, keyed by
 * "<parent>/<[segment]>"; a route with an unfillable segment is skipped and listed.
 */
function dashboardRoutes(fill: Record<string, string | undefined>): { routes: string[]; skipped: string[] } {
  const root = path.join(REPO_ROOT, "app", "dashboard");
  const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => path.basename(f) === "page.tsx").sort();
  const routes: string[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    const dir = path.dirname(f);
    const segs = (dir === "." ? [] : dir.split(path.sep)).filter((s) => !/^\(.+\)$/.test(s));
    const parts: string[] = [];
    let missing = false;
    segs.forEach((s, i) => {
      const v = s.startsWith("[") ? fill[`${segs[i - 1] ?? ""}/${s}`] : s;
      if (!v) missing = true;
      else parts.push(s.startsWith("[") ? encodeURIComponent(v) : v);
    });
    if (missing) skipped.push(["/dashboard", ...segs].join("/"));
    else routes.push(["/dashboard", ...parts].join("/"));
  }
  return { routes, skipped };
}

// ================================================================ the journey
test("owner journey: sign up, set up, buy, invite, add a job, load every page, stay isolated", async ({ page }) => {
  test.setTimeout(50 * 60_000);
  watch(page);
  const ctx = page.context();
  const ownerName = `Walkthrough Owner ${RUN}`;
  const ownerEmail = `walkthrough-owner-${RUN}@example.com`;
  // Generated per run for a synthetic account; never written to state, results or logs.
  const ownerPassword = `Wt-${randomBytes(12).toString("base64url")}9!`;
  const abn = generateValidAbn();
  let ownerUserId = "";
  let clientId = "";
  let jobId = "";
  let reportId = "";

  const ownerId = async (): Promise<string> => {
    if (!ownerUserId) {
      const r = await localQuery<{ id: string }>(`select id from "User" where email = $1`, [ownerEmail]);
      ownerUserId = r[0]?.id ?? "";
    }
    if (!ownerUserId) throw new Error(`owner ${ownerEmail} not found in the local database (O2 did not create it)`);
    return ownerUserId;
  };
  const workspaceOf = async (uid: string): Promise<string> => {
    const q = () =>
      localQuery<{ id: string }>(`select id from "Workspace" where "ownerId" = $1 order by "createdAt" asc limit 1`, [uid]);
    let r = await q();
    if (!r[0]) {
      // The app provisions the workspace lazily here (provider-connections GET -> ensureWorkspaceForUser).
      await page.request.get("/api/workspace/provider-connections", { failOnStatusCode: false, timeout: 20_000 });
      r = await q();
    }
    return r[0]?.id ?? "";
  };

  // ------------------------------------------------------------ O1
  await step(page, "O1", TITLES.O1, async () => {
    const home = await page.goto("/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    const pricing = await page.goto("/pricing", { waitUntil: "domcontentloaded", timeout: 30_000 });
    const price = await visible(page.getByText(/\$99/).first(), 10_000);
    const hs = home?.status() ?? 0;
    const ps = pricing?.status() ?? 0;
    const pass = hs > 0 && hs < 400 && ps > 0 && ps < 400 && price;
    return {
      outcome: pass ? "PASS" : "FAIL",
      status: ps || undefined,
      url: `${BASE}/pricing`,
      method: "GET",
      note:
        `home ${hs}, /pricing ${ps}, "$99" visible=${price}` +
        (pass ? "" : causes("server not up or build broken", "a required env var is missing so the root layout throws (lib/env-check.ts)", "pricing copy changed")),
    };
  });

  // ------------------------------------------------------------ O2
  await step(page, "O2", TITLES.O2, async () => {
    const notes: string[] = [];
    let uiStatus = 0;
    try {
      await page.goto("/signup", { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.locator("#name").fill(ownerName, { timeout: 10_000 });
      await page.locator("#email").fill(ownerEmail);
      await page.locator("#password").fill(ownerPassword);
      await page.locator("#confirmPassword").fill(ownerPassword);
      await page
        .getByRole("checkbox", { name: /i agree/i })
        .click({ timeout: 5_000 })
        .catch(() => page.locator('input[type="checkbox"]').first().check({ timeout: 5_000 }));
      const [reg] = await Promise.all([
        page.waitForResponse(isCall("/api/auth/register"), { timeout: 30_000 }),
        page.getByRole("button", { name: /create account/i }).click({ timeout: 10_000 }),
      ]);
      uiStatus = reg.status();
      notes.push(`UI sign-up -> POST /api/auth/register ${uiStatus}${ok(uiStatus) ? "" : ` "${clip(errText(await reg.json().catch(() => ({}))), 120)}"`}`);
      await page.waitForURL(/\/(dashboard|login|setup)/, { timeout: 20_000 }).catch(() => undefined);
      notes.push(`browser landed on ${safePath(page.url())}`);
    } catch (e) {
      notes.push(`UI sign-up broke: ${clip((e as Error).message, 150)}`);
    }
    if (!ok(uiStatus)) {
      const r = await page.request.post("/api/auth/register", {
        data: { name: ownerName, email: ownerEmail, password: ownerPassword, acceptedTerms: true },
        headers: { origin: BASE },
        failOnStatusCode: false,
        timeout: 30_000,
      });
      notes.push(`fallback API register ${r.status()}`);
    }
    let row = (
      await localQuery<{ id: string; role: string; status: string | null; org: string | null }>(
        `select id, role::text as role, "subscriptionStatus"::text as status, "organizationId" as org from "User" where email = $1`,
        [ownerEmail],
      )
    )[0];
    const names = (await ctx.cookies()).filter((c) => c.name.includes("next-auth")).map((c) => c.name);
    notes.push(`cookies after sign-up: ${names.join(",") || "none"}`);
    // Sign in: the browser's own login cookie first; the test helper only if that is not usable.
    let who = row ? await mirrorRealCookie(page) : "";
    if (who === ownerEmail.toLowerCase()) notes.push("real login cookie used");
    else {
      const h = await signInAs(page, ownerEmail, "ADMIN", false);
      who = h.ok ? ownerEmail.toLowerCase() : "";
      notes.push(`${row ? "real login cookie not usable" : "owner created by the test helper so later steps can run"}: ${h.note}`);
      if (!row) {
        row = (
          await localQuery<{ id: string; role: string; status: string | null; org: string | null }>(
            `select id, role::text as role, "subscriptionStatus"::text as status, "organizationId" as org from "User" where email = $1`,
            [ownerEmail],
          )
        )[0];
      }
    }
    notes.push(
      "local-http harness workaround: session copied under both cookie names (middleware reads next-auth.session-token on http, the app sets __Secure-next-auth.session-token); not product behaviour",
    );
    if (row) {
      ownerUserId = row.id;
      writeState({ ownerEmail, ownerUserId });
      notes.push(`db: role=${row.role}, subscription=${row.status}, organisation=${row.org ? "created" : "none"}`);
    }
    await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    notes.push(`/dashboard now -> ${safePath(page.url())} (setup gate)`);
    const pass = ok(uiStatus) && !!row && who === ownerEmail.toLowerCase();
    return {
      outcome: pass ? "PASS" : "FAIL",
      status: uiStatus || undefined,
      url: `${BASE}/api/auth/register`,
      method: "POST",
      note:
        `ABN is not asked at sign-up (it is entered in O3: ${abn}); ` +
        notes.join("; ") +
        (pass ? "" : causes("register refused (rate limit 10 per 15 min, CSRF, validation)", "sign-up page selectors changed", "session cookie not accepted on http://localhost")),
    };
  });

  // ------------------------------------------------------------ O3
  await step(page, "O3", TITLES.O3, async () => {
    const uid = await ownerId();
    const notes: string[] = [];
    const ws = await page.request.get("/api/workspace/provider-connections", { failOnStatusCode: false, timeout: 20_000 });
    notes.push(`workspace GET /api/workspace/provider-connections ${ws.status()}`);
    const ai = process.env.ANTHROPIC_API_KEY
      ? (["ANTHROPIC", process.env.ANTHROPIC_API_KEY] as const)
      : process.env.OPENAI_API_KEY
        ? (["OPENAI", process.env.OPENAI_API_KEY] as const)
        : null;
    if (ai) {
      const save = await page.request.post("/api/workspace/provider-connections", {
        data: { provider: ai[0], apiKey: ai[1] },
        headers: mutation(),
        failOnStatusCode: false,
        timeout: 30_000,
      });
      const val = await page.request.post("/api/workspace/provider-connections/validate", {
        data: { provider: ai[0] },
        headers: mutation(),
        failOnStatusCode: false,
        timeout: 60_000,
      });
      notes.push(`AI key (${ai[0]}) sent to the local API, never typed or logged: save ${save.status()}, validate ${val.status()}`);
    } else notes.push("no ANTHROPIC_API_KEY or OPENAI_API_KEY exported for the AI-key step");

    const patchState = async () =>
      (
        await page.request.patch("/api/setup/state", {
          data: { country: "AU", timezone: "Australia/Brisbane", legalName: `Walkthrough Restorations ${RUN} Pty Ltd`, abn, state: "QLD", primaryColor: "#1C2E47" },
          headers: mutation(),
          failOnStatusCode: false,
          timeout: 20_000,
        })
      ).status();

    const h2 = page.locator("main h2").first();
    const seen: string[] = [];
    let blockedAt = "";
    let businessTried = false;
    let reachedLast = false;
    await page.goto("/setup", { waitUntil: "domcontentloaded", timeout: 30_000 });
    for (let i = 0; i < 16; i++) {
      const title = ((await h2.textContent({ timeout: 10_000 }).catch(() => "")) ?? "").trim();
      if (!title) {
        blockedAt = `no step heading on ${safePath(page.url())}`;
        break;
      }
      if (!seen.includes(title)) seen.push(title);
      if (/your first report/i.test(title)) {
        reachedLast = true;
        break;
      }
      if (/branding/i.test(title)) await page.getByRole("button", { name: /navy bronze/i }).first().click({ timeout: 5_000 }).catch(() => undefined);
      const next = page.getByRole("button", { name: /^next/i });
      const enabled = await next.isEnabled({ timeout: 5_000 }).catch(() => false);
      if (!enabled && /business details/i.test(title) && !businessTried) {
        businessTried = true;
        try {
          await page.locator("#abn").fill(abn, { timeout: 5_000 });
          const [hy] = await Promise.all([
            page.waitForResponse(isCall("/api/setup/hydrate"), { timeout: 20_000 }),
            page.getByRole("button", { name: /start setup/i }).click({ timeout: 5_000 }),
          ]);
          notes.push(`UI "Start setup" with ABN -> hydrate ${hy.status()}`);
        } catch (e) {
          notes.push(`UI ABN entry failed: ${clip((e as Error).message, 100)}`);
        }
        // Without ABR_API_GUID the register lookup errors, so enter what it would have filled.
        notes.push(`legal name/state entered manually (ABR lookup unavailable locally): PATCH /api/setup/state ${await patchState()}`);
        await page.reload({ waitUntil: "domcontentloaded" }); // the wizard re-opens at step 1
        continue;
      }
      if (!enabled) {
        blockedAt = title;
        break;
      }
      await next.click({ timeout: 5_000 });
      await expect(h2).not.toHaveText(title, { timeout: 8_000 }).catch(() => undefined);
    }
    if (!reachedLast) {
      if (!businessTried) {
        const hy = await page.request.post("/api/setup/hydrate", { data: { abn }, headers: mutation(), failOnStatusCode: false, timeout: 20_000 });
        notes.push(`business details via API: state ${await patchState()}, hydrate ${hy.status()}`);
      }
      const pr = await page.request.patch("/api/setup/pricing", {
        data: { masterQualifiedNormalHours: 125 },
        headers: mutation(),
        failOnStatusCode: false,
        timeout: 20_000,
      });
      notes.push(`pricing via API ${pr.status()}`);
    }

    // Finish the normal way first; "Skip setup for now" only when that is refused.
    let act = 0;
    let failed = "";
    if (reachedLast) {
      try {
        const [r] = await Promise.all([
          page.waitForResponse(isCall("/api/setup/activate"), { timeout: 30_000 }),
          page.getByRole("button", { name: /generate your first report/i }).click({ timeout: 8_000 }),
        ]);
        act = r.status();
        failed = clip((await r.json().catch(() => ({})))?.failedChecks ?? "", 200);
      } catch (e) {
        notes.push(`"Generate your first report" failed: ${clip((e as Error).message, 100)}`);
      }
    }
    if (!act) {
      const r = await page.request.post("/api/setup/activate", { headers: mutation(), failOnStatusCode: false, timeout: 30_000 });
      act = r.status();
      failed = clip((await body(r)).failedChecks ?? "", 200);
      notes.push("finish button not reachable; called the route it calls");
    }
    notes.push(`activate (normal) ${act}${failed && failed !== '""' ? ` failedChecks=${failed}` : ""}`);
    let skipped = false;
    if (!ok(act) && act !== 409) {
      skipped = true;
      let s = 0;
      if (!/\/setup/.test(page.url())) await page.goto("/setup", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
      try {
        const [r] = await Promise.all([
          page.waitForResponse(isCall("/api/setup/activate"), { timeout: 20_000 }),
          page.getByRole("button", { name: /skip setup for now/i }).click({ timeout: 8_000 }),
        ]);
        s = r.status();
      } catch {
        s = (await page.request.post("/api/setup/activate", { data: { skip: true }, headers: mutation(), failOnStatusCode: false })).status();
      }
      notes.push(`"Skip setup for now" -> activate(skip) ${s}`);
    }
    const org = (
      await localQuery<{ done: Date | null }>(
        `select o."setupCompletedAt" as done from "Organization" o join "User" u on u."organizationId" = o.id where u.id = $1`,
        [uid],
      )
    )[0];
    // Refresh the session so the middleware sees setupCompletedAt: real cookie first, helper second.
    // A session read makes NextAuth re-mint its cookie with setupCompletedAt; mirror it afterwards.
    await sessionEmail(page);
    let landed = "";
    if ((await mirrorRealCookie(page)) === ownerEmail.toLowerCase()) {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
      landed = safePath(page.url());
    }
    if (!landed.startsWith("/dashboard")) {
      const re = await signInAs(page, ownerEmail, "ADMIN", true);
      notes.push(`session re-minted after setup: ${re.note}`);
    }
    const pass = seen.length >= 7 && reachedLast && ok(act) && !!org?.done;
    return {
      outcome: pass ? "PASS" : "FAIL",
      status: act || undefined,
      url: `${BASE}/api/setup/activate`,
      method: "POST",
      note:
        `steps seen ${seen.length}/7 [${seen.join(" > ")}]${blockedAt ? `; Next disabled at "${blockedAt}"` : ""}; ` +
        `${notes.join("; ")}; setupCompletedAt ${org?.done ? "set" : "NULL"}${skipped ? " (only through Skip)" : ""}` +
        (pass
          ? ""
          : causes(
              "the AI-key step is required when neither the server nor this run has an AI key",
              "activation pre-flight checks need Gemma, Mailtrap and branding config that the local stack lacks",
              "the business-register lookup is unreachable without ABR_API_GUID",
            )),
    };
  });

  // ------------------------------------------------------------ O4 (control, G4)
  await step(page, "O4", TITLES.O4, async () => {
    const uid = await ownerId();
    const ws = await workspaceOf(uid);
    let status = 0;
    let j: Json = {};
    let via = "";
    await page.goto("/dashboard/addons", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    const buy = page.getByRole("button", { name: /add pack/i }).first();
    if (await visible(buy, 10_000)) {
      try {
        const [r] = await Promise.all([page.waitForResponse(isCall("/api/addons/checkout"), { timeout: 20_000 }), buy.click({ timeout: 5_000 })]);
        status = r.status();
        j = await r.json().catch(() => ({}));
        via = 'UI "Add pack"';
      } catch {
        status = 0;
      }
    }
    if (!status) {
      const r = await page.request.post("/api/addons/checkout", { data: { addonKey: "VOICE" }, headers: mutation(), failOnStatusCode: false });
      status = r.status();
      j = await body(r);
      via = "API (VOICE)";
    }
    const refused = status === 403 && (j.upgradeRequired === true || /active subscription/i.test(errText(j)));
    const base = `trial owner, add-on checkout via ${via}: ${status} "${clip(errText(j), 100)}"; workspace ${ws ? "exists (created in O3 by the provider-connections GET)" : "missing"}`;
    return refused
      ? { outcome: "EXPECTED-BY-CODE", gap: "G4", status, url: `${BASE}/api/addons/checkout`, method: "POST", note: `G4 confirmed: ${base}` }
      : {
          outcome: "FAIL",
          gap: "G4",
          status: status || undefined,
          url: `${BASE}/api/addons/checkout`,
          method: "POST",
          note: `expected 403 while on trial; ${base}` + causes("owner is not TRIAL any more", "check order in app/api/addons/checkout changed", "request refused earlier (CSRF, rate limit, auth)"),
        };
  });

  // ------------------------------------------------------------ O5
  await step(page, "O5", TITLES.O5, async () => {
    const uid = await ownerId();
    const notes: string[] = [];
    await page.goto("/dashboard/subscription", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    const co = await page.request.post("/api/create-checkout-session", { data: { plan: "monthly" }, headers: mutation(), failOnStatusCode: false, timeout: 30_000 });
    notes.push(`real checkout POST /api/create-checkout-session ${co.status()} "${clip(errText(await body(co)), 80)}"`);
    const sim = await sendStripeEvent("checkout.session.completed", {
      id: `cs_test_walkthrough_${RUN}_plan`,
      object: "checkout.session",
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
      amount_total: 9900,
      currency: "aud",
      customer: `cus_walkthrough_${RUN}`,
      subscription: null,
      metadata: { userId: uid },
    });
    webhookUsable = ok(sim.status);
    notes.push(`SIMULATED attempt: ${sim.note}`);
    if (webhookUsable && (await subscriptionStatus(uid)) === "ACTIVE") {
      return { outcome: "SIMULATED", status: sim.status, url: `${BASE}/api/webhooks/stripe`, method: "POST", note: `${notes.join("; ")}; User.subscriptionStatus ACTIVE` };
    }
    try {
      const n = await bypassWrite(
        `UPDATE "User" SET "subscriptionStatus" = 'ACTIVE'::"SubscriptionStatus", "subscriptionPlan" = 'Monthly Plan', "subscriptionEndsAt" = now() + interval '30 days', "creditsRemaining" = 999999, "updatedAt" = now() WHERE id = $1`,
        [uid],
      );
      notes.push(`BYPASS: plan set ACTIVE in the local database (${n} row)`);
    } catch (e) {
      notes.push(`BYPASS write failed: ${clip((e as Error).message, 120)}`);
    }
    const now = await subscriptionStatus(uid);
    return now === "ACTIVE"
      ? { outcome: "BYPASS", note: `${notes.join("; ")}; User.subscriptionStatus ACTIVE` }
      : {
          outcome: "FAIL",
          note: `${notes.join("; ")}; subscriptionStatus still ${now}` + causes("no Stripe secret key, so the webhook cannot verify events", "local DATABASE_URL not reachable for the BYPASS write", "schema changed (SubscriptionStatus enum or column names)"),
        };
  });

  // ------------------------------------------------------------ O6
  await step(page, "O6", TITLES.O6, async () => {
    const uid = await ownerId();
    const wsId = await workspaceOf(uid);
    if (!wsId) {
      return { outcome: "FAIL", note: "owner has no Workspace, so no add-on can attach" + causes("O3 never reached the workspace provisioning route", "ensureWorkspaceForUser failed", "workspace owned through a membership, not ownerId") };
    }
    const notes: string[] = [];
    const probe = async () => {
      const r = await page.request.post("/api/elevenlabs/sfx", { data: { text: "walkthrough gate probe" }, headers: mutation(), failOnStatusCode: false, timeout: 20_000 });
      const j = await body(r);
      return `${r.status()}${j?.code ? ` ${j.code}` : ""}`;
    };
    const before = await probe();
    await page.goto("/dashboard/addons", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    const buy = page.getByRole("button", { name: /add pack/i }).first();
    let real = "not reached";
    if (await visible(buy, 10_000)) {
      try {
        const [r] = await Promise.all([page.waitForResponse(isCall("/api/addons/checkout"), { timeout: 30_000 }), buy.click({ timeout: 5_000 })]);
        real = String(r.status());
      } catch (e) {
        real = `error ${clip((e as Error).message, 60)}`;
      }
    }
    notes.push(`real add-on checkout as an ACTIVE owner (UI "Add pack") -> ${real}`);
    const how: Record<string, string> = {};
    for (const [sku, type] of Object.entries(ADDONS)) {
      const seats = sku === "TECHNICIAN_SEATS" ? TECH_SEATS : 1;
      if (webhookUsable) {
        const r = await sendStripeEvent("customer.subscription.created", {
          id: `sub_walkthrough_${RUN}_${sku.toLowerCase()}`,
          object: "subscription",
          status: "active",
          customer: `cus_walkthrough_${RUN}`,
          metadata: { type, sku, workspaceId: wsId, userId: uid },
          items: {
            object: "list",
            data: [
              {
                id: `si_walkthrough_${RUN}_${sku.toLowerCase()}`,
                object: "subscription_item",
                quantity: seats,
                current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
                price: { id: `price_walkthrough_${sku.toLowerCase()}`, object: "price" },
              },
            ],
          },
        });
        if (ok(r.status) && (await entitled(wsId, sku))) {
          how[sku] = "SIMULATED";
          continue;
        }
      }
      try {
        await bypassWrite(
          `INSERT INTO "FeatureEntitlement" ("id", "workspaceId", "sku", "active", "seats", "createdAt", "updatedAt") VALUES ($1, $2, $3::"AddonSku", true, $4, now(), now()) ON CONFLICT ("workspaceId", "sku") DO UPDATE SET "active" = true, "seats" = EXCLUDED."seats", "updatedAt" = now()`,
          [`walkthrough_${RUN}_${sku.toLowerCase()}`, wsId, sku, sku === "TECHNICIAN_SEATS" ? TECH_SEATS : null],
        );
        how[sku] = (await entitled(wsId, sku)) ? "BYPASS" : "MISSING";
      } catch (e) {
        how[sku] = `MISSING (${clip((e as Error).message, 60)})`;
      }
    }
    const after = await probe();
    const cat = await page.request.get("/api/addons/catalog", { failOnStatusCode: false, timeout: 20_000 });
    const cj = await body(cat);
    const owned: string[] = cj.owned ?? cj.data?.owned ?? [];
    const ownedAll = Object.keys(ADDONS).filter((s) => owned.includes(s)).length;
    await page.goto("/dashboard/addons", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    const badges = await page.getByText(/^\s*Active\s*$/).count().catch(() => 0);
    const mech = Object.values(how);
    const allIn = mech.every((m) => m === "SIMULATED" || m === "BYPASS") && ownedAll === 9;
    const gate = /^402/.test(before) && !/^402/.test(after) ? "opened" : `inconclusive`;
    notes.push(
      `per add-on: ${Object.entries(how).map(([k, v]) => `${k}=${v}`).join(", ")} (Technician Seats x${TECH_SEATS})`,
      `/api/addons/catalog ${cat.status()} owns ${ownedAll}/9`,
      `"Active" badges on /dashboard/addons: ${badges}`,
      `VOICE gate probe POST /api/elevenlabs/sfx before ${before}, after ${after}: gate ${gate}`,
      "the other eight add-ons gate API routes or server code rather than a page of their own, so they are checked by the add-ons page and catalog only",
    );
    return {
      outcome: !allIn ? "FAIL" : mech.every((m) => m === "SIMULATED") ? "SIMULATED" : "BYPASS",
      status: cat.status(),
      url: `${BASE}/api/addons/catalog`,
      method: "GET",
      note: notes.join("; ") + (allIn ? "" : causes("no Stripe secret key so events are rejected", "BYPASS write refused or failed", "catalog reads a different workspace than the owner's")),
    };
  });

  // ------------------------------------------------------------ O7
  await step(page, "O7", TITLES.O7, async () => {
    const uid = await ownerId();
    const notes: string[] = [];
    const before = await addonReports(uid);
    const real = await page.request.post("/api/addons/checkout", { data: { addonKey: "pack8" }, headers: mutation(), failOnStatusCode: false, timeout: 30_000 });
    notes.push(`real report-pack checkout (pack8) ${real.status()} "${clip(errText(await body(real)), 80)}"`);
    const sessionId = `cs_test_walkthrough_${RUN}_pack8`;
    if (webhookUsable) {
      const r = await sendStripeEvent("checkout.session.completed", {
        id: sessionId,
        object: "checkout.session",
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        amount_total: 2000,
        currency: "aud",
        customer: `cus_walkthrough_${RUN}`,
        payment_intent: null,
        metadata: { userId: uid, addonKey: "pack8", addonReports: "8", type: "addon" },
      });
      notes.push(`SIMULATED attempt: ${r.note}`);
      const rows = await localQuery<{ s: string }>(`select status::text as s from "AddonPurchase" where "stripeSessionId" = $1`, [sessionId]);
      const mid = await addonReports(uid);
      if (ok(r.status) && rows[0] && mid >= before + 8) {
        return { outcome: "SIMULATED", status: r.status, url: `${BASE}/api/webhooks/stripe`, method: "POST", note: `${notes.join("; ")}; AddonPurchase ${rows[0].s}, addonReports ${before} -> ${mid}` };
      }
    } else notes.push("SIMULATED not attempted: the webhook was unusable in O5");
    try {
      // The entitlement a pack grants is User.addonReports; no purchase record is fabricated.
      await bypassWrite(`UPDATE "User" SET "addonReports" = COALESCE("addonReports", 0) + 8, "updatedAt" = now() WHERE id = $1`, [uid]);
    } catch (e) {
      notes.push(`BYPASS write failed: ${clip((e as Error).message, 120)}`);
    }
    const after = await addonReports(uid);
    notes.push(`addonReports ${before} -> ${after}`);
    return after >= before + 8
      ? { outcome: "BYPASS", note: notes.join("; ") }
      : { outcome: "FAIL", note: notes.join("; ") + causes("no Stripe secret key", "BYPASS write failed", "addonReports column renamed") };
  });

  // ------------------------------------------------------------ O8
  await step(page, "O8", TITLES.O8, async () => {
    const pg = await page.goto("/job-file-audit", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
    const r = await page.request.post("/api/revenue/job-file-audit/checkout", { data: { package: "single" }, headers: mutation(), failOnStatusCode: false, timeout: 30_000 });
    const j = await body(r);
    return {
      outcome: "FAIL",
      status: r.status(),
      url: `${BASE}/api/revenue/job-file-audit/checkout`,
      method: "POST",
      note:
        `/job-file-audit page ${pg?.status() ?? "no response"}; checkout ${r.status()} "${clip(errText(j) || j.url, 100)}". ` +
        "Not SIMULATED: the Stripe webhook ignores Job File Audit sessions and fulfilment (/api/revenue/job-file-audit/intake) re-reads the session from Stripe. " +
        "Not BYPASSED: there is no entitlement to seed, only a support ticket, and inventing one would present a fake order as real" +
        causes("no Stripe secret key on the local stack", "fulfilment depends on a live Stripe session lookup", "no local test price for the audit product"),
    };
  });

  // ------------------------------------------------------------ O9
  await step(page, "O9", TITLES.O9, async () => {
    const all = dashboardRoutes({}).routes;
    const routes = [
      ...all.filter((r) => r === "/dashboard/settings" || r.startsWith("/dashboard/settings/")),
      "/dashboard/pricing-config",
      ...all.filter((r) => r === "/dashboard/integrations" || r.startsWith("/dashboard/integrations/")),
      "/dashboard/invoices/templates",
      "/dashboard/subscription",
    ];
    const loads: Load[] = [];
    for (const r of routes) loads.push(await loadRoute(page, r));
    const v = judge(loads);
    const pass = v.fiveXX.length === 0 && v.bounced.length === 0 && v.errors.length === 0 && v.clientErr.length === 0;
    return {
      outcome: pass ? "PASS" : "FAIL",
      status: loads[0]?.status || undefined,
      url: `${BASE}${routes[0]}`,
      method: "GET",
      note:
        `${loads.length} pages; 5xx ${v.fiveXX.length}${v.fiveXX.length ? ` [${v.brief(v.fiveXX, (l) => `${l.route}: ${l.fiveXX[0] ?? l.status}`)}]` : ""}; ` +
        `4xx ${v.clientErr.length}${v.clientErr.length ? ` [${v.brief(v.clientErr, (l) => `${l.route} ${l.status}`)}]` : ""}; ` +
        `bounced to login/setup ${v.bounced.length}; timeouts ${v.errors.length}. ` +
        "Branding has no settings page (it is set only in the setup wizard); pricing is /dashboard/pricing-config; integrations pages were loaded only, nothing was connected" +
        (pass ? "" : causes("a settings page needs an env var or credential the local stack lacks", "session lost (see bounced)", "a page queries a model the local migrations do not have")),
    };
  });

  // ------------------------------------------------------------ O10
  await step(page, "O10", TITLES.O10, async () => {
    const uid = await ownerId();
    const techEmail = `walkthrough-tech-${RUN}@example.com`;
    const mgrEmail = `walkthrough-manager-${RUN}@example.com`;
    await page.goto("/dashboard/team", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    const invite = async (email: string, role: Role) => {
      const r = await page.request.post("/api/team/invites", { data: { email, role }, headers: mutation(), failOnStatusCode: false, timeout: 30_000 });
      const j = await body(r);
      return `${r.status()}${j.partial ? " (saved, email not sent)" : ""}${ok(r.status()) ? "" : ` "${clip(errText(j), 60)}"`}`;
    };
    const t = await invite(techEmail, "USER");
    const m = await invite(mgrEmail, "MANAGER");
    const rows = await localQuery<{ email: string; token: string }>(
      `select email, token from "UserInvite" where email = any($1::text[]) and "usedAt" is null order by "createdAt" desc`,
      [[techEmail, mgrEmail]],
    );
    const tTok = rows.find((r) => r.email === techEmail)?.token;
    const mTok = rows.find((r) => r.email === mgrEmail)?.token;
    const state: Record<string, string> = { technicianEmail: techEmail };
    if (tTok) state.technicianInviteUrl = `${BASE}/invite/${tTok}`;
    if (mTok) state.managerInviteUrl = `${BASE}/invite/${mTok}`;
    writeState(state);
    const check = async (tok?: string) => (tok ? (await page.request.get(`/api/invites/${tok}`, { failOnStatusCode: false, timeout: 20_000 })).status() : 0);
    const tc = await check(tTok);
    const mc = await check(mTok);
    const wsId = await workspaceOf(uid);
    const seat = wsId
      ? (
          await localQuery<{ active: boolean; seats: number | null }>(
            `select active, seats from "FeatureEntitlement" where "workspaceId" = $1 and sku = 'TECHNICIAN_SEATS'::"AddonSku"`,
            [wsId],
          )
        )[0]
      : undefined;
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    const pass = !!tTok && !!mTok && tc === 200 && mc === 200;
    return {
      outcome: pass ? "PASS" : "FAIL",
      gap: "G3",
      status: tc || undefined,
      url: tTok ? `${BASE}/api/invites/${tTok}` : `${BASE}/api/team/invites`,
      method: "GET",
      note:
        `POST /api/team/invites technician ${t}, manager ${m} (no email provider locally, so links come from the database); ` +
        `tokens found: technician ${tTok ? "yes" : "no"}, manager ${mTok ? "yes" : "no"}; public invite check ${tc}/${mc}; ` +
        `G3: technician seats entitlement at invite time active=${seat?.active ?? "none"} seats=${seat?.seats ?? "none"}; the invite route has no seat check, so seat enforcement is not exercised here` +
        (pass ? "" : causes("invite route refused (CSRF origin, idempotency key, role)", "UserInvite table or column names changed", "invite expired or marked used")),
    };
  });

  // ------------------------------------------------------------ O11
  await step(page, "O11", TITLES.O11, async () => {
    const clientEmail = `walkthrough-client-${RUN}@example.com`;
    const notes: string[] = [];
    const c = await page.request.post("/api/clients", {
      data: { name: `Walkthrough Client ${RUN}`, email: clientEmail, phone: "0400000000", address: "12 Walkthrough Street, Brisbane QLD 4000" },
      headers: mutation(),
      failOnStatusCode: false,
      timeout: 30_000,
    });
    const cj = await body(c);
    clientId = String(cj.id ?? cj.client?.id ?? cj.data?.id ?? "");
    notes.push(`client ${c.status()}`);
    const i = await page.request.post("/api/inspections", {
      data: { propertyAddress: `12 Walkthrough-${RUN} Street, Brisbane QLD`, propertyPostcode: "4000", claimType: "WATER", ...(clientId ? { clientId } : {}) },
      headers: mutation(),
      failOnStatusCode: false,
      timeout: 30_000,
    });
    const ij = await body(i);
    jobId = String(ij.inspection?.id ?? ij.data?.inspection?.id ?? "");
    reportId = String(ij.inspection?.reportId ?? "");
    notes.push(`water-damage job (claimType WATER) ${i.status()}${ok(i.status()) ? "" : ` "${clip(errText(ij), 80)}"`}`);
    let portalUrl = "";
    let portalStatus = 0;
    if (jobId) {
      const p = await page.request.post(`/api/inspections/${jobId}/client-portal-link`, { headers: mutation(), failOnStatusCode: false, timeout: 30_000 });
      portalStatus = p.status();
      const url = String((await body(p)).data?.url ?? "");
      portalUrl = url.startsWith("/") ? `${BASE}${url}` : url;
      notes.push(`portal link ${portalStatus}`);
    }
    if (clientId) {
      const acct = await localQuery<{ token: string }>(
        `select token from "ClientPortalAccount" where "clientId" = $1 and "revokedAt" is null order by "createdAt" desc limit 1`,
        [clientId],
      );
      if (!portalUrl && acct[0]) portalUrl = `${BASE}/portal/${acct[0].token}`;
      notes.push(`portal token in database: ${acct[0] ? "yes" : "no"}`);
    }
    const state: Record<string, string> = { clientEmail };
    if (clientId) state.clientId = clientId;
    if (jobId) state.jobId = jobId;
    if (portalUrl) state.portalUrl = portalUrl;
    writeState(state);
    let jobPage = 0;
    if (jobId) jobPage = (await page.goto(`/dashboard/inspections/${jobId}`, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null))?.status() ?? 0;
    notes.push(`job page ${jobPage}`);
    const pass = ok(c.status()) && !!clientId && ok(i.status()) && !!jobId && ok(portalStatus) && !!portalUrl && jobPage > 0 && jobPage < 400;
    return {
      outcome: pass ? "PASS" : "FAIL",
      status: i.status(),
      url: `${BASE}/api/inspections`,
      method: "POST",
      note: notes.join("; ") + (pass ? "" : causes("inspection route requires fields this spec does not send", "portal link refused (client email missing on the linked report)", "setup gate still active for API routes")),
    };
  });

  // ------------------------------------------------------------ O12
  await step(page, "O12", TITLES.O12, async () => {
    await page.goto("/dashboard/subscription", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    let status = 0;
    let j: Json = {};
    let via = "";
    const btn = page.getByRole("button", { name: /update payment method|download invoices/i }).first();
    if (await visible(btn, 8_000)) {
      try {
        const [r] = await Promise.all([page.waitForResponse(isCall("/api/subscription/portal"), { timeout: 20_000 }), btn.click({ timeout: 5_000 })]);
        status = r.status();
        j = await r.json().catch(() => ({}));
        via = "UI button";
      } catch {
        status = 0;
      }
    }
    if (!status) {
      const r = await page.request.post("/api/subscription/portal", { headers: mutation(), failOnStatusCode: false, timeout: 30_000 });
      status = r.status();
      j = await body(r);
      via = "API (no portal button on the page)";
    }
    const opened = ok(status) && /^https:\/\/billing\.stripe\.com\//.test(String(j.url ?? ""));
    return {
      outcome: opened ? "PASS" : "FAIL",
      status,
      url: `${BASE}/api/subscription/portal`,
      method: "POST",
      note:
        `billing portal via ${via}: ${status} "${clip(errText(j) || j.url, 100)}"` +
        (opened
          ? " (Stripe portal URL issued, not followed)"
          : causes(
              "no Stripe secret key on the local stack",
              "the owner has no real Stripe customer because O5 was SIMULATED or BYPASS",
              "the portal buttons only render when a live Stripe subscription is found",
            )),
    };
  });

  // ------------------------------------------------------------ O13
  await step(page, "O13", TITLES.O13, async () => {
    const uid = await ownerId();
    if (jobId && !reportId) {
      const r = await localQuery<{ reportId: string | null }>(`select "reportId" from "Inspection" where id = $1`, [jobId]);
      reportId = r[0]?.reportId ?? "";
    }
    const { routes, skipped } = dashboardRoutes({
      "clients/[id]": clientId,
      "inspections/[id]": jobId,
      "reports/[id]": reportId,
      "claims/[reportId]": reportId,
      "team/[id]": uid,
      "help/[category]": "getting-started",
    });
    const shotDir = path.join(RESULTS_DIR, "shots", "O13");
    mkdirSync(shotDir, { recursive: true });
    const loads: Load[] = [];
    for (const r of routes) loads.push(await loadRoute(page, r, shotDir));
    const v = judge(loads);
    const pass = v.fiveXX.length === 0 && v.bounced.length === 0;
    const root = loads.find((l) => l.route === "/dashboard");
    return {
      outcome: pass ? "PASS" : "FAIL",
      status: root?.status || undefined,
      url: `${BASE}/dashboard`,
      method: "GET",
      note:
        `${routes.length + skipped.length} page files; loaded ${loads.length}; skipped ${skipped.length} with no id to fill [${clip(skipped.join(", "), 400)}]; ` +
        `5xx ${v.fiveXX.length}${v.fiveXX.length ? ` [${v.brief(v.fiveXX, (l) => `${l.route}: ${l.fiveXX[0] ?? l.status}`)}]` : ""}; ` +
        `4xx documents ${v.clientErr.length}${v.clientErr.length ? ` [${v.brief(v.clientErr, (l) => `${l.route} ${l.status}`)}]` : ""}; ` +
        `bounced to login/setup ${v.bounced.length}${v.bounced.length ? ` [${v.brief(v.bounced, (l) => l.route)}]` : ""}; ` +
        `timeouts ${v.errors.length}${v.errors.length ? ` [${v.brief(v.errors, (l) => l.route)}]` : ""}; screenshots in shots/O13` +
        (pass ? "" : causes("a page needs an env var or third-party credential the local stack lacks", "a server component throws on an empty new account", "session lost mid-run (see bounced)")),
    };
  });

  // ------------------------------------------------------------ O14 (G9)
  await step(page, "O14", TITLES.O14, async () => {
    const uid = await ownerId();
    const notes: string[] = [];
    const me = (await localQuery<{ role: string }>(`select role::text as role from "User" where id = $1`, [uid]))[0];
    notes.push(`owner role ${me?.role ?? "unknown"} (G9: every self-signup is ADMIN)`);
    const b = (
      await localQuery<{ id: string; role: string; org: string | null; orgName: string | null }>(
        `select u.id, u.role::text as role, u."organizationId" as org, o.name as "orgName" from "User" u left join "Organization" o on o.id = u."organizationId" where u.email = $1`,
        [TENANT_B_EMAIL],
      )
    )[0];
    if (!b) {
      return {
        outcome: "FAIL",
        gap: "G9",
        note: `${notes.join("; ")}; tenant B (${TENANT_B_EMAIL}) is not in the local database, so isolation cannot be tested` + causes("tenant B seed step from sketch-e2e.yml not run", "seed used a different email", "database reset after seeding"),
      };
    }
    // Plant data as tenant B, then look for it as the owner. A clean read of nothing proves nothing.
    const canary = `G9-canary-${RUN}`;
    const canaryAddress = `${canary} Tenant B Street, Brisbane QLD`;
    const canaryClient = `${canary} Client`;
    const bj = await helperJwt(TENANT_B_EMAIL, b.role as Role, true);
    let planted = `tenant B sign-in ${bj.status}`;
    if (bj.jwt) {
      const api = await pwRequest.newContext({
        baseURL: BASE,
        extraHTTPHeaders: { cookie: `${SECURE_COOKIE}=${bj.jwt}; ${PLAIN_COOKIE}=${bj.jwt}`, origin: BASE },
      });
      try {
        const post = (url: string, data: Json) => api.post(url, { data, headers: mutation(), failOnStatusCode: false, timeout: 20_000 });
        const c = await post("/api/clients", { name: canaryClient, email: `${canary.toLowerCase()}@example.com` });
        const i = await post("/api/inspections", { propertyAddress: canaryAddress, propertyPostcode: "4000", claimType: "WATER" });
        const iid = String((await body(i)).inspection?.id ?? "");
        const w = iid ? await post(`/api/inspections/${iid}/workflow`, { jobType: "WATER_DAMAGE" }) : null;
        planted = `tenant B planted: client ${c.status()}, inspection ${i.status()}, workflow ${w?.status() ?? "-"}`;
      } finally {
        await api.dispose();
      }
    }
    notes.push(planted);
    // Positive control for the one unscoped list: the owner's own job with a workflow must be findable.
    const control = `G9-control-${RUN}`;
    const ci = await page.request.post("/api/inspections", {
      data: { propertyAddress: `${control} Owner Street, Brisbane QLD`, propertyPostcode: "4000", claimType: "WATER" },
      headers: mutation(),
      failOnStatusCode: false,
      timeout: 20_000,
    });
    const cid = String((await body(ci)).inspection?.id ?? "");
    const cw = cid
      ? await page.request.post(`/api/inspections/${cid}/workflow`, { data: { jobType: "WATER_DAMAGE" }, headers: mutation(), failOnStatusCode: false, timeout: 20_000 })
      : null;
    notes.push(`owner control job ${ci.status()}, workflow ${cw?.status() ?? "-"}`);

    const markers = [canaryAddress, canaryClient, `${canary.toLowerCase()}@example.com`, TENANT_B_EMAIL, b.id, b.org, b.orgName].filter(
      (m): m is string => !!m,
    );
    const leaks: string[] = [];
    let leakStatus = 0;
    let usersStatus = 0;
    let selfSeen = false;
    let controlSeen = false;
    const surfaces = [
      "/api/admin/users",
      "/api/admin/stats",
      "/api/admin/business-metrics",
      "/api/admin/usage",
      "/api/admin/blocked-customers",
      `/api/admin/evidence-review?status=all&search=${encodeURIComponent(canary)}`,
      `/api/admin/evidence-review?status=all&search=${encodeURIComponent(control)}`,
      "/api/admin/evidence-review?status=all",
    ];
    const statuses: string[] = [];
    for (const s of surfaces) {
      const r = await page.request.get(s, { failOnStatusCode: false, timeout: 20_000 });
      const text = await r.text().catch(() => "");
      const hits = markers.filter((m) => text.includes(m));
      if (hits.length) {
        leaks.push(`${s.split("&search")[0]} (${r.status()}): ${hits.join(", ")}`);
        leakStatus ||= r.status();
      }
      if (s === "/api/admin/users") {
        usersStatus = r.status();
        selfSeen = text.toLowerCase().includes(ownerEmail.toLowerCase());
      }
      if (text.includes(`${control} Owner Street`)) controlSeen = true;
      if (s === "/api/admin/stats") notes.push(`stats (platform-wide counts) ${clip(text, 160)}`);
      statuses.push(`${s.split("?")[0]} ${r.status()}`);
    }
    for (const p of ["/dashboard/admin", "/dashboard/admin/users", "/dashboard/admin/evidence-review"]) {
      const l = await loadRoute(page, p);
      const text = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
      const hits = markers.filter((m) => text.includes(m));
      if (hits.length) {
        leaks.push(`${p} page (${l.status}): ${hits.join(", ")}`);
        leakStatus ||= l.status;
      }
      statuses.push(`${p} ${l.status}->${l.finalPath}`);
    }
    notes.push(`surfaces: ${statuses.join(", ")}`);
    notes.push(`controls: own email in /api/admin/users ${selfSeen}, own workflow job in evidence-review ${controlSeen}`);
    if (leaks.length) {
      return { outcome: "EXPECTED-BY-CODE", gap: "G9", status: leakStatus || undefined, url: `${BASE}/api/admin/evidence-review`, method: "GET", note: `G9 confirmed, tenant B data shown to a new owner: ${leaks.join(" | ")}; ${notes.join("; ")}` };
    }
    if (me?.role !== "ADMIN") {
      return { outcome: "PASS", gap: "G9", note: `G9 refuted: the new owner is not ADMIN and saw no tenant B data; ${notes.join("; ")}` };
    }
    if (!selfSeen || !controlSeen || !ok(usersStatus)) {
      return {
        outcome: "FAIL",
        gap: "G9",
        status: usersStatus || undefined,
        url: `${BASE}/api/admin/users`,
        method: "GET",
        note: `no tenant B data found, but a positive control failed, so "not shown" is unproven; ${notes.join("; ")}` + causes("admin routes refused the owner", "workflow route refused so evidence-review lists nothing", "response shapes changed so the search matched nothing"),
      };
    }
    return {
      outcome: "PASS",
      gap: "G9",
      status: usersStatus,
      url: `${BASE}/api/admin/users`,
      method: "GET",
      note: `G9 half-confirmed: the owner is ADMIN, but no tenant B identifiers appeared on ${surfaces.length + 3} admin surfaces; ${notes.join("; ")}`,
    };
  });
});
