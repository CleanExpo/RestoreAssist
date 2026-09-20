/**
 * Walkthrough journey: CLIENT (steps C1-C11), on an iPhone-sized screen. The owner
 * acts from a second, desktop-sized browser context signed in through the local
 * test helper (no password is ever typed for a real person).
 *
 * Reads the owner's hand-off from state.json and copes with any key missing by
 * seeding through the app's own API as the owner. Portal and invite tokens come
 * from API responses or the local database (no email provider on this stack).
 *
 * Stack facts this spec is written around (read from the code, 19/09):
 *  - NODE_ENV=production over http://localhost: lib/auth.ts names the session cookie
 *    `__Secure-next-auth.session-token`, but proxy.ts calls getToken() without a
 *    cookie name, and next-auth derives it from NEXTAUTH_URL (http -> plain name).
 *    The owner context therefore carries BOTH names, holding the same test JWT.
 *  - Portal account tokens (ClientPortalAccount) drive the page, updates,
 *    authorities and evidence. The legacy HMAC routes (/api/portal/generate,
 *    /api/portal/[token]/pdf, insurer links) need PORTAL_SECRET on the server.
 */
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import {
  test,
  expect,
  devices,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { BASE_URL, localQuery, readState, recordedApi, step, watch, type StepResult } from "./recorder";

test.describe.configure({ mode: "serial" });

// Validated once in recorder.ts; deriving it from the env here skipped the locality check.
const BASE = BASE_URL;

// Verbatim from steps.json.
const TITLES = {
  C1: "Receives the portal link",
  C2: "Portal shows status, areas, scope",
  C3: "Signs the authority form",
  C4: "Uploads a photo",
  C5: "Sees the owner's job update",
  C6: "Report ready, PDF downloads",
  C7: "Client education library",
  C8: "Password portal: sign up, log in, approve",
  C9: "Owner revokes the portal invite",
  C10: "Client update message (Restoration Pulse)",
  C11: "Insurer link and public invoice link",
} as const;
type StepId = keyof typeof TITLES;
type Causes = [string, string, string];

// ── small helpers ───────────────────────────────────────────────────────────

interface Hit {
  status: number;
  json: any;
  text: string;
  url: string;
  method: string;
}

async function hit(
  req: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  data?: unknown,
  headers?: Record<string, string>,
  timeout = 30_000,
): Promise<Hit> {
  // recordedApi refuses a non-local destination before dispatch and records the mutation.
  // A browser context's request object raises no page events, so without this wrapper the
  // writes made here reached no evidence file at all.
  const res = await recordedApi(req).fetch(url, { method, data, headers, timeout, failOnStatusCode: false });
  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status(), json, text: text.slice(0, 200), url: res.url(), method };
}

function pathOf(u: string): string {
  const x = new URL(u, BASE);
  return `${x.pathname}${x.search}`;
}

/** One-line description of a response for notes (never includes tokens from the body). */
function brief(h: Hit): string {
  const err = h.json?.error?.message ?? h.json?.error ?? h.json?.message ?? "";
  const path = new URL(h.url, BASE).pathname.replace(/\/portal\/[^/]{16,}/, "/portal/<token>");
  return `${h.method} ${path} -> ${h.status}${err ? ` (${String(typeof err === "string" ? err : JSON.stringify(err)).slice(0, 140)})` : ""}`;
}

/** Proof fields for a StepResult: always an absolute local URL. */
function proof(h: Hit): Pick<StepResult, "status" | "url" | "method"> {
  return { status: h.status, url: h.url, method: h.method };
}

function fail(note: string, causes: Causes, extra: Partial<StepResult> = {}): StepResult {
  return {
    outcome: "FAIL",
    note: `${note} || likely causes: (1) ${causes[0]} (2) ${causes[1]} (3) ${causes[2]}`,
    ...extra,
  };
}

async function visible(l: Locator, timeout = 10_000): Promise<boolean> {
  try {
    await expect(l).toBeVisible({ timeout });
    return true;
  } catch {
    return false;
  }
}

function portalTokenFrom(u: string | undefined): string | null {
  if (!u) return null;
  const m = /^\/portal\/([A-Za-z0-9_-]{16,})\/?$/.exec(new URL(u, BASE).pathname);
  return m ? m[1] : null;
}

/** A small valid PNG (8x8, solid colour) built in memory. Real magic bytes. */
function makePng(w = 8, h = 8): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 40;
      raw[o + 1] = 110;
      raw[o + 2] = 160;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── owner session (second browser context, desktop) ─────────────────────────

interface Owner {
  ctx: BrowserContext;
  page: Page;
  email: string;
  userId: string;
  ok: boolean;
  note: string;
}

const OWNER_CAUSES: Causes = [
  "sign-in-as refused (ALLOW_TEST_HELPERS not true, or role mismatch for state.ownerEmail)",
  "session cookie not read over http: NODE_ENV=production expects __Secure-next-auth.session-token",
  "state.ownerEmail missing, so owner actions ran as a seeded test ADMIN who does not own the job",
];

async function openOwner(browser: Browser, email: string): Promise<Owner> {
  const { defaultBrowserType: _unused, ...desktop } = devices["Desktop Chrome"];
  let ctx = await browser.newContext({ ...desktop, baseURL: BASE });
  const signIn = async (c: BrowserContext, role: string) =>
    c.request.post("/api/test/sign-in-as", { data: { role, email }, timeout: 20_000, failOnStatusCode: false });

  let res = await signIn(ctx, "ADMIN");
  if (res.status() === 409) {
    const stored = /stored as (USER|ADMIN|MANAGER)/.exec(await res.text())?.[1];
    if (stored) res = await signIn(ctx, stored);
  }
  const body = await res.json().catch(() => ({}));
  const userId = String(body?.userId ?? "");
  const jwt = /(?:__Secure-)?next-auth\.session-token=([^;]+)/.exec(res.headers()["set-cookie"] ?? "")?.[1];
  let note = `sign-in-as ${res.status()}`;
  if (!res.ok() || !jwt) {
    const page = await ctx.newPage();
    watch(page);
    return { ctx, page, email, userId, ok: false, note: `${note}, no session cookie` };
  }
  const host = new URL(BASE).hostname;
  // Local-http harness workaround: lib/auth.ts reads __Secure-…, proxy.ts getToken() reads the plain name over http.
  const cookie = { value: jwt, domain: host, path: "/", httpOnly: true, sameSite: "Lax" as const };
  await ctx.addCookies([{ name: "next-auth.session-token", ...cookie, secure: false }]).catch(() => undefined);
  await ctx.addCookies([{ name: "__Secure-next-auth.session-token", ...cookie, secure: true }]).catch(() => undefined);

  const sessionOk = async (c: BrowserContext) => {
    const s = await hit(c.request, "GET", "/api/auth/session");
    return s.status === 200 && (s.json?.user?.id === userId || s.json?.user?.email?.toLowerCase() === email.toLowerCase());
  };
  let ok = await sessionOk(ctx);
  if (!ok) {
    // Fallback: send both cookie names as an explicit header on every owner request.
    await ctx.close();
    ctx = await browser.newContext({
      ...desktop,
      baseURL: BASE,
      extraHTTPHeaders: { cookie: `__Secure-next-auth.session-token=${jwt}; next-auth.session-token=${jwt}` },
    });
    ok = await sessionOk(ctx);
    note += ok ? ", session via explicit Cookie header" : ", /api/auth/session has no user";
  } else {
    note += ", session ok";
  }
  const page = await ctx.newPage();
  watch(page);
  return { ctx, page, email, userId, ok, note };
}

// ── shared journey facts ────────────────────────────────────────────────────

interface Facts {
  token?: string; // ClientPortalAccount token
  portalPath?: string;
  legacyToken?: string; // HMAC token, if the owner handed one over
  clientId?: string;
  clientEmail?: string;
  clientName?: string;
  jobId?: string; // inspection the portal resolves to (newest for the client)
  reportId?: string;
  jobOwnerId?: string;
}

/** Resolve a portal token the same way the portal does (account -> client -> newest job). */
async function resolveAccount(token: string, F: Facts): Promise<boolean> {
  const acc = await localQuery<{ clientId: string }>(
    `SELECT "clientId" FROM "ClientPortalAccount" WHERE token = $1 AND "revokedAt" IS NULL
       AND ("expiresAt" IS NULL OR "expiresAt" > now())`,
    [token],
  );
  if (!acc[0]) return false;
  F.token = token;
  F.portalPath = `/portal/${token}`;
  F.clientId = acc[0].clientId;
  const c = await localQuery<{ name: string; email: string }>(`SELECT name, email FROM "Client" WHERE id = $1`, [F.clientId]);
  F.clientName = c[0]?.name;
  F.clientEmail = c[0]?.email;
  const j = await localQuery<{ id: string; reportId: string; userId: string }>(
    `SELECT i.id, i."reportId", i."userId" FROM "Inspection" i JOIN "Report" r ON r.id = i."reportId"
      WHERE r."clientId" = $1 ORDER BY i."createdAt" DESC LIMIT 1`,
    [F.clientId],
  );
  F.jobId = j[0]?.id;
  F.reportId = j[0]?.reportId;
  F.jobOwnerId = j[0]?.userId;
  return true;
}

/** Owner creates a client (email) and a water job for it through the app API. */
async function seedClientAndJob(owner: Owner, tag: string): Promise<{ clientId: string; jobId: string; email: string }> {
  const ts = Date.now();
  const email = `walkthrough-${tag}-${ts}@test.local`;
  const c = await hit(owner.ctx.request, "POST", "/api/clients", {
    name: `Walkthrough ${tag.toUpperCase()} Client ${ts}`,
    email,
    phone: "0400000000",
    address: "12 Walkthrough St, Brisbane QLD 4000",
  });
  if (c.status >= 300 || !c.json?.id) throw new Error(`seed client: ${brief(c)}`);
  const j = await hit(owner.ctx.request, "POST", "/api/inspections", {
    propertyAddress: "12 Walkthrough St, Brisbane QLD 4000",
    propertyPostcode: "4000",
    clientId: c.json.id,
    claimType: "WATER",
    lossDescription: "Burst flexi hose under the kitchen sink; water across kitchen and hallway.",
  });
  const jobId = j.json?.inspection?.id;
  if (j.status >= 300 || !jobId) throw new Error(`seed job: ${brief(j)}`);
  return { clientId: c.json.id, jobId, email };
}

// ── the journey ─────────────────────────────────────────────────────────────

test("client journey C1-C11 (phone, owner on desktop)", async ({ page, browser }) => {
  watch(page);
  const state = readState();
  const F: Facts = {};
  const ownerEmail = state.ownerEmail || "walkthrough-client-owner@test.local";
  const owner = await openOwner(browser, ownerEmail);
  const ownerNote = `owner=${state.ownerEmail ? "state.ownerEmail" : "seeded test ADMIN (no ownerEmail in state)"}; ${owner.note}`;
  const needOwner = (what: string) =>
    fail(`${what} needs the owner session, which is unavailable (${owner.note})`, OWNER_CAUSES);
  const needPortal = (what: string) =>
    fail(`${what}: no working portal token from C1`, [
      "owner journey wrote no portalUrl/clientId/jobId and seeding failed",
      "ClientPortalAccount row revoked or expired",
      "local DB unreachable from the spec (DATABASE_URL not exported)",
    ]);

  const run = (p: Page | null, id: StepId, causes: Causes, body: () => Promise<StepResult>) =>
    step(p, id, TITLES[id], async () => {
      try {
        return await body();
      } catch (err) {
        return fail(`threw: ${String((err as Error)?.message ?? err).slice(0, 300)}`, causes);
      }
    });

  // C1 — the owner sends the portal link; the client opens it.
  await run(page, "C1", [
    "no portal token in state or DB and the owner could not send one (client has no email: 422)",
    "portal page 404s: the account's client has no job linked through Report.clientId",
    "local server not running on PLAYWRIGHT_BASE_URL",
  ], async () => {
    const notes: string[] = [ownerNote];
    let source = "";
    const fromState = portalTokenFrom(state.portalUrl);
    if (fromState && (await resolveAccount(fromState, F))) source = "state.portalUrl";
    else if (fromState) {
      F.legacyToken = fromState;
      notes.push("state.portalUrl is not a ClientPortalAccount token (legacy HMAC link?)");
    }
    if (!source) {
      let clientId = state.clientId;
      if (!clientId && state.jobId) {
        const r = await localQuery<{ clientId: string }>(
          `SELECT r."clientId" FROM "Inspection" i JOIN "Report" r ON r.id = i."reportId" WHERE i.id = $1`,
          [state.jobId],
        );
        clientId = r[0]?.clientId;
      }
      if (clientId) {
        const t = await localQuery<{ token: string }>(
          `SELECT token FROM "ClientPortalAccount" WHERE "clientId" = $1 AND "revokedAt" IS NULL
             AND ("expiresAt" IS NULL OR "expiresAt" > now()) ORDER BY "createdAt" DESC LIMIT 1`,
          [clientId],
        );
        if (t[0] && (await resolveAccount(t[0].token, F))) source = "local DB (ClientPortalAccount)";
      }
    }
    if (!source) {
      if (!owner.ok) return needOwner("sending the portal link");
      let jobId = state.jobId;
      let link = jobId
        ? await hit(owner.ctx.request, "POST", `/api/inspections/${jobId}/client-portal-link`, {}, { origin: BASE })
        : null;
      if (!link || link.status !== 200) {
        if (link) notes.push(`owner's job: ${brief(link)}`);
        const seeded = await seedClientAndJob(owner, "c1");
        jobId = seeded.jobId;
        notes.push("seeded client + job via owner API");
        link = await hit(owner.ctx.request, "POST", `/api/inspections/${jobId}/client-portal-link`, {}, { origin: BASE });
      }
      const t = portalTokenFrom(link.json?.data?.url);
      if (link.status !== 200 || !t || !(await resolveAccount(t, F))) {
        return fail(`owner could not send the link: ${brief(link)}`, [
          "job's report has no client or client has no email (422)",
          "owner session not accepted (401) or not the job's owner (403/404)",
          "ClientPortalAccount write failed",
        ], proof(link));
      }
      source = `owner sent the link (${brief(link)}, emailed=${String(link.json?.data?.emailed)})`;
    }
    notes.push(`link from ${source}; no email provider, so the client "receives" it from state/DB`);
    if (F.jobOwnerId && owner.userId && F.jobOwnerId !== owner.userId) {
      notes.push("owner session is not the job's owner: owner-side steps may 403/404");
    }
    const res = await page.goto(F.portalPath!, { timeout: 45_000 });
    const status = res?.status() ?? 0;
    const shown = await visible(page.getByText("Client Job Status Portal"), 15_000);
    const pr = { status, url: `${BASE}${F.portalPath}`, method: "GET" };
    if (status < 400 && shown) return { outcome: "PASS", note: notes.join("; "), ...pr };
    return fail(`portal page ${status}, header shown=${shown}; ${notes.join("; ")}`, [
      "account's client has no inspection linked via Report.clientId (page 404)",
      "server error rendering the portal (see badResponses)",
      "PORTAL_SECRET unset and the token fell through to the HMAC path",
    ], pr);
  });

  // C2 — status feed, affected areas, scope of works.
  await run(page, "C2", [
    "updates feed 404: token not a ClientPortalAccount token",
    "job has no affected areas / selected scope items and owner seeding failed",
    "client component did not render within 15s",
  ], async () => {
    if (!F.token || !F.jobId) return needPortal("status feed");
    const notes: string[] = [];
    const count = async (sql: string) => (await localQuery<{ n: number }>(sql, [F.jobId]))[0]?.n ?? 0;
    let areas = await count(`SELECT count(*)::int AS n FROM "AffectedArea" WHERE "inspectionId" = $1`);
    let scope = await count(`SELECT count(*)::int AS n FROM "ScopeItem" WHERE "inspectionId" = $1 AND "isSelected" = true`);
    if ((areas === 0 || scope === 0) && owner.ok) {
      if (areas === 0) {
        const a = await hit(owner.ctx.request, "POST", `/api/inspections/${F.jobId}/affected-areas`, {
          roomZoneId: "Kitchen",
          affectedAreaSqm: 14,
          waterSource: "Burst flexi hose",
        });
        notes.push(`job had 0 areas; owner added one: ${brief(a)}`);
      }
      if (scope === 0) {
        const s = await hit(owner.ctx.request, "POST", `/api/inspections/${F.jobId}/scope-items`, {
          itemType: "DRYING",
          description: "Set up dehumidifier and air movers in the kitchen",
        });
        notes.push(`job had 0 scope items; owner added one: ${brief(s)}`);
      }
      areas = await count(`SELECT count(*)::int AS n FROM "AffectedArea" WHERE "inspectionId" = $1`);
      scope = await count(`SELECT count(*)::int AS n FROM "ScopeItem" WHERE "inspectionId" = $1 AND "isSelected" = true`);
    }
    const [feedRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/portal/${F.token}/updates`), { timeout: 20_000 }),
      page.goto(F.portalPath!, { timeout: 45_000 }),
    ]);
    const statusShown = await visible(page.getByText("Claim status"), 15_000);
    const areasShown = areas > 0 ? await visible(page.getByText("Affected Areas"), 5_000) : false;
    const scopeShown = scope > 0 ? await visible(page.getByText("Scope of Works"), 5_000) : false;
    notes.push(`db areas=${areas} scope=${scope}; shown: status=${statusShown} areas=${areasShown} scope=${scopeShown}`);
    const pr = { status: feedRes.status(), url: feedRes.url(), method: "GET" };
    if (feedRes.status() === 200 && statusShown && areasShown && scopeShown) return { outcome: "PASS", note: notes.join("; "), ...pr };
    return fail(notes.join("; "), [
      "updates feed not 200 (rate limit or token lookup)",
      "job has no areas/scope and the owner API refused to add them",
      "section headings changed or rendered late",
    ], pr);
  });

  // C3 — the client signs an authority form from inside the portal.
  await run(page, "C3", [
    "no active AuthorityFormTemplate rows (prisma/seed-authority-forms.ts is not in this stack's seed list)",
    "signature has no email, so send-signature-request never mints the sign token",
    "sign POST refused (CSRF/bot check) or UI labels changed",
  ], async () => {
    if (!F.token || !F.reportId) return needPortal("authority form");
    if (!owner.ok) return needOwner("creating the authority form");
    const notes = ["note: the seed-authorisation helper seeds technician licences, not client authority forms"];
    const req = owner.ctx.request;
    const tpl = await hit(req, "GET", "/api/authority-forms/templates");
    const template = tpl.json?.templates?.[0];
    if (!template) return fail(`no template: ${brief(tpl)}, count=${tpl.json?.templates?.length ?? 0}; ${notes[0]}`, [
      "prisma/seed-authority-forms.ts not run on this DB",
      "all templates isActive=false",
      "owner session rejected (401)",
    ], proof(tpl));
    const form = await hit(req, "POST", `/api/reports/${F.reportId}/authority-forms`, {
      templateId: template.id,
      signatoryRoles: [],
      authorityDescription: "Authority to commence drying works as per the scope of works",
    });
    const formId = form.json?.form?.id;
    if (!formId) return fail(`create form: ${brief(form)}`, OWNER_CAUSES, proof(form));
    const sig = await hit(req, "POST", `/api/authority-forms/${formId}/signatures`, {
      action: "add_signatory",
      signatoryName: F.clientName || "Walkthrough Client",
      signatoryRole: "CLIENT",
      signatoryEmail: F.clientEmail,
    });
    const signatureId = sig.json?.signature?.id;
    const send = signatureId
      ? await hit(req, "POST", `/api/authority-forms/${formId}/send-signature-request`, { signatureId })
      : null;
    notes.push(`owner: ${brief(form)}; ${brief(sig)}; ${send ? brief(send) : "send skipped"} (503 = no email service, token still written)`);
    const list = await hit(page.request, "GET", `/api/portal/${F.token}/authorities`);
    const listed = (list.json?.data?.authorities ?? []).some((a: { id: string }) => a.id === formId);
    notes.push(`portal authorities ${list.status}, ours listed=${listed}`);
    if (!listed) return fail(notes.join("; "), [
      "signatureRequestToken not set (send-signature-request 400: no signatory email)",
      "form not linked to the client's report",
      "authorities route 404: token not an account token",
    ], proof(list));
    await page.goto(F.portalPath!, { timeout: 45_000 });
    const input = page.getByLabel(/Your full name to approve/).last();
    if (!(await visible(input, 15_000))) return fail(`${notes.join("; ")}; approval panel not shown`, [
      "ClientPortalAuthorities fetch failed in the browser",
      "panel hidden because the list came back empty",
      "label text changed",
    ], proof(list));
    await input.fill(F.clientName || "Walkthrough Client");
    const [signRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/authority-forms/sign/") && r.request().method() === "POST", { timeout: 20_000 }),
      page.getByRole("button", { name: /Approve and sign/ }).last().click({ timeout: 10_000 }),
    ]);
    const done = await visible(page.getByText("Approved — thank you.").last(), 10_000);
    const pr = { status: signRes.status(), url: signRes.url(), method: "POST" };
    if (signRes.ok() && done) return { outcome: "PASS", note: notes.join("; "), ...pr };
    return fail(`${notes.join("; ")}; sign ${signRes.status()}, confirmation shown=${done}`, [
      "CSRF origin mismatch or bot check on the sign route",
      "signature already completed/expired",
      "server error saving the signature",
    ], pr);
  });

  // C4 — the client uploads a photo (plus a text-only control).
  await run(page, "C4", [
    "no Cloudinary credentials on the local server, so provider.upload throws (500)",
    "evidence route rate-limited or CSRF-refused",
    "file input or button label changed",
  ], async () => {
    if (!F.token || !F.jobId) return needPortal("photo upload");
    const withFile = `SELECT count(*)::int AS n FROM "ClientEvidenceSubmission" WHERE "inspectionId" = $1 AND "fileUrl" IS NOT NULL`;
    const before = (await localQuery<{ n: number }>(withFile, [F.jobId]))[0]?.n ?? 0;
    const control = await hit(page.request, "POST", `/api/portal/${F.token}/evidence`, {
      images: [],
      description: "Walkthrough control: text-only note, no photo",
    });
    await page.goto(F.portalPath!, { timeout: 45_000 });
    await page.locator("#ev-files").setInputFiles({ name: "kitchen-ceiling.png", mimeType: "image/png", buffer: makePng() });
    const ready = await visible(page.getByText("1 photo(s) ready"), 10_000);
    await page.getByLabel("Description", { exact: true }).fill("Water stain spreading on the kitchen ceiling");
    const [upRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/portal/${F.token}/evidence`) && r.request().method() === "POST", { timeout: 30_000 }),
      page.getByRole("button", { name: "Send to my assessor" }).click({ timeout: 10_000 }),
    ]);
    const thanks = await visible(page.getByText(/Thanks — .* sent to your assessor/), 10_000);
    const after = (await localQuery<{ n: number }>(withFile, [F.jobId]))[0]?.n ?? 0;
    const note = `control (text only): ${brief(control)}; photo ready=${ready}; photo POST ${upRes.status()}; thanks shown=${thanks}; rows with file ${before}->${after}; CLOUDINARY_CLOUD_NAME in runner env=${Boolean(process.env.CLOUDINARY_CLOUD_NAME)}`;
    const pr = { status: upRes.status(), url: upRes.url(), method: "POST" };
    if (upRes.ok() && thanks && after > before) return { outcome: "PASS", note, ...pr };
    if (upRes.status() === 500 || upRes.status() === 502) return fail(`local stack: no Cloudinary; ${note}`, [
      "no Cloudinary credentials on the local server (provider.upload throws)",
      "Cloudinary provider chosen for every storage setting except unimplemented BYOS",
      "upload error not caught in the evidence route, so it surfaces as 500",
    ], pr);
    return fail(note, [
      "no Cloudinary credentials on the local server (upload throws, 500)",
      "image rejected by decodeImageDataUrl (422)",
      "rate limit (429) from earlier runs on the same token",
    ], pr);
  });

  // C5 — the owner moves the job on; the client sees it.
  await run(page, "C5", [
    "owner mutations refused (session or tenancy)",
    "portal renders a different job than the owner changed (newest job for the client)",
    "client status feed unchanged because every owner action was refused",
  ], async () => {
    if (!F.token || !F.jobId) return needPortal("owner update");
    if (!owner.ok) return needOwner("the owner's job update");
    const feed = async () => hit(page.request, "GET", `/api/portal/${F.token}/updates`);
    const sig = (f: any) =>
      f ? `${f.currentStep}|${f.progressPct}|${(f.pendingApprovals ?? []).map((a: any) => a.type).sort().join(",")}` : "none";
    const before = await feed();
    const techName = `Sam Walkthrough (updated ${new Date().toISOString().slice(11, 16)} UTC)`;
    const submit = await hit(owner.ctx.request, "POST", `/api/inspections/${F.jobId}/submit`, {}, undefined, 60_000);
    const approval = F.reportId
      ? await hit(owner.ctx.request, "POST", `/api/reports/${F.reportId}/approvals`, { approvalType: "COST_ESTIMATE", amount: 1250 })
      : null;
    const patch = await hit(owner.ctx.request, "PATCH", `/api/inspections/${F.jobId}`, { technicianName: techName });
    const [afterRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/portal/${F.token}/updates`), { timeout: 20_000 }),
      page.goto(F.portalPath!, { timeout: 45_000 }),
    ]);
    const after = await feed();
    const techSeen = await visible(page.getByText(`Technician: ${techName}`), 10_000);
    const actionSeen = await visible(page.getByText(/Action needed:.*Cost estimate/), 5_000);
    const stepMoved = before.json?.data?.currentStep !== after.json?.data?.currentStep;
    const note =
      `owner: ${brief(submit)}; ${approval ? brief(approval) : "no report for approval"}; ${brief(patch)}` +
      ` | client feed ${sig(before.json?.data)} -> ${sig(after.json?.data)}; step moved=${stepMoved};` +
      ` sees "Action needed: Cost estimate"=${actionSeen}; sees new technician name=${techSeen}`;
    const pr = { status: afterRes.status(), url: afterRes.url(), method: "GET" };
    if (afterRes.ok() && (stepMoved || actionSeen || techSeen)) return { outcome: "PASS", note, ...pr };
    return fail(note, [
      "every owner mutation was refused (see statuses)",
      "portal resolves a newer job for this client than F.jobId",
      "status feed poll is 30s and the reload raced the owner write",
    ], pr);
  });

  // C6 — report ready banner and PDF download (G7: reports are never emailed).
  await run(page, "C6", [
    "report never reached COMPLETED (owner/technician could not finish the job)",
    "token portal renders no download control; /api/portal/[token]/pdf accepts only legacy HMAC tokens",
    "PORTAL_SECRET unset on the server, so the legacy PDF path 500s",
  ], async () => {
    if (!F.token || !F.jobId) return needPortal("report download");
    const rep = F.reportId
      ? (await localQuery<{ status: string }>(`SELECT status::text AS status FROM "Report" WHERE id = $1`, [F.reportId]))[0]?.status
      : undefined;
    const sent = (await localQuery<{ n: number }>(
      `SELECT count(*)::int AS n FROM "AuditLog" WHERE "inspectionId" = $1 AND action IN ('REPORT_SENT', 'REPORT_DELIVERED')`,
      [F.jobId],
    ))[0]?.n ?? 0;
    const notes = [`report status=${rep ?? "none"}`, `G7: report delivery audit rows=${sent} (no email path for reports)`];
    await page.goto(F.portalPath!, { timeout: 45_000 });
    const banner = await visible(page.getByText("Your restoration report is ready.").first(), 10_000);
    const control = page.getByRole("link", { name: /download|pdf/i }).or(page.getByRole("button", { name: /download|pdf/i }));
    const controls = await control.count();
    const acct = await hit(page.request, "GET", `/api/portal/${F.token}/pdf`);
    notes.push(`banner=${banner}; download controls on token page=${controls}; account-token ${brief(acct)}`);
    let legacy = F.legacyToken;
    if (!legacy && owner.ok) {
      const gen = await hit(owner.ctx.request, "POST", "/api/portal/generate", { inspectionId: F.jobId });
      notes.push(`owner legacy link ${brief(gen)}`);
      legacy = portalTokenFrom(gen.json?.portalUrl) ?? undefined;
    }
    if (legacy) {
      const lp = await hit(page.request, "GET", `/api/portal/${legacy}/pdf`);
      notes.push(`legacy-token ${brief(lp)}`);
    }
    notes.push(`PORTAL_SECRET in runner env=${Boolean(process.env.PORTAL_SECRET)}`);
    if (rep === "COMPLETED" && banner && controls > 0) {
      try {
        const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), control.first().click()]);
        const name = dl.suggestedFilename();
        if (/\.pdf$/i.test(name)) return { outcome: "PASS", gap: "G7", note: `${notes.join("; ")}; downloaded ${name}`, status: 200, url: `${BASE}${F.portalPath}`, method: "GET" };
        notes.push(`control downloaded ${name} (not a PDF)`);
      } catch {
        notes.push("download control clicked but no file arrived in 30s");
      }
    }
    return fail(notes.join("; "), [
      "report not COMPLETED (owner/technician did not finish this job)",
      "token portal has no download control and its PDF route rejects account tokens (401)",
      "PORTAL_SECRET unset on the server (legacy link and PDF 500)",
    ], { gap: "G7", ...proof(acct) });
  });

  // C7 — client education library (CLIENT_EDUCATION add-on).
  await run(page, "C7", [
    "CLIENT_EDUCATION add-on not active (O6 could not buy it: no Stripe)",
    "prisma/seed-portal-content.ts not run (no published articles)",
    "owner has no READY workspace (G4: only the AI-key step creates one)",
  ], async () => {
    if (!F.portalPath || !F.jobId) return needPortal("education library");
    const c = (await localQuery<{ free: number; total: number }>(
      `SELECT count(*) FILTER (WHERE "requiresAddon" = false)::int AS free, count(*)::int AS total
         FROM "PortalContent" WHERE audience = 'customer' AND state = 'PUBLISHED' AND scope = 'PLATFORM_DEFAULT'`,
    ))[0] ?? { free: 0, total: 0 };
    const ent = await localQuery<{ active: boolean }>(
      `SELECT fe.active FROM "FeatureEntitlement" fe JOIN "Workspace" w ON w.id = fe."workspaceId"
        WHERE w."ownerId" = (SELECT "userId" FROM "Inspection" WHERE id = $1)
          AND w.status::text = 'READY' AND fe.sku::text = 'CLIENT_EDUCATION' LIMIT 1`,
      [F.jobId],
    );
    const entitled = ent[0]?.active === true;
    const res = await page.goto(`${F.portalPath}/learn`, { timeout: 45_000 });
    const status = res?.status() ?? 0;
    const heading = await visible(page.getByRole("heading", { name: "About your restoration", exact: true }), 15_000);
    const shown = await page.locator("article").count();
    const expected = Math.min(entitled ? c.total : c.free, 50);
    const note = `learn ${status}; heading=${heading}; articles shown=${shown}, expected=${expected} (published free=${c.free}, total=${c.total}); add-on entitled=${entitled}`;
    const pr = { status, url: `${BASE}${F.portalPath}/learn`, method: "GET" };
    if (status < 400 && heading && entitled && shown > 0 && shown === expected) return { outcome: "PASS", note, ...pr };
    return fail(note, [
      entitled ? "rendered set differs from the published add-on set" : "CLIENT_EDUCATION add-on not active for this business (no Stripe purchase)",
      "prisma/seed-portal-content.ts not run on this DB",
      "owner has no READY workspace (G4), so the gate fails closed to the free set",
    ], pr);
  });

  // C8 — password portal: invite, sign up, log in, report page, approve.
  await run(page, "C8", [
    "invite refused (client already has portal access, or an active invite exists)",
    "ClientUser email collision with an earlier run (email is globally unique)",
    "portal JWT not stored/sent (localStorage) so /api/portal/reports 401s",
  ], async () => {
    if (!owner.ok) return needOwner("the portal invitation");
    const notes: string[] = [];
    let clientId = F.clientId;
    let email = F.clientEmail?.toLowerCase();
    const taken = clientId
      ? (await localQuery(`SELECT 1 FROM "ClientUser" WHERE "clientId" = $1 OR lower(email) = lower($2)`, [clientId, email ?? ""])).length > 0
      : true;
    if (!clientId || !email || taken || email !== F.clientEmail) {
      const s = await seedClientAndJob(owner, "c8");
      clientId = s.clientId;
      email = s.email;
      notes.push("used a fresh client + job (journey client missing, already has a login, or has a mixed-case email)");
    }
    const inv = await hit(owner.ctx.request, "POST", "/api/portal/invitations", { clientId, message: "Your job portal" });
    let token: string | undefined = inv.json?.invitation?.token;
    if (!token) {
      const row = await localQuery<{ token: string }>(
        `SELECT token FROM "PortalInvitation" WHERE "clientId" = $1 AND status::text = 'PENDING' AND "expiresAt" > now()
          ORDER BY "createdAt" DESC LIMIT 1`,
        [clientId],
      );
      token = row[0]?.token;
    }
    notes.push(`invite ${brief(inv)}${token ? "" : ", no token"}`);
    if (!token) return fail(notes.join("; "), [
      "client already has a ClientUser",
      "owner session not the client's owner (404)",
      "invite create failed server-side",
    ], proof(inv));
    const password = `Wt-${randomBytes(12).toString("base64url")}`; // throwaway, generated per run
    await page.goto(`/portal/signup?token=${token}`, { timeout: 45_000 });
    if (!(await visible(page.locator("#portal-signup-password"), 15_000))) return fail(`${notes.join("; ")}; signup form not shown`, [
      "invitation verify said invalid", "invitation already accepted", "signup page error",
    ]);
    const name = page.locator("#portal-signup-name");
    if (!(await name.inputValue())) await name.fill("Walkthrough Client");
    await page.locator("#portal-signup-password").fill(password);
    await page.locator("#portal-signup-confirm-password").fill(password);
    const [acc] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/portal/invitations/accept"), { timeout: 20_000 }),
      page.getByRole("button", { name: /Create Account/ }).click({ timeout: 10_000 }),
    ]);
    notes.push(`sign up ${acc.status()}`);
    await page.evaluate(() => window.localStorage.removeItem("ra_portal_token"));
    await page.goto("/portal/login", { timeout: 45_000 });
    await page.locator("#portal-email").fill(email!);
    await page.locator("#portal-password").fill(password);
    const [login] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/portal/auth/login"), { timeout: 20_000 }),
      page.locator('button[type="submit"]').click({ timeout: 10_000 }),
    ]);
    notes.push(`log in ${login.status()}`);
    const reportLink = page.locator('a[href^="/portal/reports/"]').first();
    if (!login.ok() || !(await visible(reportLink, 20_000))) return fail(notes.join("; "), [
      "login 401: email case or ClientUser not created", "no report linked to this client", "portal token not stored",
    ], { status: login.status(), url: login.url(), method: "POST" });
    await reportLink.click();
    await page.waitForURL(/\/portal\/reports\//, { timeout: 20_000 });
    const dlBtn = page.getByRole("button", { name: "Download PDF" });
    if (await visible(dlBtn, 5_000)) {
      const [dl] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/download"), { timeout: 30_000 }),
        dlBtn.click(),
      ]);
      notes.push(`report page Download PDF ${dl.status()}`);
    } else notes.push("report page shows no Download PDF (report DRAFT)");
    // An owner-requested approval (C5 asks for COST_ESTIMATE) renders a PENDING badge, not a button.
    notes.push(`PENDING badges with no answer button=${await page.getByText("PENDING", { exact: true }).count()}`);
    const approveBtn = page.getByRole("button", { name: "Review & Approve" }).first();
    if (!(await visible(approveBtn, 15_000))) return fail(`${notes.join("; ")}; no Review & Approve button`, [
      "both approvals already decided or pending", "report page failed to load", "button label changed",
    ]);
    await approveBtn.click();
    await page.locator("#approval-decision").selectOption("APPROVED");
    await page.locator("#approval-comments").fill("Approved from the walkthrough");
    const [appr] = await Promise.all([
      page.waitForResponse((r) => /\/api\/portal\/reports\/[^/]+\/approvals/.test(r.url()) && r.request().method() === "POST", { timeout: 20_000 }),
      page.getByRole("button", { name: "Submit", exact: true }).click({ timeout: 10_000 }),
    ]);
    notes.push(`approve ${appr.status()}`);
    const pr = { status: appr.status(), url: appr.url(), method: "POST" };
    if (acc.status() === 201 && login.ok() && appr.ok()) return { outcome: "PASS", note: notes.join("; "), ...pr };
    return fail(notes.join("; "), [
      "approval POST refused (idempotency or unique approval type)", "sign up failed but an older account let login pass", "portal JWT rejected",
    ], pr);
  });

  // C9 — owner revokes a pending portal invite (G6: the route does not exist).
  await run(owner.page, "C9", [
    "owner session unavailable",
    "the fresh client/invite could not be created",
    "the dashboard page redirected (paywall/login) so the Revoke button never showed",
  ], async () => {
    if (!owner.ok) return needOwner("revoking an invite");
    const s = await seedClientAndJob(owner, "c9");
    const inv = await hit(owner.ctx.request, "POST", "/api/portal/invitations", { clientId: s.clientId });
    const invId = inv.json?.invitation?.id;
    const invToken = inv.json?.invitation?.token;
    if (!invId) return fail(`invite for a second client: ${brief(inv)}`, OWNER_CAUSES, proof(inv));
    const direct = await hit(owner.ctx.request, "DELETE", `/api/portal/invitations/${invId}`);
    const notes = [`new pending invite ${brief(inv)}`, `direct ${brief(direct)}`];
    let uiStatus: number | null = null;
    const nav = await owner.page.goto(`/dashboard/clients/${s.clientId}/portal`, { timeout: 45_000 });
    notes.push(`dashboard page ${nav?.status() ?? 0} at ${pathOf(owner.page.url())}`);
    const revoke = owner.page.getByRole("button", { name: "Revoke" }).first();
    if (await visible(revoke, 15_000)) {
      await revoke.click();
      const [del] = await Promise.all([
        owner.page.waitForResponse((r) => r.url().includes(`/api/portal/invitations/${invId}`) && r.request().method() === "DELETE", { timeout: 15_000 }),
        owner.page.getByRole("button", { name: "Yes, revoke" }).first().click({ timeout: 10_000 }),
      ]);
      uiStatus = del.status();
      notes.push(`UI Revoke -> DELETE ${uiStatus}`);
    } else notes.push("Revoke button not visible");
    const row = await localQuery<{ status: string }>(`SELECT status::text AS status FROM "PortalInvitation" WHERE id = $1`, [invId]);
    const still = await hit(owner.ctx.request, "GET", `/api/portal/invitations/verify?token=${invToken}`);
    notes.push(`invite status after=${row[0]?.status}; verify says valid=${String(still.json?.valid)}`);
    notes.push("revocation exists for portal ACCOUNTS (/api/admin/portal-accounts/[id]/revoke), not invitations");
    const status = uiStatus ?? direct.status;
    const pr = { status, url: `${BASE}/api/portal/invitations/${invId}`, method: "DELETE" };
    if (status >= 400 && row[0]?.status === "PENDING") return { outcome: "EXPECTED-BY-CODE", gap: "G6", note: notes.join("; "), ...pr };
    if (status < 400 && row[0]?.status === "REVOKED") return { outcome: "PASS", gap: "G6", note: `G6 refuted; ${notes.join("; ")}`, ...pr };
    return fail(notes.join("; "), [
      "DELETE succeeded but did not change the invite", "UI never sent the DELETE", "invite row missing",
    ], { gap: "G6", ...pr });
  });

  // C10 — Restoration Pulse client update via the local cron (G7: off by default).
  await run(page, "C10", [
    "CRON_SECRET not exported to the spec, or differs from the server's (401)",
    "cron job skipped because a previous run holds the lock",
    "no job resolved for this client",
  ], async () => {
    if (!F.jobId) return needPortal("Pulse");
    if (!process.env.CRON_SECRET) return fail("CRON_SECRET not in process.env", [
      "runner did not export .env.local", "CRON_SECRET missing from .env.local", "spec launched outside the runner",
    ]);
    const auth = { authorization: `Bearer ${process.env.CRON_SECRET}` };
    const logs = async () =>
      localQuery<{ status: string; reason: string | null; type: string }>(
        `SELECT status, "suppressionReason" AS reason, "eventType" AS type FROM "ClientCommsLog" WHERE "inspectionId" = $1 ORDER BY "createdAt"`,
        [F.jobId],
      );
    const pulseBefore = (await localQuery<{ on: boolean }>(`SELECT "pulseEnabled" AS on FROM "Inspection" WHERE id = $1`, [F.jobId]))[0]?.on;
    const run1 = await hit(page.request, "GET", "/api/cron/pulse-digest", undefined, auth, 60_000);
    const notes = [`pulseEnabled default=${String(pulseBefore)}`, `cron #1 ${run1.status} ${JSON.stringify(run1.json?.metadata ?? run1.json ?? {}).slice(0, 120)}`];
    let run2: Hit | null = null;
    if (owner.ok && pulseBefore === false) {
      const on = await hit(owner.ctx.request, "PATCH", `/api/inspections/${F.jobId}`, { pulseEnabled: true });
      run2 = await hit(page.request, "GET", "/api/cron/pulse-digest", undefined, auth, 60_000);
      notes.push(`owner turned Pulse on: ${brief(on)}`, `cron #2 ${run2.status} ${JSON.stringify(run2.json?.metadata ?? run2.json ?? {}).slice(0, 120)}`);
    }
    const rows = await logs();
    const sent = rows.some((r) => r.status === "SENT");
    notes.push(`ClientCommsLog for job: ${rows.length ? rows.map((r) => `${r.type}:${r.status}${r.reason ? `/${r.reason}` : ""}`).join(",") : "none"}`);
    notes.push("digest needs today's moisture readings; COP update only after 20 business days; send also needs CLIENT_COMMS add-on + Mailtrap env");
    await page.goto(F.portalPath ?? "/", { timeout: 45_000 });
    const last = run2 ?? run1;
    if (run1.status !== 200) return fail(notes.join("; "), [
      "CRON_SECRET mismatch between runner and server", "cron route error (see badResponses)", "setup/paywall gate intercepted /api/cron",
    ], { gap: "G7", ...proof(run1) });
    if (sent) return { outcome: "PASS", gap: "G7", note: `G7 refuted; ${notes.join("; ")}`, ...proof(last) };
    return { outcome: "EXPECTED-BY-CODE", gap: "G7", note: notes.join("; "), ...proof(last) };
  });

  // C11 — insurer share link and public invoice link open.
  await run(page, "C11", [
    "report not COMPLETED, so the insurer link is refused (409)",
    "PORTAL_SECRET unset on the server (insurer token 500)",
    "invoice create or public-token rotation refused",
  ], async () => {
    if (!owner.ok) return needOwner("insurer and invoice links");
    if (!F.reportId || !F.clientId) return needPortal("insurer and invoice links");
    const notes: string[] = [];
    const ins = await hit(owner.ctx.request, "POST", `/api/reports/${F.reportId}/insurer-link`, {});
    notes.push(`insurer link ${brief(ins)}`);
    let insurerOk = false;
    if (ins.status === 200 && ins.json?.url) {
      const r = await page.goto(pathOf(ins.json.url), { timeout: 45_000 });
      const expired = await visible(page.getByText("Link Expired or Invalid"), 3_000);
      insurerOk = (r?.status() ?? 0) < 400 && !expired;
      notes.push(`insurer page ${r?.status() ?? 0}, expired card=${expired}`);
    }
    const due = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const invc = await hit(owner.ctx.request, "POST", "/api/invoices", {
      clientId: F.clientId,
      reportId: F.reportId,
      customerName: F.clientName || "Walkthrough Client",
      customerEmail: F.clientEmail || "walkthrough-client@test.local",
      dueDate: due,
      lineItems: [{ description: "Water damage drying: equipment hire", quantity: 1, unitPrice: 55000, gstRate: 10 }],
    });
    const invoiceId = invc.json?.invoice?.id;
    const rot = invoiceId ? await hit(owner.ctx.request, "POST", `/api/invoices/${invoiceId}/rotate-public-token`, {}) : null;
    notes.push(`invoice ${brief(invc)}; ${rot ? brief(rot) : "rotate skipped"}`);
    let invoiceOk = false;
    let last: Pick<StepResult, "status" | "url" | "method"> = proof(rot ?? invc);
    const pub = rot?.json?.publicToken;
    if (pub) {
      const [api] = await Promise.all([
        page.waitForResponse((r) => r.url().includes(`/api/invoices/public/`), { timeout: 20_000 }),
        page.goto(`/invoices/public/${pub}`, { timeout: 45_000 }),
      ]);
      const shown = await visible(page.getByText("Tax Invoice").first(), 10_000);
      invoiceOk = api.ok() && shown;
      last = { status: api.status(), url: api.url(), method: "GET" };
      notes.push(`public invoice API ${api.status()}, page shows "Tax Invoice"=${shown}`);
    }
    notes.push(`PORTAL_SECRET in runner env=${Boolean(process.env.PORTAL_SECRET)}`);
    if (insurerOk && invoiceOk) return { outcome: "PASS", note: notes.join("; "), ...last };
    return fail(`insurer ok=${insurerOk}, invoice ok=${invoiceOk}; ${notes.join("; ")}`, [
      "report not COMPLETED (insurer link 409)",
      "PORTAL_SECRET unset on the server (insurer link 500)",
      "invoice create/rotation refused (validation or add-on gate)",
    ], last);
  });

  await owner.ctx.close().catch(() => undefined);
});
