/**
 * Walkthrough journey 2 of 3: the FIELD TECHNICIAN on a phone-sized screen
 * (project "technician": Pixel 7, geolocation Brisbane). Steps T1-T14, ids and
 * titles verbatim from steps.json.
 *
 * Runs after the owner journey and reads what it handed over through state.json
 * (technicianInviteUrl, technicianEmail, jobId). Any key may be missing: the
 * journey then seeds its own data through the /api/test/* helpers and says so in
 * the step note. Every step writes exactly one line via recorder.step(), which
 * never throws, so a broken screen cannot hide the rest of the journey.
 *
 * API calls run as fetch() INSIDE the page, so they carry the browser's own
 * session cookie and Origin header and land in the recorder's bad-response log.
 *
 * Local-stack accommodation (test side only, no product change): the stack is a
 * production build (NODE_ENV=production) served over http. lib/auth.ts then names
 * the session cookie "__Secure-next-auth.session-token", but proxy.ts calls
 * getToken() without a cookieName and next-auth derives "next-auth.session-token"
 * from the http NEXTAUTH_URL, so every /dashboard page would bounce to /login even
 * when signed in. adoptSession() mirrors the one session value under both names.
 * On https production the two names are the same cookie.
 */
import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Response as PwResponse,
} from "@playwright/test";
import { TEST_HEADSHOT_JPEG } from "../fixtures/headshot-jpeg";
import {
  localQuery,
  readState,
  step,
  watch,
  writeState,
  type StepResult,
} from "./recorder";

test.describe.configure({ mode: "serial" });

const SECURE_COOKIE = "__Secure-next-auth.session-token";
const PLAIN_COOKIE = "next-auth.session-token";
const BRISBANE = { lat: -27.4698, lng: 153.0251 };
const JPEG_B64 = TEST_HEADSHOT_JPEG.toString("base64");
const WAV_B64 = silentWav().toString("base64");

interface ApiResult {
  status: number;
  ok: boolean;
  body: unknown;
  text: string;
  contentType: string;
  bytes?: number;
  head?: string;
}

/** One second of 8 kHz 16-bit mono silence: a valid RIFF/WAVE file. */
function silentWav(): Buffer {
  const data = 8000 * 2;
  const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + data, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(data, 40);
  return b;
}

/** fetch() from inside the page (same cookies, same Origin as the real app). */
async function api(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<ApiResult> {
  const call = () =>
    page.evaluate(
      async (a) => {
        try {
          const init: RequestInit = { method: a.method, headers: { ...a.headers }, credentials: "same-origin" };
          if (a.body !== undefined) {
            init.headers = { "content-type": "application/json", ...a.headers };
            init.body = JSON.stringify(a.body);
          }
          const res = await fetch(a.path, init);
          const contentType = res.headers.get("content-type") ?? "";
          if (/pdf|octet-stream/.test(contentType)) {
            const buf = new Uint8Array(await res.arrayBuffer());
            const head = String.fromCharCode(...Array.from(buf.slice(0, 5)));
            return { status: res.status, ok: res.ok, body: null, text: "", contentType, bytes: buf.length, head };
          }
          const text = await res.text();
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = null;
          }
          return { status: res.status, ok: res.ok, body: parsed, text: text.slice(0, 400), contentType };
        } catch (err) {
          return { status: 0, ok: false, body: null, text: `network error: ${String(err)}`, contentType: "" };
        }
      },
      { method, path, body, headers },
    );
  try {
    return await call();
  } catch {
    // "Execution context was destroyed" while a client-side redirect settles.
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    return call();
  }
}

/** Multipart upload from inside the page. */
async function upload(
  page: Page,
  path: string,
  file: { field: string; name: string; type: string; b64: string },
  fields: Record<string, string> = {},
): Promise<ApiResult> {
  return page.evaluate(
    async (a) => {
      try {
        const bin = Uint8Array.from(atob(a.file.b64), (c) => c.charCodeAt(0));
        const fd = new FormData();
        fd.append(a.file.field, new File([bin as BlobPart], a.file.name, { type: a.file.type }));
        for (const [k, v] of Object.entries(a.fields)) fd.append(k, v);
        const res = await fetch(a.path, { method: "POST", body: fd, credentials: "same-origin" });
        const text = await res.text();
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        return { status: res.status, ok: res.ok, body: parsed, text: text.slice(0, 400), contentType: res.headers.get("content-type") ?? "" };
      } catch (err) {
        return { status: 0, ok: false, body: null, text: `network error: ${String(err)}`, contentType: "" };
      }
    },
    { path, file, fields },
  );
}

/** "402 PAYMENT_REQUIRED Active subscription required" style summary. */
function brief(r: ApiResult): string {
  if (r.ok) return String(r.status);
  const b = r.body as { error?: unknown; message?: unknown } | null;
  const e = b?.error;
  const msg =
    typeof e === "string"
      ? e
      : e && typeof e === "object"
        ? `${(e as { code?: string }).code ?? ""} ${(e as { message?: string }).message ?? ""}`.trim()
        : typeof b?.message === "string"
          ? b.message
          : r.text;
  return `${r.status}${msg ? ` "${msg.slice(0, 160)}"` : ""}`;
}

/**
 * A step that could not be exercised at all. This is UNMEASURED, not FAIL: recording it
 * as FAIL claimed the step had been run and found broken, which is a different and much
 * stronger statement, and it let an unexercised run verify clean.
 */
function cannot(what: string, causes: [string, string, string]): StepResult {
  return {
    outcome: "UNMEASURED",
    note: `${what}. Likely causes: (1) ${causes[0]}; (2) ${causes[1]}; (3) ${causes[2]}.`,
  };
}

const noJob = (): StepResult =>
  cannot("No technician job to work on", [
    "T4 could not create a job (POST /api/inspections refused)",
    "the technician session was not established in T1",
    "the seed-inspection test helper is disabled (ALLOW_TEST_HELPERS not true)",
  ]);

/** Mirror the session value under both cookie names (see the header comment). */
async function adoptSession(context: BrowserContext, base: string, setCookie = ""): Promise<boolean> {
  const host = new URL(base).hostname;
  let value = setCookie.match(/(?:__Secure-)?next-auth\.session-token=([^;\s]+)/)?.[1];
  if (!value) {
    const jar = await context.cookies();
    value = jar.find((c) => c.name === SECURE_COOKIE)?.value ?? jar.find((c) => c.name === PLAIN_COOKIE)?.value;
  }
  if (!value) return false;
  await context.addCookies([
    { name: SECURE_COOKIE, value, domain: host, path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
    { name: PLAIN_COOKIE, value, domain: host, path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
  ]);
  return true;
}

/** Test-helper sign-in as a role-USER (technician) account; creates it if absent. */
async function helperSignIn(page: Page, context: BrowserContext, base: string, email: string): Promise<{ status: number; note: string }> {
  const res = await page.request.post("/api/test/sign-in-as", {
    data: { role: "USER", email },
    headers: { origin: new URL(base).origin },
    failOnStatusCode: false,
    timeout: 20_000,
  });
  const setCookie = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value)
    .join("\n");
  if (!res.ok()) return { status: res.status(), note: (await res.text().catch(() => "")).slice(0, 160) };
  return { status: res.status(), note: (await adoptSession(context, base, setCookie)) ? "" : "no session cookie in response" };
}

async function sessionUser(page: Page): Promise<{ id?: string; email?: string; role?: string }> {
  const r = await api(page, "GET", "/api/auth/session");
  return (r.body as { user?: { id?: string; email?: string; role?: string } } | null)?.user ?? {};
}

async function open(page: Page, path: string): Promise<number> {
  const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  return res?.status() ?? 0;
}

const onLogin = (page: Page) => new URL(page.url()).pathname === "/login";

test("technician journey: invite to report on a phone (T1-T14)", async ({ page, context, baseURL }) => {
  const base = baseURL ?? "http://localhost:3000";
  const abs = (p: string) => new URL(p, base).toString();
  await watch(page);
  const state = readState();
  const run = Date.now().toString(36);
  const tech: { email?: string; userId?: string; jobId?: string; fallback: boolean } = { fallback: false };
  const jobApi = (suffix = "") => `/api/inspections/${tech.jobId}${suffix}`;

  await step(page, "T1", "Accept the invite and sign in", async () => {
    const notes: string[] = [];
    let token = state.technicianInviteUrl?.match(/\/invite\/([A-Za-z0-9_-]+)/)?.[1] ?? "";
    if (token) notes.push("invite taken from state.technicianInviteUrl");
    else {
      const seed = await page.request.post("/api/test/seed-org-with-manager", { data: {}, failOnStatusCode: false, timeout: 20_000 });
      token = ((await seed.json().catch(() => ({}))) as { token?: string }).token ?? "";
      notes.push(`state.technicianInviteUrl missing; seeded a separate org + invite via /api/test/seed-org-with-manager (${seed.status()})`);
    }
    let accept: { status: number; text: string } | null = null;
    if (token) {
      try {
        await open(page, `/invite/${token}`);
        const preview = await api(page, "GET", `/api/invites/${token}`);
        const p = preview.body as { email?: string; roleLabel?: string } | null;
        tech.email = p?.email ?? state.technicianEmail;
        notes.push(`invite preview ${brief(preview)}${p?.roleLabel ? ` (role ${p.roleLabel})` : ""}`);
        await page.getByLabel("Your name").fill("Walkthrough Technician", { timeout: 15_000 });
        await page.getByLabel("Mobile (used for SMS reminders)").fill("0412345678");
        // Synthetic per-run password, never a real person's.
        await page.getByLabel("Set a password (min 12 chars)").fill(`Wt-${randomUUID()}`);
        await page.locator("#headshot").setInputFiles({ name: "headshot.jpg", mimeType: "image/jpeg", buffer: TEST_HEADSHOT_JPEG });
        await expect(page.locator('img[alt="Headshot preview"]')).toBeVisible({ timeout: 10_000 });
        await page.getByRole("button", { name: "Continue →" }).click();
        await page.locator("#terms").check({ timeout: 10_000 });
        await page.locator("#cocoa").check({ timeout: 10_000 });
        const [res] = await Promise.all([
          page.waitForResponse((r) => r.url().includes(`/api/invites/${token}`) && r.request().method() === "POST", { timeout: 60_000 }),
          page.getByRole("button", { name: /^Join/ }).click(),
        ]);
        accept = { status: res.status(), text: (await res.text().catch(() => "")).slice(0, 200) };
        notes.push(`invite accept POST ${accept.status}${accept.status >= 400 ? ` ${accept.text}` : ""}`);
        if (res.ok()) await page.waitForURL((u) => !u.pathname.startsWith("/invite/"), { timeout: 20_000 }).catch(() => undefined);
      } catch (err) {
        notes.push(`invite UI error: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
      }
    }
    const accepted = accept !== null && accept.status < 300;
    let user: { id?: string; email?: string; role?: string } = {};
    let ownSignIn = false;
    if (accepted) {
      await adoptSession(context, base); // the invite page's own credentials sign-in set the cookie
      await open(page, "/dashboard/field");
      user = await sessionUser(page);
      ownSignIn = !!user.id;
      if (user.id) notes.push("signed in by the invite page's own credentials sign-in");
      else if (tech.email) {
        const h = await helperSignIn(page, context, base, tech.email);
        notes.push(`no session after the invite page's sign-in; signed in via /api/test/sign-in-as (${h.status}${h.note ? ` ${h.note}` : ""})`);
        await open(page, "/dashboard/field");
        user = await sessionUser(page);
      }
    } else {
      tech.fallback = true;
      const email = `wt-tech-${run}@test.local`;
      const h = await helperSignIn(page, context, base, email);
      notes.push(`FALLBACK: technician seeded via /api/test/sign-in-as {role:USER} as ${email} (${h.status}${h.note ? ` ${h.note}` : ""}); it has its own stub organisation, NOT the owner's`);
      await open(page, "/dashboard/field");
      user = await sessionUser(page);
    }
    tech.email = user.email ?? tech.email;
    tech.userId = user.id;
    notes.push(user.id ? `session: ${user.email} role ${user.role}` : "NO session after sign-in");
    const note = notes.join("; ");
    if (accepted && ownSignIn) return { outcome: "PASS", status: accept!.status, note };
    if (accepted)
      return {
        outcome: "FAIL",
        status: accept!.status,
        note: `${note}. Invite accepted but the invite page's own sign-in gave no session. Likely causes: (1) the browser refused the Secure session cookie over http; (2) the credentials sign-in was rejected (see badResponses); (3) the session refresh after sign-in failed`,
      };
    if (!accept)
      return cannot(`Invite acceptance could not be exercised (${note})`, [
        "no invite token (owner O10 did not record one and seed-org-with-manager refused)",
        "the /invite/<token> form did not render the expected labels",
        "the Join button never sent the acceptance POST",
      ]);
    return {
      outcome: "FAIL",
      status: accept.status,
      note: `${note}. Likely causes: (1) no Cloudinary credentials in the local stack (acceptance uploads the headshot first, app/api/invites/[token]/route.ts); (2) the invite was already used or expired; (3) the session cookie was not accepted by the browser`,
    };
  });

  await step(page, "T2", "Sees the field menu", async () => {
    const status = await open(page, "/dashboard");
    if (onLogin(page))
      return cannot("The dashboard bounced to /login", ["no technician session from T1", "the proxy cannot read the session cookie", "the session was revoked"]);
    const menuOpened = await page
      .getByRole("button", { name: "Open menu" })
      .click({ timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(500);
    const want: Record<string, string> = {
      "Field Mode": "/dashboard/field",
      "Active Jobs": "/dashboard/inspections",
      "New Job": "/dashboard/inspections/new",
      Media: "/dashboard/media",
      Help: "/dashboard/help",
      Account: "/dashboard/settings",
    };
    const sidebar = page.locator("aside nav");
    const missing: string[] = [];
    for (const [label, href] of Object.entries(want)) {
      if ((await sidebar.locator(`a[href="${href}"]`).count()) === 0) missing.push(label);
    }
    const total = await sidebar.locator("a").count();
    const office = await sidebar.locator('a[href="/dashboard/invoices"]').count();
    const note = `menu ${menuOpened ? "opened" : "button not clickable"}; ${6 - missing.length}/6 field links${missing.length ? ` (missing ${missing.join(", ")})` : ""}; ${total} links in the menu; office-only Invoices link present: ${office > 0}`;
    return missing.length === 0 && office === 0 && status < 400 ? { outcome: "PASS", status, note } : { outcome: "FAIL", status, note };
  });

  await step(page, "T3", "Field Mode", async () => {
    const [list, status] = await Promise.all([
      page
        .waitForResponse((r) => r.url().includes("/api/inspections?status=") && r.request().method() === "GET", { timeout: 30_000 })
        .catch(() => null),
      open(page, "/dashboard/field"),
    ]);
    const heading = await page
      .getByRole("heading", { name: "Field Dashboard" })
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const note = `page ${status}; heading ${heading ? "shown" : "missing"}; today's jobs list ${list ? list.status() : "never requested"}`;
    if (heading && list && list.status() < 400) return { outcome: "PASS", status: list.status(), note };
    return { outcome: "FAIL", status: list?.status() ?? status, note };
  });

  await step(page, "T4", "Sees the job the owner created", async () => {
    let result: StepResult;
    if (!state.jobId) {
      result = cannot("state.jobId missing, so the owner's job could not be looked up", [
        "owner step O11 failed before creating the job",
        "the owner journey did not writeState({ jobId })",
        "the journeys used different WALKTHROUGH_DIR folders",
      ]);
    } else {
      await open(page, `/dashboard/inspections/${state.jobId}`);
      const seen = await api(page, "GET", `/api/inspections/${state.jobId}`);
      const row = (
        await localQuery<{ technicianId: string | null }>(`SELECT "technicianId" FROM "Inspection" WHERE id = $1`, [state.jobId]).catch(() => [])
      )[0];
      const db = row ? `owner's job technicianId in DB: ${row.technicianId ?? "null"}` : "owner's job row not readable from the DB";
      const who = tech.fallback ? "technician is the T1 fallback user (own org); " : "";
      if (seen.ok) result = { outcome: "PASS", status: seen.status, note: `${who}technician can open the owner's job (${seen.status}); ${db}` };
      else if (seen.status === 404 && row && row.technicianId === null)
        result = {
          outcome: "EXPECTED-BY-CODE",
          gap: "G1",
          status: 404,
          url: abs(`/api/inspections/${state.jobId}`),
          method: "GET",
          note: `${who}GET owner's job -> 404; ${db}. A role-USER caller only reaches jobs it owns or workspace jobs it is an active member of (lib/auth/assert-tenancy.ts), whatever its org, and nothing assigns the job to the technician`,
        };
      else result = { outcome: "FAIL", status: seen.status, note: `${who}GET owner's job -> ${brief(seen)}; ${db}` };
    }
    // The technician's own water job, so T5-T14 still have something to work on.
    const created = await api(page, "POST", "/api/inspections", {
      propertyAddress: `${run} Walkthrough Street, Brisbane City QLD`,
      propertyPostcode: "4000",
      claimType: "WATER",
      technicianName: "Walkthrough Technician",
      lossDescription: "Burst flexi hose under the bathroom vanity",
    });
    tech.jobId = (created.body as { inspection?: { id?: string } } | null)?.inspection?.id;
    let jobNote = `created own WATER job ${tech.jobId} (POST /api/inspections ${created.status}) so later steps still run`;
    if (!tech.jobId) {
      const seeded = await api(page, "POST", "/api/test/seed-inspection", { inspectionId: `wt-tech-${run}`, status: "DRAFT" });
      tech.jobId = (seeded.body as { inspectionId?: string } | null)?.inspectionId;
      jobNote = `own job create failed (${brief(created)}); seed-inspection fallback ${brief(seeded)} -> ${tech.jobId ?? "no job"} (no claim type, so the moisture pad may be hidden)`;
    }
    return { ...result, note: `${result.note}; ${jobNote}` };
  });

  await step(page, "T5", "Moisture readings and meter photo", async () => {
    if (!tech.jobId) return noJob();
    await open(page, `/dashboard/inspections/${tech.jobId}/field`);
    let moisture = { status: 0, how: "" };
    try {
      const chip = page.getByRole("button", { name: "Wall - bathroom", exact: true });
      await chip.waitFor({ state: "visible", timeout: 15_000 });
      await chip.click({ timeout: 10_000 });
      for (const k of ["2", "8"]) await page.getByRole("button", { name: k, exact: true }).first().click({ timeout: 10_000 });
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.url().includes(`${jobApi("/moisture")}`) && r.request().method() === "POST", { timeout: 20_000 }),
        page.getByRole("button", { name: "Save Reading" }).click({ timeout: 10_000 }),
      ]);
      moisture = { status: res.status(), how: "the moisture pad" };
    } catch (err) {
      const r = await api(page, "POST", jobApi("/moisture"), { location: "Wall - bathroom", surfaceType: "plasterboard", moistureLevel: 28, depth: "Surface" });
      moisture = { status: r.status, how: `the API (pad UI error: ${String((err as Error)?.message ?? err).slice(0, 100)})` };
    }
    const vision = await api(page, "POST", "/api/vision/extract-reading", { image: JPEG_B64, mediaType: "image/jpeg" });
    const note = `manual reading 28% via ${moisture.how} -> ${moisture.status}; meter photo AI read -> ${brief(vision)}`;
    if (moisture.status === 0 || moisture.status >= 300) return { outcome: "FAIL", status: moisture.status || undefined, note };
    if (vision.ok) return { outcome: "PASS", status: vision.status, note };
    if (vision.status === 402)
      return {
        outcome: "EXPECTED-BY-CODE",
        gap: "G2",
        status: 402,
        url: abs("/api/vision/extract-reading"),
        method: "POST",
        note: `${note}. The manual reading saved; the AI meter read is refused for the technician (the message says whether the per-user subscription check or the missing workspace AI key refused it)`,
      };
    return { outcome: "FAIL", status: vision.status || undefined, note };
  });

  await step(page, "T6", "Psychrometric readings and drying goal", async () => {
    if (!tech.jobId) return noJob();
    await open(page, `/dashboard/inspections/${tech.jobId}/monitoring`);
    const psy = await api(page, "POST", jobApi("/psychrometric"), {
      visitDate: new Date().toISOString(),
      visitNumber: 1,
      dryBulbTempC: 24,
      relativeHumidity: 68,
      equipmentRunning: true,
      notes: "Walkthrough day 1",
    });
    const goal = await api(page, "POST", jobApi("/drying-goal"), { targetCategory: "Category 1", targetClass: "Class 2" });
    const evaluate = await api(page, "PUT", jobApi("/drying-goal"), {});
    const dew = (psy.body as { dewPointC?: number } | null)?.dewPointC;
    const verdict = (evaluate.body as { status?: string } | null)?.status;
    const note = `psychrometric reading -> ${brief(psy)}${dew != null ? ` (dew point ${dew} °C calculated)` : ""}; drying goal set -> ${brief(goal)}; goal evaluated -> ${brief(evaluate)}${verdict ? ` (${verdict})` : ""}`;
    const failed = [psy, goal, evaluate].find((r) => !r.ok && !(r === goal && r.status === 409));
    return failed ? { outcome: "FAIL", status: failed.status || undefined, note } : { outcome: "PASS", status: psy.status, note };
  });

  await step(page, "T7", "Photos with location", async () => {
    if (!tech.jobId) return noJob();
    await open(page, `/dashboard/inspections/${tech.jobId}/photos`);
    const pos = await page.evaluate(
      () =>
        new Promise<{ lat: number; lng: number } | null>((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { timeout: 8_000 },
          );
        }),
    );
    const gps: Record<string, string> = pos ? { gpsLat: String(pos.lat), gpsLng: String(pos.lng) } : {};
    const up = await upload(
      page,
      jobApi("/photos"),
      { field: "file", name: "site-photo.jpg", type: "image/jpeg", b64: JPEG_B64 },
      { ...gps, caption: "Walkthrough site photo", location: "Bathroom" },
    );
    const stored = up.ok
      ? (
          await localQuery<{ lat: number | null; lng: number | null }>(
            `SELECT "gpsLatitude" AS lat, "gpsLongitude" AS lng FROM "InspectionPhoto" WHERE "inspectionId" = $1 AND "gpsLatitude" IS NOT NULL LIMIT 1`,
            [tech.jobId],
          ).catch(() => [])
        )[0]
      : undefined;
    const near = !!stored && Math.abs((stored.lat ?? 0) - BRISBANE.lat) < 0.01 && Math.abs((stored.lng ?? 0) - BRISBANE.lng) < 0.01;
    const note = `browser position ${pos ? `${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}` : "unavailable"}; photo upload -> ${brief(up)}; location stored with the photo: ${stored ? `${stored.lat},${stored.lng}` : "none"}`;
    if (up.ok && near) return { outcome: "PASS", status: up.status, note };
    if (!up.ok)
      return {
        outcome: "FAIL",
        status: up.status || undefined,
        note: `${note}. Likely causes: (1) no Cloudinary credentials in the local stack (the default photo store, lib/storage); (2) the organisation's storage is set to an unimplemented bring-your-own store; (3) the upload was refused by validation or the rate limiter`,
      };
    return { outcome: "FAIL", status: up.status, note: `${note}; the photo saved without the expected location` };
  });

  await step(page, "T8", "Sketch and floor plan", async () => {
    if (!tech.jobId) return noJob();
    await open(page, `/dashboard/inspections/${tech.jobId}`);
    const room = {
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 300 },
        { x: 0, y: 300 },
      ],
      data: { type: "room", label: "Bathroom", provenance: "operator_measured" },
    };
    const sketch = await api(
      page,
      "POST",
      jobApi("/sketches"),
      { floorNumber: 0, floorLabel: "Ground Floor", sketchType: "structural", sketchData: { scaleConfig: { pxPerMetre: 100 }, objects: [room] } },
      { "x-client-updated-at": String(Date.now()) },
    );
    const estimate = await api(page, "GET", jobApi("/sketches/estimate"));
    const areas = ((estimate.body as { lineItems?: Array<{ areaM2?: number }> } | null)?.lineItems ?? []).filter((li) => typeof li.areaM2 === "number");
    const affected = await api(page, "POST", jobApi("/affected-areas"), {
      roomZoneId: "Bathroom",
      affectedAreaSqm: 9,
      waterSource: "Burst flexi hose",
      description: "Walkthrough affected area",
    });
    const note = `3 m x 3 m room saved -> ${brief(sketch)}; estimate -> ${brief(estimate)} with ${areas.length} measured area line(s) [${areas.map((a) => a.areaM2).join(", ")} m2]; affected area recorded -> ${brief(affected)}; drawing on the canvas and the underlay add-on were not exercised`;
    if (sketch.ok && estimate.ok && areas.length > 0) return { outcome: "PASS", status: sketch.status, note };
    return { outcome: "FAIL", status: (sketch.ok ? estimate.status : sketch.status) || undefined, note };
  });

  await step(page, "T9", "Voice note", async () => {
    if (!tech.jobId) return noJob();
    await open(page, `/dashboard/inspections/${tech.jobId}/voice`);
    const r = await upload(page, "/api/ai/voice-note-transcribe", { field: "audio", name: "voice-note.wav", type: "audio/wav", b64: WAV_B64 });
    const note = `1-second recording sent for transcription -> ${brief(r)}; live microphone capture not exercised (the test browser has no microphone)`;
    if (r.ok) return { outcome: "PASS", status: r.status, note };
    if (r.status === 402)
      return { outcome: "EXPECTED-BY-CODE", gap: "G2", status: 402, url: abs("/api/ai/voice-note-transcribe"), method: "POST", note: `${note}. Voice transcription is refused for the technician` };
    return { outcome: "FAIL", status: r.status || undefined, note };
  });

  await step(page, "T10", "AI classification and scope", async () => {
    if (!tech.jobId) return noJob();
    await open(page, `/dashboard/inspections/${tech.jobId}`);
    const cls = await api(page, "POST", jobApi("/classify"), {});
    const scope = await api(page, "POST", jobApi("/generate-scope"), { affectedAreaM2: 9, affectedRooms: ["Bathroom"], stream: false });
    const members = tech.userId
      ? await localQuery<{ n: number }>(`SELECT count(*)::int AS n FROM "WorkspaceMember" WHERE "userId" = $1 AND status = 'ACTIVE'`, [tech.userId]).catch(() => null)
      : null;
    const note = `AI classification -> ${brief(cls)}; AI scope -> ${brief(scope)}; technician's active workspace memberships in DB: ${members?.[0]?.n ?? "unknown"}`;
    if (cls.ok && scope.ok) return { outcome: "PASS", status: cls.status, note };
    if (cls.status === 402 && scope.status === 402)
      return { outcome: "EXPECTED-BY-CODE", gap: "G2", status: 402, url: abs(jobApi("/classify")), method: "POST", note };
    return { outcome: "FAIL", status: (cls.ok ? scope.status : cls.status) || undefined, note };
  });

  await step(page, "T11", "Equipment calculator, checklist, signature", async () => {
    if (!tech.jobId) return noJob();
    await open(page, `/dashboard/inspections/${tech.jobId}/field`);
    const eq = await api(page, "POST", jobApi("/equipment-calculator"), {
      affectedAreaM2: 9,
      damageCategory: "CAT_1",
      damageClass: "CLASS_2",
      floorCount: 1,
      saveScopeItems: true,
    });
    const cl = await api(page, "GET", jobApi("/voice/checklist"));
    const items = (cl.body as { items?: Array<{ complete?: boolean }> } | null)?.items ?? [];
    await page.getByRole("button", { name: /Checklist/ }).first().click({ timeout: 5_000 }).catch(() => undefined);
    const sign = await api(page, "POST", jobApi("/sign"), { signatoryName: "Walkthrough Technician", role: "Lead Technician" });
    const saved = (eq.body as { savedScopeItemIds?: unknown[] } | null)?.savedScopeItemIds?.length ?? 0;
    const note = `equipment calculator -> ${brief(eq)} (${saved} equipment lines saved to scope); checklist -> ${brief(cl)} (${items.filter((i) => i.complete).length}/${items.length} complete); typed-name signature -> ${brief(sign)}; drawn signature pad not exercised`;
    const failed = [eq, cl, sign].find((r) => !r.ok);
    return failed ? { outcome: "FAIL", status: failed.status || undefined, note } : { outcome: "PASS", status: sign.status, note };
  });

  await step(page, "T12", "Work offline, then sync", async () => {
    if (!tech.jobId) return noJob();
    await open(page, `/dashboard/inspections/${tech.jobId}/field`);
    const chip = page.getByRole("button", { name: "Floor - lounge", exact: true });
    const shown = await chip
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!shown)
      return cannot("The moisture pad did not render, so no reading could be entered offline", [
        "the job has no WATER claim type (seeded fallback job)",
        "the field page could not load the job (see badResponses)",
        "the Moisture tab was not the default tab",
      ]);
    let uiMessage = "";
    await context.setOffline(true);
    try {
      await chip.click({ timeout: 10_000 });
      for (const k of ["3", "7", ".", "4"]) await page.getByRole("button", { name: k, exact: true }).first().click({ timeout: 10_000 });
      await page.getByRole("button", { name: "Save Reading" }).click({ timeout: 10_000 });
      uiMessage = (await page.getByText(/Save failed|Saved|queued/).first().textContent({ timeout: 8_000 }).catch(() => null)) ?? "no message shown";
    } finally {
      await context.setOffline(false);
    }
    const syncs: number[] = [];
    const onResp = (r: PwResponse) => {
      if (r.url().includes(jobApi("/moisture")) && r.request().method() === "POST") syncs.push(r.status());
    };
    page.on("response", onResp);
    let n = 0;
    for (let i = 0; i < 10 && n === 0; i++) {
      await page.waitForTimeout(2_000);
      const rows = await localQuery<{ n: number }>(
        `SELECT count(*)::int AS n FROM "MoistureReading" WHERE "inspectionId" = $1 AND location = $2 AND "moistureLevel" BETWEEN 37.35 AND 37.45`,
        [tech.jobId, "Floor - lounge"],
      ).catch(() => [{ n: -1 }]);
      n = rows[0]?.n ?? 0;
    }
    page.off("response", onResp);
    const note = `offline save of 37.4% at "Floor - lounge": screen said "${uiMessage.trim().slice(0, 80)}"; replayed saves after reconnecting: ${syncs.join(",") || "none"}; matching readings in DB after about 20 s: ${n < 0 ? "DB unreadable" : n}`;
    if (n > 0) return { outcome: "PASS", status: syncs.find((s) => s < 400), note };
    if (n < 0) return cannot(`Could not read the local DB (${note})`, ["DATABASE_URL not exported to the test process", "the local Postgres stopped", "DATABASE_URL points at a non-local host (localQuery refuses it)"]);
    return {
      outcome: "FAIL",
      note: `${note}. Likely causes: (1) the quick moisture pad posts with plain fetch and has no offline branch (components/mobile/QuickMoistureEntry.tsx); (2) the offline queue (lib/nir-sync-queue.ts) is only wired to sketch saves; (3) the service worker handles GET requests only (public/sw.js), so nothing replays the save`,
    };
  });

  await step(page, "T13", "Bluetooth meter pairing", async () => {
    const status = await open(page, "/dashboard/field/bluetooth-pair");
    const heading = await page
      .getByRole("heading", { name: "Field Devices" })
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const pairButtons = await page.getByRole("button", { name: "Pair meter" }).count();
    const note = `page ${status}; heading ${heading ? "shown" : "missing"}; "Pair meter" buttons offered: ${pairButtons}`;
    if (!heading || status >= 400) return { outcome: "FAIL", status, note };
    if (pairButtons === 0)
      return { outcome: "EXPECTED-BY-CODE", gap: "G5", status, note: `${note}. No meter can be paired: every device lists the reason instead of a pair button` };
    return cannot(`${note}; a pair button is now offered but pairing needs a physical meter`, [
      "a device profile was promoted to VERIFIED in lib/field-device-registry.ts",
      "the test browser has no Bluetooth adapter",
      "no meter is in range of the test machine",
    ]);
  });

  await step(page, "T14", "Submit, close, report PDF", async () => {
    if (!tech.jobId) return noJob();
    await open(page, `/dashboard/inspections/${tech.jobId}`);
    const submit = await api(page, "POST", jobApi("/submit"), {});
    const pdfPath = jobApi("/report?format=pdf");
    const pdf = await api(page, "GET", pdfPath);
    const close = await api(page, "POST", jobApi("/close"), { closeSummary: "Walkthrough: technician attempted to close the job" });
    const pdfOk = pdf.status === 200 && pdf.head === "%PDF-";
    const note = `submit -> ${brief(submit)}; report PDF -> ${pdf.bytes ? `${pdf.status} (${pdf.bytes} bytes, starts "${pdf.head}")` : brief(pdf)}; close -> ${brief(close)}${close.status === 403 ? " (closing is limited to MANAGER/ADMIN in lib/progress/permissions.ts, so the owner must close)" : ""}`;
    if (pdfOk && !readState().reportPdfUrl) writeState({ reportPdfUrl: abs(pdfPath) });
    if (submit.ok && pdfOk && (close.ok || close.status === 403)) return { outcome: "PASS", status: pdf.status, url: abs(pdfPath), method: "GET", note };
    const failed = [submit, pdf, close].find((r) => !r.ok && !(r === close && r.status === 403));
    return { outcome: "FAIL", status: failed?.status || undefined, note };
  });
});
