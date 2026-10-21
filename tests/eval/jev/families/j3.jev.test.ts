/**
 * J3 — a restoration claim end to end through the real route handlers:
 * CRM, inspection flow, photos, floor plans and house plans, invoice, payment.
 *
 * Every step is an invokeRoute call against app/api; the database is written
 * directly only to build the starting world (j3/world.ts) and, once per
 * invoice, to stand in for the email the send route cannot deliver here.
 *
 * Verdict rule, applied to every step:
 *   - handler returned no status: refused host -> INCONCLUSIVE needs provider;
 *     a handler throw -> FAIL (unhandled exception); import/timeout -> INCONCLUSIVE.
 *   - 5xx: refused host -> INCONCLUSIVE needs provider; none -> FAIL.
 *   - otherwise the step's oracle decides PASS or FAIL.
 *   - a step whose prerequisite is not PASS is INCONCLUSIVE "blocked by <step>".
 *   - an outsider response carrying firm A's mark is FAIL whatever else holds.
 */
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { recordResults, classify, type JevArea, type JevResult, type JevState } from "./../runner/record";
import { invokeRoute, type InvokeOptions, type InvokeResult, type Method } from "../runner/route-harness";
import { asIdentity, takeBlocked } from "../runner/setup";
import { FIRM_A, sessionUser, type IdentityName } from "../runner/world";
import { describeToolObject } from "@/lib/sketch/tool-objects";
import { buildJ3World, resetRateLimits, standInSend, type J3World } from "./j3/world";
import { variants, WATER_SOURCE, type InvoiceLine, type Variant } from "./j3/variants";
import { gstOracle, sketchEstimateOracle, tenantListOracle, webhookRejectOracle, cents, type Check } from "./j3/oracles";

// The shared setup mocks next/headers with empty headers, so a route reading
// headers() (the Stripe webhook reads stripe-signature that way) would never
// see the request's own headers. This file forwards them for its own calls.
const hg = globalThis as typeof globalThis & { __j3Headers?: Headers };
vi.mock("next/headers", () => {
  const empty = {
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
    forEach: () => undefined,
    entries: () => [][Symbol.iterator](),
    [Symbol.iterator]: () => [][Symbol.iterator](),
  };
  return {
    cookies: async () => empty,
    headers: async () => (globalThis as { __j3Headers?: Headers }).__j3Headers ?? new Headers(),
    draftMode: async () => ({ isEnabled: false }),
  };
});

const FAMILY = "J3";
const results: JevResult[] = [];
afterAll(() => recordResults(FAMILY, results));

const WEBHOOK_SECRET = "whsec_jev_fake_not_a_secret";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

function R(file: string) {
  return { file, route: "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "") };
}
const RT = {
  clients: R("app/api/clients/route.ts"),
  client: R("app/api/clients/[id]/route.ts"),
  clientSearch: R("app/api/clients/search/route.ts"),
  invites: R("app/api/team/invites/route.ts"),
  inspections: R("app/api/inspections/route.ts"),
  inspection: R("app/api/inspections/[id]/route.ts"),
  moisture: R("app/api/inspections/[id]/moisture/route.ts"),
  environmental: R("app/api/inspections/[id]/environmental/route.ts"),
  areas: R("app/api/inspections/[id]/affected-areas/route.ts"),
  classification: R("app/api/inspections/[id]/classification/route.ts"),
  scope: R("app/api/inspections/[id]/scope-items/route.ts"),
  submit: R("app/api/inspections/[id]/submit/route.ts"),
  costEstimates: R("app/api/inspections/[id]/cost-estimates/route.ts"),
  report: R("app/api/inspections/[id]/report/route.ts"),
  generateInvoice: R("app/api/inspections/[id]/generate-invoice/route.ts"),
  photos: R("app/api/inspections/[id]/photos/route.ts"),
  upload: R("app/api/upload/route.ts"),
  floorPlan: R("app/api/inspections/[id]/floor-plan/route.ts"),
  sketches: R("app/api/inspections/[id]/sketches/route.ts"),
  sketchEstimate: R("app/api/inspections/[id]/sketches/estimate/route.ts"),
  sketchPdf: R("app/api/inspections/[id]/sketches/pdf/route.ts"),
  sketchRender: R("app/api/inspections/[id]/sketches/render/route.ts"),
  propertyParse: R("app/api/property/parse/route.ts"),
  propertyScrape: R("app/api/properties/scrape/route.ts"),
  invoices: R("app/api/invoices/route.ts"),
  invoice: R("app/api/invoices/[id]/route.ts"),
  invoicePdf: R("app/api/invoices/[id]/pdf/route.ts"),
  invoiceSend: R("app/api/invoices/[id]/send/route.ts"),
  invoicePayments: R("app/api/invoices/[id]/payments/route.ts"),
  invoiceCheckout: R("app/api/invoices/[id]/checkout/route.ts"),
  invoiceSync: R("app/api/invoices/[id]/sync/route.ts"),
  stripeWebhook: R("app/api/webhooks/stripe/route.ts"),
};
const P = "tests/eval/jev/families/j3/planted-routes";
const PLANTED = {
  gst15: { file: `${P}/gst15.ts`, route: "/api/jev-planted/j3/invoices" },
  webhook: { file: `${P}/webhook-unsigned.ts`, route: "/api/jev-planted/j3/webhooks/stripe" },
  sketchZero: { file: `${P}/sketch-zero.ts`, route: "/api/jev-planted/j3/inspections/[id]/sketches/estimate" },
  clientLeak: { file: `${P}/client-leak.ts`, route: "/api/jev-planted/j3/clients" },
};

type Route = { file: string; route: string };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Oracle = (res: InvokeResult, json: Json | null) => (Check & { providerIndependent?: boolean }) | { inconclusive: string };

function parse(text: string): Json | null {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return null;
  }
}
function msg(json: Json | null, text: string): string {
  const e = json?.error;
  const m = typeof e === "string" ? e : (e?.message ?? json?.message ?? text);
  return String(m ?? "").slice(0, 160);
}
const is2xx = (s: number | null) => s !== null && s >= 200 && s < 300;
const is4xx = (s: number | null) => s !== null && s >= 400 && s < 500;
const near = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && Math.abs(a - b) <= tol;

/** Per-variant step runner. */
class Claim {
  state = new Map<string, JevState>();
  data: Json = {};
  /** Appended to every webhook row: the webhook invoice reaches SENT via the harness stand-in. */
  webhookNote = "";
  constructor(
    readonly w: J3World,
    readonly v: Variant,
  ) {}

  private push(step: string, area: JevArea, route: string, who: IdentityName, state: JevState | "OK" | "BAD", detail: string) {
    const id = `J3-${this.v.key}-${step}`;
    if (this.webhookNote && step.startsWith("payments.webhook-")) detail = `${detail}; ${this.webhookNote}`;
    let row: JevResult;
    if (state === "OK" || state === "BAD") row = { id, family: FAMILY, kind: "case", area, route, identity: who, ...classify(id, state === "OK", detail) };
    else row = { id, family: FAMILY, kind: "case", area, route, identity: who, state, detail };
    results.push(row);
    this.state.set(step, row.state === "KNOWN_GAP" ? "FAIL" : row.state);
    return row.state;
  }

  blocker(needs: string[]): string | null {
    for (const n of needs) if (this.state.get(n) !== "PASS") return n;
    return null;
  }

  /** One route call judged by an oracle. Returns the parsed body (or null). */
  async call(step: string, area: JevArea, rt: Route, method: Method, opts: InvokeOptions, oracle: Oracle, needs: string[] = [], who: IdentityName = "A_OWNER"): Promise<{ res: InvokeResult | null; json: Json | null }> {
    const routeLabel = `${method} ${rt.route}`;
    const b = this.blocker(needs);
    if (b) {
      this.push(step, area, routeLabel, who, "INCONCLUSIVE", `blocked by ${b}`);
      return { res: null, json: null };
    }
    asIdentity(sessionUser(this.w, who));
    takeBlocked();
    const res = await invokeRoute(rt, method, { timeoutMs: 30_000, ...opts });
    const blocked = takeBlocked();
    const json = parse(res.text);
    const outsider = !FIRM_A.includes(who);
    if (outsider && res.text.includes(this.w.markA)) {
      this.push(step, area, routeLabel, who, "BAD", `leak: firm A data returned to ${who} (status ${res.status})`);
      return { res, json };
    }
    if (res.status === null) {
      if (blocked.length) this.push(step, area, routeLabel, who, "INCONCLUSIVE", `needs provider ${blocked.join(",")}: ${res.error}`);
      else if (res.error?.startsWith("handler:")) this.push(step, area, routeLabel, who, "BAD", `unhandled exception, 500 in production: ${res.error}`);
      else this.push(step, area, routeLabel, who, "INCONCLUSIVE", res.error ?? "no status");
      return { res, json };
    }
    if (res.status >= 500) {
      if (blocked.length) this.push(step, area, routeLabel, who, "INCONCLUSIVE", `needs provider ${blocked.join(",")}: ${res.status} ${msg(json, res.text)}`);
      else this.push(step, area, routeLabel, who, "BAD", `server error ${res.status} with no outbound call: ${msg(json, res.text)}`);
      return { res, json };
    }
    const verdict = oracle(res, json);
    if ("inconclusive" in verdict) this.push(step, area, routeLabel, who, "INCONCLUSIVE", verdict.inconclusive);
    // A failed oracle after a refused outbound call cannot be told apart from the missing provider.
    // `providerIndependent` marks a failure the missing provider cannot explain (the same route answered it correctly elsewhere).
    else if (!verdict.ok && blocked.length && !(verdict as { providerIndependent?: boolean }).providerIndependent) this.push(step, area, routeLabel, who, "INCONCLUSIVE", `needs provider ${blocked.join(",")}: ${verdict.detail}`);
    else this.push(step, area, routeLabel, who, verdict.ok ? "OK" : "BAD", verdict.detail);
    return { res, json };
  }

  /** A check over data already returned by earlier steps (no route call). */
  check(step: string, area: JevArea, route: string, needs: string[], fn: () => Check) {
    const b = this.blocker(needs);
    if (b) return this.push(step, area, route, "A_OWNER", "INCONCLUSIVE", `blocked by ${b}`);
    const c = fn();
    return this.push(step, area, route, "A_OWNER", c.ok ? "OK" : "BAD", c.detail);
  }
}

/** Oracle helpers. */
const expectStatus =
  (want: number[], extra?: (json: Json | null, res: InvokeResult) => Check): Oracle =>
  (res, json) => {
    if (!want.includes(res.status as number)) return { ok: false, detail: `status ${res.status}, want ${want.join("/")}: ${msg(json, res.text)}` };
    return extra ? extra(json, res) : { ok: true, detail: String(res.status) };
  };
const expect4xx =
  (why: string): Oracle =>
  (res, json) =>
    is4xx(res.status) ? { ok: true, detail: `${res.status} ${msg(json, res.text)}` } : { ok: false, detail: `${why}: got ${res.status} ${msg(json, res.text)}` };

function sketchBody(v: Variant, extra: Json = {}) {
  const ppm = v.pxPerMetre;
  let x = 0;
  const objects = v.rooms.map((r, i) => {
    const pts = [
      { x, y: 0 },
      { x: x + r.lengthM * ppm, y: 0 },
      { x: x + r.lengthM * ppm, y: r.widthM * ppm },
      { x, y: r.widthM * ppm },
    ];
    x += r.lengthM * ppm + 50;
    const d = describeToolObject({ tool: "room", points: pts, text: r.name, pxPerMetre: ppm } as Parameters<typeof describeToolObject>[0]);
    if (!d) throw new Error("describeToolObject returned null for a room");
    const data: Json = { ...(d.data as Json), id: `room-${v.key}-${i}`, label: r.name };
    if (!v.sketchWithArea) {
      delete data.areaM2;
      delete data.lengthM;
      delete data.widthM;
    }
    return { type: "polygon", left: pts[0].x, top: 0, ...(d.props as Json), data };
  });
  return {
    floorNumber: 0,
    floorLabel: "Ground Floor",
    sketchType: "structural",
    country: "AU",
    sketchData: { version: "6.0.0", objects, scaleConfig: { pxPerMetre: ppm } },
    ...extra,
  };
}

function listingHtml(v: Variant, run: string) {
  const imgs = v.rooms.map((_, i) => `<img src="/media/${run}/${v.key}/floorplan-${i}.jpg" alt="Floor plan level ${i}">`).join("\n");
  const next = { props: { pageProps: { listing: { media: [{ type: "floorplan", url: `//cdn.jev.test/${v.key}/fp-next.jpg` }, { type: "photo", url: `//cdn.jev.test/${v.key}/kitchen.jpg` }] } } } };
  return {
    html: `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script></head><body>
<h1>1 J3 Street, Brisbane QLD 4000</h1><img src="/media/${run}/${v.key}/kitchen.jpg" alt="Kitchen">
${imgs}
</body></html>`,
    expected: [...v.rooms.map((_, i) => `https://www.onthehouse.com.au/media/${run}/${v.key}/floorplan-${i}.jpg`), `https://cdn.jev.test/${v.key}/fp-next.jpg`],
  };
}

function signStripe(payload: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}
function piEvent(w: J3World, v: Variant, inv: Json, amount: number, n: string) {
  const t = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    id: `evt_j3_${w.run}_${v.key}_${n}`,
    object: "event",
    type: "payment_intent.succeeded",
    created: t,
    livemode: false,
    api_version: "2026-05-27",
    data: {
      object: {
        id: `pi_j3_${w.run}_${v.key}`,
        object: "payment_intent",
        amount,
        amount_received: amount,
        currency: String(inv.currency ?? "AUD").toLowerCase(),
        status: "succeeded",
        latest_charge: `ch_j3_${w.run}_${v.key}`,
        created: t,
        metadata: { type: "invoice", invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, userId: w.users.A_OWNER.id },
      },
    },
  });
}

async function postWebhook(c: Claim, step: string, payload: string, sig: string | null, oracle: Oracle, needs: string[]) {
  hg.__j3Headers = new Headers(sig ? { "stripe-signature": sig, "content-type": "application/json" } : { "content-type": "application/json" });
  try {
    return await c.call(step, "payments", RT.stripeWebhook, "POST", { rawBody: payload, headers: sig ? { "stripe-signature": sig } : {} }, oracle, needs, "anon");
  } finally {
    hg.__j3Headers = undefined;
  }
}

async function getInvoice(c: Claim, id: string): Promise<Json | null> {
  asIdentity(sessionUser(c.w, "A_OWNER"));
  takeBlocked();
  const r = await invokeRoute(RT.invoice, "GET", { params: { id } });
  takeBlocked();
  return parse(r.text)?.invoice ?? null;
}

async function runClaim(w: J3World, v: Variant) {
  const c = new Claim(w, v);
  await resetRateLimits(w);
  const token = `J3${v.key}Q${w.run.replace(/[^a-z0-9]/gi, "")}`;
  const email = `${w.run}-${v.key}@jev.test`;
  const clientBody = { name: `Claimant ${token}`, email, phone: "0400111222", address: `${v.rooms.length} J3 Street, Brisbane QLD 4000`, company: `J3 Co ${v.key}`, notes: `Category ${v.category} class ${v.cls} claim` };

  // ── CRM ──────────────────────────────────────────────────────────────────
  const created = await c.call("crm.client-create", "crm", RT.clients, "POST", { body: clientBody }, expectStatus([200, 201], (j) => (j?.id && j.name === clientBody.name ? { ok: true, detail: `client ${j.id}` } : { ok: false, detail: `no client id/name in ${JSON.stringify(j).slice(0, 120)}` })));
  const clientId: string | undefined = created.json?.id ?? created.json?.client?.id;
  const cp = clientId ? { id: clientId } : {};
  await c.call("crm.client-get", "crm", RT.client, "GET", { params: cp }, expectStatus([200], (j) => (j?.email === email ? { ok: true, detail: "fetched" } : { ok: false, detail: `email ${j?.email}` })), ["crm.client-create"]);
  const updBody = { ...clientBody, phone: "0400999888", notes: `${clientBody.notes}; updated` };
  await c.call("crm.client-update", "crm", RT.client, "PUT", { params: cp, body: updBody }, expectStatus([200]), ["crm.client-create"]);
  await c.call("crm.client-update-persisted", "crm", RT.client, "GET", { params: cp }, expectStatus([200], (j) => (j?.phone === "0400999888" && String(j?.notes).endsWith("updated") ? { ok: true, detail: "update persisted" } : { ok: false, detail: `phone ${j?.phone} notes ${j?.notes}` })), ["crm.client-update"]);
  await c.call("crm.client-list", "crm", RT.clients, "GET", { query: `search=${token}&limit=100` }, expectStatus([200], (j) => {
    const ids = (j?.clients ?? []).map((x: Json) => x.id);
    return ids.includes(clientId) ? { ok: true, detail: `found in list of ${ids.length}` } : { ok: false, detail: `created client absent from list (${ids.length} rows)` };
  }), ["crm.client-create"]);
  await c.call("crm.client-list-excludes-firm-b", "crm", RT.clients, "GET", { query: "limit=100" }, expectStatus([200], (_j, res) => (res.text.includes(w.b.client) ? { ok: false, detail: "firm B client in firm A list" } : { ok: true, detail: "no firm B client" })));
  await c.call("crm.client-list-tenant", "crm", RT.clients, "GET", { query: `search=${token}&limit=100` }, (res) => tenantListOracle(res.text, clientId ? [clientId, w.a.client] : [w.a.client], w.markA), ["crm.client-create"], "B_OWNER");
  await c.call("crm.client-search", "crm", RT.clientSearch, "GET", { query: `q=${token}` }, expectStatus([200], (j) => {
    const ids = (j?.clients ?? []).map((x: Json) => x.id);
    return ids.includes(clientId) ? { ok: true, detail: `full-text search found client (${ids.length})` } : { ok: false, detail: `full-text search missed client (${ids.length} rows)` };
  }), ["crm.client-create"]);
  await c.call("crm.client-search-tenant", "crm", RT.clientSearch, "GET", { query: `q=${token}` }, (res) => tenantListOracle(res.text, clientId ? [clientId] : [], w.markA), ["crm.client-create"], "B_OWNER");
  await c.call("crm.client-duplicate-email", "crm", RT.clients, "POST", { body: clientBody }, expect4xx("duplicate email accepted"), ["crm.client-create"]);
  await c.call("crm.client-get-tenant", "crm", RT.client, "GET", { params: cp }, expect4xx("firm B fetched firm A client"), ["crm.client-create"], "B_OWNER");
  const inviteEmail = `${w.run}-${v.key}-mgr@jev.test`;
  const inv = await c.call(
    "crm.team-invite",
    "crm",
    RT.invites,
    "POST",
    { body: { email: inviteEmail, role: "MANAGER" }, headers: { origin: "http://localhost", host: "localhost", "idempotency-key": `j3-${v.key}-invite-0001` } },
    expectStatus([200, 201], (j) => (j?.invite?.id ? { ok: true, detail: "invite created and sent" } : { ok: false, detail: `no invite in ${JSON.stringify(j).slice(0, 120)}` })),
  );
  c.data.inviteRow = inv.json?.invite?.id ?? null;
  await c.call("crm.team-invite-listed", "crm", RT.invites, "GET", {}, expectStatus([200], (j) => ((j?.invites ?? []).some((x: Json) => x.email === inviteEmail) ? { ok: true, detail: "invite listed" } : { ok: false, detail: `invite for ${inviteEmail} not listed (POST status ${inv.res?.status})` })));

  // ── Claim flow ───────────────────────────────────────────────────────────
  const addr = `${v.rooms.length} J3 Street, Brisbane QLD`;
  const insp = await c.call(
    "flow.inspection-create",
    "flow",
    RT.inspections,
    "POST",
    { body: { propertyAddress: addr, propertyPostcode: "4000", clientId, claimType: "WATER", inspectionDate: "2026-10-20T09:00:00.000Z", technicianName: "A_TECH", lossDescription: WATER_SOURCE[v.category] }, headers: { "idempotency-key": `j3-${v.key}-inspection-0001` } },
    expectStatus([200, 201], (j) => (j?.inspection?.id && j.inspection.clientId === clientId ? { ok: true, detail: `inspection ${j.inspection.inspectionNumber}` } : { ok: false, detail: `inspection missing or not linked to client: ${JSON.stringify(j).slice(0, 160)}` })),
    ["crm.client-create"],
  );
  const iid: string | undefined = insp.json?.inspection?.id;
  const ip = iid ? { id: iid } : {};
  const F = ["flow.inspection-create"];
  await c.call("flow.inspection-get", "flow", RT.inspection, "GET", { params: ip }, expectStatus([200], (j) => (j?.inspection?.propertyAddress === addr ? { ok: true, detail: "fetched" } : { ok: false, detail: `address ${j?.inspection?.propertyAddress}` })), F);
  await c.call("flow.inspection-update", "flow", RT.inspection, "PATCH", { params: ip, body: { lossDescription: `${WATER_SOURCE[v.category]} (${v.key})` } }, expectStatus([200]), F);
  await c.call("flow.inspection-update-persisted", "flow", RT.inspection, "GET", { params: ip }, expectStatus([200], (j) => (j?.inspection?.lossDescription === `${WATER_SOURCE[v.category]} (${v.key})` ? { ok: true, detail: "persisted" } : { ok: false, detail: `lossDescription ${j?.inspection?.lossDescription}` })), ["flow.inspection-update"]);
  await c.call("flow.inspection-get-tenant", "flow", RT.inspection, "GET", { params: ip }, expect4xx("firm B fetched firm A inspection"), F, "B_OWNER");
  for (let r = 0; r < v.rooms.length; r++) {
    const room = v.rooms[r];
    await c.call(`flow.moisture-r${r}`, "flow", RT.moisture, "POST", { params: ip, body: { location: room.name, surfaceType: "Drywall", moistureLevel: v.moisture[r], depth: "Surface" } }, expectStatus([201, 200], (j) => (near(j?.moistureReading?.moistureLevel, v.moisture[r]) ? { ok: true, detail: `${v.moisture[r]}%` } : { ok: false, detail: `stored ${j?.moistureReading?.moistureLevel}` })), F);
    await c.call(`flow.affected-area-r${r}`, "flow", RT.areas, "POST", { params: ip, body: { roomZoneId: room.name, affectedAreaSqm: room.lengthM * room.widthM, waterSource: WATER_SOURCE[v.category], timeSinceLoss: 12 + v.category * 24, description: `${room.name} wet` } }, expectStatus([201, 200], (j) => (near(j?.affectedArea?.affectedAreaSqm, room.lengthM * room.widthM, 0.02) ? { ok: true, detail: `${room.lengthM * room.widthM} m2` } : { ok: false, detail: `stored ${j?.affectedArea?.affectedAreaSqm}` })), F);
  }
  await c.call("flow.moisture-invalid", "flow", RT.moisture, "POST", { params: ip, body: { location: "X", surfaceType: "Drywall", moistureLevel: 150, depth: "Surface" } }, expect4xx("moisture 150% accepted"), F);
  await c.call("flow.environmental", "flow", RT.environmental, "POST", { params: ip, body: { ambientTemperature: 18 + (v.cls % 4) * 3, humidityLevel: 55 + v.category * 10, dewPoint: 12.5, airCirculation: true, weatherConditions: "Overcast" } }, expectStatus([200, 201], (j) => (j?.environmentalData?.id ? { ok: true, detail: "stored" } : { ok: false, detail: "no environmentalData" })), F);
  await c.call("flow.environmental-invalid", "flow", RT.environmental, "POST", { params: ip, body: { ambientTemperature: 99, humidityLevel: 50 } }, expect4xx("99 C ambient accepted"), F);
  await c.call("flow.classification", "flow", RT.classification, "POST", { params: ip, body: { category: String(v.category), class: String(v.cls), justification: `IICRC S500 Category ${v.category} Class ${v.cls}: ${WATER_SOURCE[v.category]}`, standardReference: "IICRC S500:2021", confidence: 90 } }, expectStatus([201, 200]), F);
  await c.call("flow.classification-get", "flow", RT.classification, "GET", { params: ip }, expectStatus([200], (j) => {
    const cl = j?.classification;
    const wd = j?.waterDamageClassification;
    const ok = cl?.category === String(v.category) && cl?.class === String(v.cls) && wd?.waterCategory === `CAT_${v.category}` && wd?.damageClass === `CLASS_${v.cls}`;
    return { ok, detail: `classification ${cl?.category}/${cl?.class}, IICRC ${wd?.waterCategory}/${wd?.damageClass}, want ${v.category}/${v.cls}` };
  }), ["flow.classification"]);
  await c.call("flow.classification-invalid", "flow", RT.classification, "POST", { params: ip, body: { category: "4", class: "5" } }, expect4xx("category 4 / class 5 accepted"), F);
  for (let s = 0; s < v.scope.length; s++) {
    const it2 = v.scope[s];
    await c.call(`flow.scope-item-${s}`, "flow", RT.scope, "POST", { params: ip, body: { itemType: it2.itemType, description: `${it2.itemType} (${v.key})`, quantity: it2.quantity, unit: it2.unit, justification: `Category ${v.category} water, Class ${v.cls}` } }, expectStatus([201, 200], (j) => (j?.scopeItem?.id ? { ok: true, detail: it2.itemType } : { ok: false, detail: "no scopeItem" })), F);
  }

  // ── Photos ───────────────────────────────────────────────────────────────
  const photoForm = () => {
    const f = new FormData();
    f.append("file", new File([PNG], `${v.key}.png`, { type: "image/png" }));
    f.append("location", v.rooms[0].name);
    f.append("caption", `${v.key} damage`);
    return f;
  };
  await c.call("photos.upload", "photos", RT.photos, "POST", { params: ip, form: photoForm() }, expectStatus([201, 200], (j) => (j?.photo?.url ? { ok: true, detail: "stored" } : { ok: false, detail: "no photo url" })), F);
  const bad = new FormData();
  bad.append("file", new File([Buffer.from("not an image at all")], "fake.png", { type: "image/png" }));
  await c.call("photos.upload-not-image", "photos", RT.photos, "POST", { params: ip, form: bad }, expect4xx("non-image accepted"), F);
  const gen = new FormData();
  gen.append("file", new File([PNG], `${v.key}-g.png`, { type: "image/png" }));
  await c.call("photos.generic-upload", "photos", RT.upload, "POST", { form: gen }, expectStatus([200, 201], (j) => (j?.url ? { ok: true, detail: "uploaded" } : { ok: false, detail: "no url" })));
  await c.call("photos.list", "photos", RT.photos, "GET", { params: ip }, expectStatus([200], (j) => (Array.isArray(j?.photos) ? { ok: true, detail: `${j!.photos.length} photos` } : { ok: false, detail: "photos not an array" })), F);
  await c.call("photos.upload-tenant", "photos", RT.photos, "POST", { params: ip, form: photoForm() }, expect4xx("firm B uploaded to firm A inspection"), F, "B_OWNER");

  // Submit without photos must answer cleanly, not crash.
  const photoOk = c.state.get("photos.upload") === "PASS";
  if (photoOk) c.check("flow.submit-without-photos", "photos", `POST ${RT.submit.route}`, [], () => ({ ok: true, detail: "not applicable: a photo was stored" }));
  else
    await c.call("flow.submit-without-photos", "photos", RT.submit, "POST", { params: ip, body: {} }, (res, j) => (is4xx(res.status) && /PHOTO/i.test(res.text) ? { ok: true, detail: `${res.status} ${msg(j, res.text)}` } : { ok: false, detail: `want 4xx naming the missing photos, got ${res.status} ${msg(j, res.text)}` }), F);
  await c.call("flow.submit", "flow", RT.submit, "POST", { params: ip, body: {} }, expectStatus([200], (j) => ({ ok: j?.status === "SUBMITTED", detail: `status ${j?.status}` })), [...F, "photos.upload"]);

  // Estimate from the scope (moves a DRAFT inspection to ESTIMATED).
  const est = await c.call("flow.cost-estimate", "flow", RT.costEstimates, "POST", { params: ip, body: {} }, expectStatus([201, 200], (j) => {
    const s = j?.summary;
    const n = (j?.costEstimates ?? []).length;
    if (!s || !(s.total > 0) || n < 1) return { ok: false, detail: `lines ${n}, total ${s?.total}` };
    return { ok: Math.abs(s.subtotal + s.contingency - s.total) <= 0.02, detail: `lines ${n}, subtotal ${s.subtotal} + contingency ${s.contingency} = total ${s.total}` };
  }), F);
  c.check("flow.cost-estimate-lines", "flow", `POST ${RT.costEstimates.route}`, ["flow.cost-estimate"], () => {
    const items = (est.json?.costEstimates ?? []) as Json[];
    const sum = items.reduce((a, x) => a + Number(x.subtotal ?? 0), 0);
    const ok = Math.abs(sum - est.json!.summary.subtotal) <= 0.02 * Math.max(1, items.length);
    return { ok, detail: `sum of line subtotals ${sum.toFixed(2)} vs summary subtotal ${est.json!.summary.subtotal}` };
  });
  await c.call("flow.report-json", "flow", RT.report, "GET", { params: ip, query: "format=json" }, expectStatus([200], (j) => {
    const probs: string[] = [];
    if ((j?.affectedAreas ?? []).length !== v.rooms.length) probs.push(`affectedAreas ${(j?.affectedAreas ?? []).length}/${v.rooms.length}`);
    if ((j?.moistureReadings ?? []).length !== v.rooms.length) probs.push(`moistureReadings ${(j?.moistureReadings ?? []).length}/${v.rooms.length}`);
    if ((j?.environmentalData ?? []).length < 1) probs.push("no environmentalData");
    if (String(j?.classification?.category) !== String(v.category)) probs.push(`classification ${j?.classification?.category}`);
    if ((j?.scopeItems ?? []).length < v.scope.length) probs.push(`scopeItems ${(j?.scopeItems ?? []).length}/${v.scope.length}`);
    if (!j?.costEstimate || !near(j.costEstimate.total, est.json?.summary?.total ?? -1, 0.02)) probs.push(`costEstimate.total ${j?.costEstimate?.total} vs ${est.json?.summary?.total}`);
    if (!Array.isArray(j?.photos)) probs.push("photos not an array");
    return { ok: probs.length === 0, detail: probs.join("; ") || "report carries every captured section" };
  }), ["flow.cost-estimate"]);
  await c.call("flow.report-pdf", "flow", RT.report, "GET", { params: ip, query: "format=pdf" }, expectStatus([200], (_j, res) => (res.text.startsWith("%PDF") ? { ok: true, detail: `pdf ${res.text.length} chars` } : { ok: false, detail: `not a PDF: ${res.text.slice(0, 60)}` })), ["flow.cost-estimate"]);
  await c.call("flow.report-excel", "flow", RT.report, "GET", { params: ip, query: "format=excel" }, expectStatus([200], (_j, res) => (res.text.startsWith("PK") ? { ok: true, detail: "xlsx" } : { ok: false, detail: `not an xlsx: ${res.text.slice(0, 40)}` })), ["flow.cost-estimate"]);
  await c.call("flow.report-tenant", "flow", RT.report, "GET", { params: ip, query: "format=json" }, expect4xx("firm B read firm A report"), ["flow.cost-estimate"], "B_OWNER");
  await c.call("flow.generate-invoice", "payments", RT.generateInvoice, "POST", { params: ip, body: {}, headers: { "idempotency-key": `j3-${v.key}-geninv-0001` } }, expectStatus([200, 201], (j) => (j?.invoice?.id ? { ok: true, detail: `invoice ${j.invoice.invoiceNumber}` } : { ok: false, detail: "no invoice" })), ["flow.submit"]);

  // ── Floor plans / house plans ────────────────────────────────────────────
  const fpForm = new FormData();
  fpForm.append("file", new File([PNG], `${v.key}-plan.png`, { type: "image/png" }));
  await c.call("floorplans.floor-plan-upload", "floorplans", RT.floorPlan, "POST", { params: ip, form: fpForm }, expectStatus([200, 201], (j) => (j?.imageUrl ? { ok: true, detail: "stored" } : { ok: false, detail: "no imageUrl" })), F);
  await c.call("floorplans.floor-plan-foreign-url", "floorplans", RT.floorPlan, "PUT", { params: ip, body: { imageUrl: "https://evil.jev.test/plan.png" } }, expect4xx("non-Cloudinary floor plan URL accepted"), F);
  await c.call("floorplans.sketch-create", "floorplans", RT.sketches, "POST", { params: ip, body: sketchBody(v) }, expectStatus([201, 200], (j) => (j?.id ? { ok: true, detail: `sketch ${j.id}` } : { ok: false, detail: "no sketch id" })), F);
  await c.call("floorplans.sketch-rooms", "floorplans", RT.sketches, "GET", { params: ip }, expectStatus([200], (j) => {
    const rooms = (j?.sketches ?? []).flatMap((s: Json) => s.rooms ?? []);
    return { ok: rooms.length === v.rooms.length, detail: `${rooms.length} saved rooms, drew ${v.rooms.length}` };
  }), ["floorplans.sketch-create"]);
  await c.call("floorplans.sketch-estimate", "floorplans", RT.sketchEstimate, "GET", { params: ip }, (_res, j) => sketchEstimateOracle(j as never, v.rooms), ["floorplans.sketch-create"]);
  await c.call("floorplans.sketch-estimate-tenant", "floorplans", RT.sketchEstimate, "GET", { params: ip }, expect4xx("firm B read firm A sketch estimate"), ["floorplans.sketch-create"], "B_OWNER");
  const rend = await c.call("floorplans.sketch-canonical-render", "floorplans", RT.sketches, "POST", { params: ip, body: sketchBody(v, { requestCanonicalRender: true }) }, (res, j) => {
    if (!is2xx(res.status)) return { ok: false, detail: `save with render: ${res.status} ${msg(j, res.text)}` };
    const cr = j?._saveMeta?.canonicalRender;
    if (cr?.status === "stored") return { ok: true, detail: "verified render stored" };
    return { inconclusive: `needs provider supabase storage: canonical render ${cr?.status ?? "absent"} ${cr?.reason ?? ""}`.trim() };
  }, ["floorplans.sketch-create"]);
  void rend;
  await c.call("floorplans.sketch-pdf", "floorplans", RT.sketchPdf, "POST", { params: ip, body: { floors: [], propertyAddress: addr } }, expectStatus([200], (_j, res) => (res.text.startsWith("%PDF") ? { ok: true, detail: "floor-plan pdf" } : { ok: false, detail: "not a PDF" })), ["floorplans.sketch-canonical-render"]);
  await c.call("floorplans.sketch-render-retired", "floorplans", RT.sketchRender, "POST", { params: ip, body: {} }, (res, j) => (res.status === 409 && /retired/i.test(res.text) ? { ok: true, detail: "retired route answers 409; rendering is server-side on save" } : { ok: false, detail: `${res.status} ${msg(j, res.text)}` }), F);
  const listing = listingHtml(v, w.run);
  await c.call("floorplans.property-parse", "floorplans", RT.propertyParse, "POST", { body: { html: listing.html, sourceUrl: "https://www.onthehouse.com.au/property/qld/brisbane-4000/1-j3-street" } }, expectStatus([200], (j) => {
    const got: string[] = j?.property?.floorPlanImages ?? [];
    const missing = listing.expected.filter((u) => !got.includes(u));
    const extra = got.filter((u) => !listing.expected.includes(u));
    return { ok: missing.length === 0 && extra.length === 0, detail: `floorPlanImages ${got.length}/${listing.expected.length}${missing.length ? `, missing ${missing.join(" ")}` : ""}${extra.length ? `, unexpected ${extra.join(" ")}` : ""}` };
  }));
  await c.call("floorplans.property-parse-empty", "floorplans", RT.propertyParse, "POST", { body: { html: "", sourceUrl: "" } }, expect4xx("empty listing accepted"));
  await c.call("floorplans.property-scrape", "floorplans", RT.propertyScrape, "POST", { body: { url: `https://www.domain.com.au/1-j3-street-brisbane-qld-4000-${2019000000 + Number(v.key.slice(1))}` }, headers: { "idempotency-key": `j3-${v.key}-scrape-0001` } }, (res, j) => {
    // A 200 must carry a listing that was actually read: every real listing has an address.
    if (res.status === 200 && j?.data?.address && Array.isArray(j.data.floorPlanImages)) return { ok: true, detail: `${j.data.floorPlanImages.length} floor plan images` };
    // With no provider the honest answer is the 503 this route gives before its host breaker opens;
    // a 200 with an empty listing under the same conditions is the route's own defect.
    if (res.status === 200) return { ok: false, providerIndependent: true, detail: `200 with an empty listing (no address, ${(j?.data?.floorPlanImages ?? []).length} floor plans) although nothing was fetched: a failed read reported as success` };
    return { ok: false, detail: `${res.status} ${msg(j, res.text)}` };
  });

  // ── Payments ─────────────────────────────────────────────────────────────
  const invBody = (lines: InvoiceLine[]) => ({ customerName: clientBody.name, customerEmail: email, dueDate: "2026-11-20", clientId, lineItems: lines, notes: `J3 ${v.key}` });
  const i1 = await c.call("payments.invoice-create", "payments", RT.invoices, "POST", { body: invBody(v.lines) }, expectStatus([201, 200], (j) => (j?.invoice?.id ? { ok: true, detail: j.invoice.invoiceNumber } : { ok: false, detail: "no invoice" })), ["crm.client-create"]);
  const inv1: Json | null = i1.json?.invoice ?? null;
  const I1 = ["payments.invoice-create"];
  const ipp = inv1 ? { id: inv1.id } : {};
  c.check("payments.gst-create", "payments", `POST ${RT.invoices.route}`, I1, () => gstOracle(inv1 as never, v.lines));
  c.check("payments.line-count", "payments", `POST ${RT.invoices.route}`, I1, () => ({ ok: (inv1?.lineItems ?? []).length === v.lines.length, detail: `${(inv1?.lineItems ?? []).length}/${v.lines.length} lines` }));
  await c.call("payments.invoice-get", "payments", RT.invoice, "GET", { params: ipp }, expectStatus([200], (j) => gstOracle(j?.invoice, v.lines)), I1);
  const lines2 = v.lines.map((l, k) => (k === 0 ? { ...l, quantity: l.quantity + 1 } : l));
  const up = await c.call("payments.invoice-update", "payments", RT.invoice, "PUT", { params: ipp, body: { lineItems: lines2, notes: `J3 ${v.key} revised` } }, expectStatus([200]), I1);
  c.check("payments.gst-update", "payments", `PUT ${RT.invoice.route}`, ["payments.invoice-update"], () => gstOracle(up.json?.invoice, lines2));
  await c.call("payments.invoice-list", "payments", RT.invoices, "GET", { query: `search=${encodeURIComponent(inv1?.invoiceNumber ?? "none")}` }, expectStatus([200], (j) => ({ ok: (j?.invoices ?? []).some((x: Json) => x.id === inv1?.id), detail: `${(j?.invoices ?? []).length} rows` })), I1);
  await c.call("payments.invoice-list-tenant", "payments", RT.invoices, "GET", { query: "limit=100" }, (res) => tenantListOracle(res.text, inv1 ? [inv1.id] : [], w.markA), I1, "B_OWNER");
  await c.call("payments.invoice-pdf", "payments", RT.invoicePdf, "GET", { params: ipp }, expectStatus([200], (_j, res) => (res.text.startsWith("%PDF") ? { ok: true, detail: "pdf" } : { ok: false, detail: `not a PDF: ${res.text.slice(0, 60)}` })), I1);
  await c.call("payments.invoice-issue", "payments", RT.invoiceSend, "POST", { params: ipp, body: {} }, expectStatus([200], (j) => ({ ok: j?.success === true, detail: "sent" })), I1);
  let sentNote = "issued by send route";
  if (inv1 && c.state.get("payments.invoice-issue") !== "PASS") {
    sentNote = (await standInSend(inv1.id)) ? "invoice SENT by harness stand-in (send needs email provider)" : "stand-in could not mark SENT";
  }
  const total2 = (up.json?.invoice?.totalIncGST ?? inv1?.totalIncGST ?? 0) as number;
  const payAmt = v.pay === "partial" ? Math.max(1, Math.floor(total2 * 0.4)) : v.pay === "full" ? total2 : total2 + 1000;
  await c.call("payments.record-payment", "payments", RT.invoicePayments, "POST", { params: ipp, body: { amount: payAmt, paymentMethod: "BANK_TRANSFER", reference: `J3-${v.key}` } }, (res, j) => {
    if (v.pay === "over") return is4xx(res.status) ? { ok: true, detail: `overpayment refused ${res.status}; ${sentNote}` } : { ok: false, detail: `overpayment ${payAmt} on ${total2} answered ${res.status}; ${sentNote}` };
    return res.status === 201 || res.status === 200 ? { ok: true, detail: `${v.pay} ${payAmt}; ${sentNote}` } : { ok: false, detail: `${res.status} ${msg(j, res.text)}; ${sentNote}` };
  }, ["payments.invoice-update"]);
  await c.call("payments.record-payment-state", "payments", RT.invoice, "GET", { params: ipp }, expectStatus([200], (j) => {
    const x = j?.invoice ?? {};
    const paid = v.pay === "over" ? 0 : payAmt;
    const wantStatus = v.pay === "full" ? "PAID" : v.pay === "partial" ? "PARTIALLY_PAID" : "SENT";
    const g = gstOracle({ ...x, amountDue: x.amountDue }, lines2, paid);
    const ok = g.ok && x.amountPaid === paid && x.status === wantStatus;
    return { ok, detail: `status ${x.status} (want ${wantStatus}), paid ${x.amountPaid} (want ${paid}), due ${x.amountDue}; ${g.detail}; ${sentNote}` };
  }), ["payments.record-payment"]);
  await c.call("payments.record-payment-fractional", "payments", RT.invoicePayments, "POST", { params: ipp, body: { amount: 1.5, paymentMethod: "CASH" } }, expect4xx("fractional cents accepted"), I1);
  await c.call("payments.checkout-contained", "payments", RT.invoiceCheckout, "POST", { params: ipp, body: {} }, (res, j) => (res.status === 409 ? { ok: true, detail: `online pay contained by design: ${msg(j, res.text)}` } : { ok: false, detail: `${res.status} ${msg(j, res.text)}` }), I1);
  await c.call("payments.xero-sync", "payments", RT.invoiceSync, "POST", { params: ipp, body: { provider: "xero" } }, (res, j) => {
    if (is2xx(res.status)) return { ok: true, detail: "synced" };
    if (is4xx(res.status) && /integrat|connect|xero/i.test(res.text)) return { inconclusive: `needs provider xero: no connected integration (${res.status} ${msg(j, res.text)})` };
    return { ok: false, detail: `${res.status} ${msg(j, res.text)}` };
  }, I1);

  // Stripe webhook on a second invoice: guard first, then the subject.
  const i2 = await c.call("payments.webhook-invoice-create", "payments", RT.invoices, "POST", { body: invBody(v.lines) }, expectStatus([201, 200], (j) => (j?.invoice?.id ? { ok: true, detail: j.invoice.invoiceNumber } : { ok: false, detail: "no invoice" })), ["crm.client-create"]);
  let inv2: Json | null = i2.json?.invoice ?? null;
  const W = ["payments.webhook-invoice-create"];
  if (inv2) c.webhookNote = (await standInSend(inv2.id)) ? "webhook invoice SENT by harness stand-in (send needs email provider)" : "stand-in could not mark webhook invoice SENT";
  if (v.pay === "partial" && inv2) {
    await c.call("payments.webhook-prepay", "payments", RT.invoicePayments, "POST", { params: { id: inv2.id }, body: { amount: Math.floor(inv2.totalIncGST / 3), paymentMethod: "CASH" } }, expectStatus([201, 200]), W);
    W.push("payments.webhook-prepay");
  }
  if (inv2) inv2 = (await getInvoice(c, inv2.id)) ?? inv2;
  const due = (inv2?.amountDue ?? 0) as number;
  const payload = inv2 ? piEvent(w, v, inv2, due, "1") : "{}";
  const unchanged = async () => {
    const now = inv2 ? await getInvoice(c, inv2.id) : null;
    return now && now.amountDue === due && now.status !== "PAID";
  };
  await postWebhook(c, "payments.webhook-unsigned", payload, null, (res) => webhookRejectOracle(res.status), W);
  const noChange = async (step: string, after: string) => {
    const ok = c.blocker([...W, after]) ? false : await unchanged();
    c.check(step, "payments", `POST ${RT.stripeWebhook.route}`, [...W, after], () => ({ ok: !!ok, detail: ok ? "invoice untouched" : `invoice changed by ${after}` }));
  };
  await noChange("payments.webhook-unsigned-no-change", "payments.webhook-unsigned");
  await postWebhook(c, "payments.webhook-bad-signature", payload, signStripe(payload, "whsec_jev_wrong_fake_not_a_secret"), (res) => webhookRejectOracle(res.status), W);
  await noChange("payments.webhook-bad-signature-no-change", "payments.webhook-bad-signature");
  await postWebhook(c, "payments.webhook-signed", payload, signStripe(payload, WEBHOOK_SECRET), expectStatus([200]), W);
  await c.call("payments.webhook-paid", "payments", RT.invoice, "GET", { params: inv2 ? { id: inv2.id } : {} }, expectStatus([200], (j) => {
    const x = j?.invoice ?? {};
    const stripePays = (x.payments ?? []).filter((p: Json) => p.paymentMethod === "STRIPE");
    const ok = x.status === "PAID" && x.amountDue === 0 && x.amountPaid === x.totalIncGST && stripePays.length === 1 && stripePays[0].amount === due;
    return { ok, detail: `status ${x.status}, paid ${x.amountPaid}/${x.totalIncGST}, due ${x.amountDue}, stripe payments ${stripePays.length}` };
  }), ["payments.webhook-signed"]);
  await postWebhook(c, "payments.webhook-replay", payload, signStripe(payload, WEBHOOK_SECRET), expectStatus([200]), ["payments.webhook-signed"]);
  await c.call("payments.webhook-replay-no-double", "payments", RT.invoice, "GET", { params: inv2 ? { id: inv2.id } : {} }, expectStatus([200], (j) => {
    const x = j?.invoice ?? {};
    const n = (x.payments ?? []).filter((p: Json) => p.paymentMethod === "STRIPE").length;
    return { ok: n === 1 && x.amountPaid === x.totalIncGST, detail: `stripe payments ${n}, paid ${x.amountPaid}/${x.totalIncGST}` };
  }), ["payments.webhook-replay"]);
  void cents;
  return c;
}

// ── Controls: the same oracles aimed at planted defects ────────────────────
async function runControls(w: J3World) {
  const v = variants()[0];
  const ctrl = (id: string, route: string, state: JevState, detail: string) => results.push({ id, family: FAMILY, kind: "control", area: "flow", route, identity: "A_OWNER", state, detail });
  const verdict = (c: Check): JevState => (c.ok ? "PASS" : "FAIL");

  // 1. Invoice create at 15% GST.
  asIdentity(sessionUser(w, "A_OWNER"));
  let res = await invokeRoute(PLANTED.gst15, "POST", { body: { lineItems: v.lines } });
  let j = parse(res.text);
  const sub = v.lines.reduce((a, l) => a + cents(l.quantity * l.unitPrice), 0);
  const pre1 = j?.invoice?.gstAmount === Math.round(sub * 0.15) && j?.invoice?.gstAmount !== cents(sub * 0.1);
  if (!pre1) ctrl("J3-CTRL-gst15", `POST ${PLANTED.gst15.route}`, "INCONCLUSIVE", `precondition absent: planted GST not 15% (${res.status} ${res.text.slice(0, 80)})`);
  else {
    const c = gstOracle(j!.invoice, v.lines);
    ctrl("J3-CTRL-gst15", `POST ${PLANTED.gst15.route}`, verdict(c), c.detail);
  }

  // 2. Webhook that accepts an unsigned event.
  res = await invokeRoute(PLANTED.webhook, "POST", { rawBody: JSON.stringify({ id: "evt_planted", type: "payment_intent.succeeded" }) });
  const pre2 = is2xx(res.status);
  if (!pre2) ctrl("J3-CTRL-webhook-unsigned", `POST ${PLANTED.webhook.route}`, "INCONCLUSIVE", `precondition absent: planted webhook did not accept (${res.status})`);
  else {
    const c = webhookRejectOracle(res.status);
    ctrl("J3-CTRL-webhook-unsigned", `POST ${PLANTED.webhook.route}`, verdict(c), c.detail);
  }

  // 3. Sketch estimate returning no lines for the 3 x 3 m room.
  res = await invokeRoute(PLANTED.sketchZero, "GET", { params: { id: w.a.inspection } });
  j = parse(res.text);
  const pre3 = v.rooms.length === 1 && v.rooms[0].lengthM === 3 && v.rooms[0].widthM === 3 && Array.isArray(j?.estimate?.lineItems) && j!.estimate.lineItems.length === 0;
  if (!pre3) ctrl("J3-CTRL-sketch-zero", `GET ${PLANTED.sketchZero.route}`, "INCONCLUSIVE", "precondition absent: not a 3x3 room or planted estimate has lines");
  else {
    const c = sketchEstimateOracle(j as never, v.rooms);
    ctrl("J3-CTRL-sketch-zero", `GET ${PLANTED.sketchZero.route}`, verdict(c), c.detail);
  }

  // 4. Client list leaking firm A's client to firm B.
  asIdentity(sessionUser(w, "B_OWNER"));
  res = await invokeRoute(PLANTED.clientLeak, "GET", { query: `search=${w.markA}` });
  const pre4 = res.text.includes(w.a.client);
  if (!pre4) ctrl("J3-CTRL-client-leak", `GET ${PLANTED.clientLeak.route}`, "INCONCLUSIVE", `precondition absent: planted list did not return firm A client (${res.status})`);
  else {
    const c = tenantListOracle(res.text, [w.a.client], w.markA);
    ctrl("J3-CTRL-client-leak", `GET ${PLANTED.clientLeak.route}`, verdict(c), c.detail);
  }
}

describe.skipIf(!process.env.DATABASE_URL)("J3 claim lifecycle through real routes", () => {
  let w: J3World;
  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT = "1";
    w = await buildJ3World("j3");
  });

  it("controls: planted defects are caught by the step oracles", async () => {
    await runControls(w);
  });

  it("cases: every variant through every step", async () => {
    if (w.seedErrors.length) {
      results.push({ id: "J3-PRECOND-world", family: FAMILY, kind: "case", area: "flow", state: "INCONCLUSIVE", detail: `seed errors: ${w.seedErrors.join(" | ")}` });
    }
    const only = process.env.JEV_J3_VARIANTS ? Number(process.env.JEV_J3_VARIANTS) : Infinity;
    for (const v of variants().slice(0, only)) await runClaim(w, v);
  });
});
