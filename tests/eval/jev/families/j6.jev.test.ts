/**
 * J6 — photos through submit, classification, invoice and report, with an
 * in-memory stand-in for the photo store.
 *
 * J3 could not store a photo (Cloudinary is refused), so everything after it
 * read "blocked by photos.upload". J6 replaces ONLY the network half of the
 * Cloudinary SDK (cloudinary.v2.uploader.upload/destroy) and Cloudinary's
 * delivery for the fake cloud `jevfake` (see j6/standin.ts). lib/cloudinary.ts,
 * the storage provider, every route handler, the classification engine, the
 * estimate/approval/sign/invoice routes and both PDF builders run unchanged.
 *
 * Verdict rule (same as J3):
 *   - handler returned no status: refused host -> INCONCLUSIVE needs provider;
 *     a handler throw -> FAIL; import/timeout -> INCONCLUSIVE.
 *   - 5xx: refused host -> INCONCLUSIVE needs provider; none -> FAIL.
 *   - otherwise the step's oracle decides PASS or FAIL.
 *   - a step whose prerequisite is not PASS is INCONCLUSIVE "blocked by <step>".
 */
import sharp from "sharp";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { recordResults, classify, type JevArea, type JevResult, type JevState } from "../runner/record";
import { invokeRoute, type InvokeOptions, type InvokeResult, type Method } from "../runner/route-harness";
import { asIdentity, takeBlocked } from "../runner/setup";
import { sessionUser, type IdentityName } from "../runner/world";
import { buildJ3World, resetRateLimits, type J3World } from "./j3/world";
import { j6Variants, type J6Variant } from "./j6/variants";
import { classificationOracle, invoiceOracle, reportPhotosOracle, s500Expected, submitOracle, type Check } from "./j6/oracles";
import { installDelivery, isStandInUrl, objectFor, setMode, sha256, store } from "./j6/standin";

// The storage layer: only the SDK calls that would reach Cloudinary's servers.
vi.mock("cloudinary", async (importOriginal) => {
  const real = await importOriginal<Record<string, any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const s = await import("./j6/standin");
  const base = real.v2 ?? real.default?.v2;
  const refuse = () => {
    throw new Error("JEV stand-in: this Cloudinary SDK call is not stood in");
  };
  const v2 = { ...base, uploader: { ...base.uploader, upload: s.standInUpload, destroy: s.standInDestroy, upload_stream: refuse }, api: { ...base.api, delete_resources_by_tag: refuse, resources_by_tag: refuse } };
  return { ...real, v2, default: { ...(real.default ?? real), v2 } };
});

const FAMILY = "J6";
const results: JevResult[] = [];
let restoreFetch: (() => void) | null = null;
afterAll(() => {
  restoreFetch?.();
  recordResults(FAMILY, results);
});

const PHOTO = { width: 13, height: 11 };
const PLAN = { width: 17, height: 9 };
const IMG: { png: Buffer; jpg: Buffer; plan: Buffer } = { png: Buffer.alloc(0), jpg: Buffer.alloc(0), plan: Buffer.alloc(0) };

function R(file: string) {
  return { file, route: "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "") };
}
const RT = {
  clients: R("app/api/clients/route.ts"),
  inspections: R("app/api/inspections/route.ts"),
  inspection: R("app/api/inspections/[id]/route.ts"),
  moisture: R("app/api/inspections/[id]/moisture/route.ts"),
  environmental: R("app/api/inspections/[id]/environmental/route.ts"),
  makeSafe: R("app/api/inspections/[id]/make-safe/route.ts"),
  areas: R("app/api/inspections/[id]/affected-areas/route.ts"),
  classification: R("app/api/inspections/[id]/classification/route.ts"),
  submit: R("app/api/inspections/[id]/submit/route.ts"),
  sign: R("app/api/inspections/[id]/sign/route.ts"),
  costEstimates: R("app/api/inspections/[id]/cost-estimates/route.ts"),
  nirReport: R("app/api/inspections/[id]/report/route.ts"),
  generateInvoice: R("app/api/inspections/[id]/generate-invoice/route.ts"),
  photos: R("app/api/inspections/[id]/photos/route.ts"),
  upload: R("app/api/upload/route.ts"),
  floorPlan: R("app/api/inspections/[id]/floor-plan/route.ts"),
  estimates: R("app/api/estimates/route.ts"),
  estimateStatus: R("app/api/estimates/[id]/status/route.ts"),
  approvals: R("app/api/reports/[id]/approvals/route.ts"),
  approvalRespond: R("app/api/reports/[id]/approvals/[approvalId]/respond/route.ts"),
  reportPdf: R("app/api/reports/[id]/pdf/route.ts"),
  invoice: R("app/api/invoices/[id]/route.ts"),
};
const P = "tests/eval/jev/families/j6/planted-routes";
const PLANTED = {
  gst15: { file: `${P}/gst15-invoice.ts`, route: "/api/jev-planted/j6/inspections/[id]/generate-invoice" },
  classify: { file: `${P}/classify-ignores-category.ts`, route: "/api/jev-planted/j6/classify" },
  submit: { file: `${P}/submit-zero-photos.ts`, route: "/api/jev-planted/j6/inspections/[id]/submit" },
};

type Route = { file: string; route: string };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Oracle = (res: InvokeResult, json: Json | null) => Check | { inconclusive: string } | Promise<Check | { inconclusive: string }>;

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
const is4xx = (s: number | null) => s !== null && s >= 400 && s < 500;

async function quietGet(w: J3World, rt: Route, params: Record<string, string>, query?: string): Promise<{ status: number | null; json: Json | null; text: string }> {
  asIdentity(sessionUser(w, "A_OWNER"));
  takeBlocked();
  const r = await invokeRoute(rt, "GET", { params, query, timeoutMs: 30_000 });
  takeBlocked();
  return { status: r.status, json: parse(r.text), text: r.text };
}

class Claim {
  state = new Map<string, JevState>();
  constructor(
    readonly w: J3World,
    readonly v: J6Variant,
  ) {}

  private push(step: string, area: JevArea, route: string, who: IdentityName, state: JevState | "OK" | "BAD", detail: string) {
    const id = `J6-${this.v.key}-${step}`;
    const row: JevResult =
      state === "OK" || state === "BAD"
        ? { id, family: FAMILY, kind: "case", area, route, identity: who, ...classify(id, state === "OK", detail) }
        : { id, family: FAMILY, kind: "case", area, route, identity: who, state, detail };
    results.push(row);
    this.state.set(step, row.state === "KNOWN_GAP" ? "FAIL" : row.state);
    return row.state;
  }

  blocker(needs: string[]): string | null {
    for (const n of needs) if (this.state.get(n) !== "PASS") return n;
    return null;
  }

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
    const verdict = await oracle(res, json);
    const extra = takeBlocked(); // calls the oracle made (read-backs)
    const all = [...new Set([...blocked, ...extra])];
    if ("inconclusive" in verdict) this.push(step, area, routeLabel, who, "INCONCLUSIVE", verdict.inconclusive);
    else if (!verdict.ok && all.length) this.push(step, area, routeLabel, who, "INCONCLUSIVE", `needs provider ${all.join(",")}: ${verdict.detail}`);
    else this.push(step, area, routeLabel, who, verdict.ok ? "OK" : "BAD", verdict.detail + (all.length ? ` (refused hosts during step: ${all.join(",")})` : ""));
    return { res, json };
  }
}

const expectStatus =
  (want: number[], extra?: (json: Json | null, res: InvokeResult) => Check | Promise<Check>): Oracle =>
  (res, json) => {
    if (!want.includes(res.status as number)) return { ok: false, detail: `status ${res.status}, want ${want.join("/")}: ${msg(json, res.text)}` };
    return extra ? extra(json, res) : { ok: true, detail: String(res.status) };
  };

function fileForm(bytes: Buffer, name: string, type: string, fields: Record<string, string> = {}): FormData {
  const f = new FormData();
  f.append("file", new File([new Uint8Array(bytes)], name, { type }));
  for (const [k, val] of Object.entries(fields)) f.append(k, val);
  return f;
}

/** The stand-in holds exactly these bytes behind this URL. */
function storedCheck(url: unknown, bytes: Buffer): Check {
  if (typeof url !== "string" || !isStandInUrl(url)) return { ok: false, detail: `url ${String(url).slice(0, 100)} is not a stand-in store URL` };
  const o = objectFor(url);
  if (!o) return { ok: false, detail: `stand-in has no object for ${url}` };
  if (o.sha256 !== sha256(bytes)) return { ok: false, detail: `stored sha ${o.sha256.slice(0, 12)} != uploaded ${sha256(bytes).slice(0, 12)}` };
  return { ok: true, detail: `stored ${o.publicId} (${bytes.length} B, sha ${o.sha256.slice(0, 12)})` };
}

async function runClaim(w: J3World, v: J6Variant) {
  const c = new Claim(w, v);
  await resetRateLimits(w);
  const tag = `${w.run}-${v.key}`;
  const key = (s: string) => `j6-${tag}-${s}`;
  const email = `${tag}@jev.test`;
  const room0 = v.areas[0].room;
  const caption = `${v.key} ${room0} water damage`;
  const photoBytes = v.photoFormat === "png" ? IMG.png : IMG.jpg;
  const photoMime = v.photoFormat === "png" ? "image/png" : "image/jpeg";

  // ── Claim set-up (prerequisites) ─────────────────────────────────────────
  const cl = await c.call("client-create", "flow", RT.clients, "POST", { body: { name: `Claimant J6 ${tag}`, email, phone: "0400111222", address: `${v.key} J6 Street, Brisbane QLD 4000` } }, expectStatus([200, 201], (j) => (j?.id ? { ok: true, detail: `client ${j.id}` } : { ok: false, detail: `no client id: ${JSON.stringify(j).slice(0, 120)}` })));
  const clientId: string | undefined = cl.json?.id ?? cl.json?.client?.id;
  const addr = `${v.rooms.length} J6 Street ${v.key}, Brisbane QLD`;
  const insp = await c.call(
    "inspection-create",
    "flow",
    RT.inspections,
    "POST",
    { body: { propertyAddress: addr, propertyPostcode: "4000", clientId, claimType: "WATER", inspectionDate: "2026-10-20T09:00:00.000Z", technicianName: "A_TECH", lossDescription: v.areas[0].waterSource }, headers: { "idempotency-key": key("inspection") } },
    expectStatus([200, 201], (j) => (j?.inspection?.id && j.inspection.reportId ? { ok: true, detail: `inspection ${j.inspection.inspectionNumber}, report ${j.inspection.reportId}` } : { ok: false, detail: `inspection or linked report missing: ${JSON.stringify(j).slice(0, 160)}` })),
    ["client-create"],
  );
  const iid: string = insp.json?.inspection?.id ?? "none";
  const reportId: string = insp.json?.inspection?.reportId ?? "none";
  const ip = { id: iid };
  const F = ["inspection-create"];
  const site: string[] = [...F];
  for (let r = 0; r < v.areas.length; r++) {
    const a = v.areas[r];
    await c.call(`moisture-r${r}`, "flow", RT.moisture, "POST", { params: ip, body: { location: a.room, surfaceType: a.surfaceType, moistureLevel: a.moisture, depth: "Surface" } }, expectStatus([200, 201]), F);
    await c.call(`affected-area-r${r}`, "flow", RT.areas, "POST", { params: ip, body: { roomZoneId: a.room, affectedAreaSqm: a.areaSqm, waterSource: a.waterSource, timeSinceLoss: a.timeSinceLoss, description: `${a.room} wet` } }, expectStatus([200, 201]), F);
    site.push(`moisture-r${r}`, `affected-area-r${r}`);
  }
  await c.call("environmental", "flow", RT.environmental, "POST", { params: ip, body: { ambientTemperature: 21, humidityLevel: 65, dewPoint: 14.2, airCirculation: true, weatherConditions: "Overcast" } }, expectStatus([200, 201]), F);
  site.push("environmental");
  // Stabilisation (make-safe) checklist: water stopped and occupants briefed, the rest not applicable.
  for (const action of ["water_stopped", "occupant_briefing", "power_isolated", "gas_isolated", "mould_containment"]) {
    const done = action === "water_stopped" || action === "occupant_briefing";
    await c.call(`make-safe-${action}`, "flow", RT.makeSafe, "POST", { params: ip, body: { action, applicable: done, completed: done, notes: done ? "Done on arrival (J6)" : "Not applicable (J6)" }, headers: { "idempotency-key": key(`make-safe-${action}`) } }, expectStatus([200, 201]), F);
    site.push(`make-safe-${action}`);
  }

  // Submitting before any photo must be refused, naming the photos.
  await c.call("submit-refused-without-photos", "flow", RT.submit, "POST", { params: ip, body: {}, headers: { "idempotency-key": key("submit-early") } }, (res, j) => (is4xx(res.status) && /PHOTO/i.test(res.text) ? { ok: true, detail: `${res.status} ${msg(j, res.text)}` } : { ok: false, detail: `want 4xx naming the missing photo, got ${res.status} ${msg(j, res.text)}` }), site);

  // ── Photos ───────────────────────────────────────────────────────────────
  const up = await c.call(
    "photo-upload",
    "photos",
    RT.photos,
    "POST",
    { params: ip, form: fileForm(photoBytes, `${v.key}.${v.photoFormat}`, photoMime, { location: room0, caption }), headers: { "idempotency-key": key("photo") } },
    expectStatus([200, 201], (j) => {
      if (!j?.photo?.id) return { ok: false, detail: `no photo in ${JSON.stringify(j).slice(0, 120)}` };
      const s = storedCheck(j.photo.url, photoBytes);
      return s.ok ? { ok: true, detail: `photo ${j.photo.id}: ${s.detail}` } : s;
    }),
    F,
  );
  const photo: Json | null = up.json?.photo ?? null;
  await c.call("photo-listed", "photos", RT.photos, "GET", { params: ip }, expectStatus([200], (j) => {
    const p = (j?.photos ?? []).find((x: Json) => x.id === photo?.id);
    if (!p) return { ok: false, detail: `uploaded photo absent from list of ${(j?.photos ?? []).length}` };
    const ok = p.location === room0 && p.description === caption && p.url === photo?.url;
    return { ok, detail: `listed: location ${p.location} (want ${room0}), description ${p.description}, url ${p.url === photo?.url ? "same" : p.url}` };
  }), ["photo-upload"]);
  await c.call("generic-upload", "photos", RT.upload, "POST", { form: fileForm(photoBytes, `${v.key}-g.${v.photoFormat}`, photoMime) }, expectStatus([200], (j) => storedCheck(j?.url, photoBytes)));

  // ── Floor plan ───────────────────────────────────────────────────────────
  const fp = await c.call("floorplan-upload", "floorplans", RT.floorPlan, "POST", { params: ip, form: fileForm(IMG.plan, `${v.key}-plan.png`, "image/png") }, expectStatus([200, 201], (j) => storedCheck(j?.imageUrl, IMG.plan)), F);
  await c.call("floorplan-persisted", "floorplans", RT.inspection, "GET", { params: ip }, expectStatus([200], (j) => ({ ok: !!fp.json?.imageUrl && j?.inspection?.floorPlanImageUrl === fp.json.imageUrl, detail: `floorPlanImageUrl ${j?.inspection?.floorPlanImageUrl === fp.json?.imageUrl ? "is the uploaded plan" : j?.inspection?.floorPlanImageUrl}` })), ["floorplan-upload"]);

  // ── Submit (classification, scope and cost estimate run inside it) ────────
  await c.call("submit", "flow", RT.submit, "POST", { params: ip, body: {}, headers: { "idempotency-key": key("submit") } }, async (res, j) => {
    const persisted = (await quietGet(w, RT.inspection, ip)).json?.inspection ?? null;
    const photos = (await quietGet(w, RT.photos, ip)).json?.photos ?? [];
    return submitOracle(res.status, j, persisted, photos.length);
  }, [...site, "photo-upload"]);
  const S = ["submit"];
  await c.call("classification", "flow", RT.classification, "GET", { params: ip }, expectStatus([200], (j) => classificationOracle(j?.classification, v.areas)), S);
  const ce = await c.call("submit-priced", "flow", RT.costEstimates, "GET", { params: ip }, expectStatus([200], (j) => {
    // lib/estimate-lines.ts: contingency is its own row (subtotal 0, contingency N, total N),
    // so every row's total = subtotal + contingency and only work rows carry a subtotal.
    const rows: Json[] = j?.costEstimates ?? [];
    const work = rows.filter((r) => !(Number(r.contingency) > 0));
    const unpriced = work.filter((r) => !(Number(r.subtotal) > 0));
    const off = rows.filter((r) => Math.abs(Number(r.subtotal) + Number(r.contingency ?? 0) - Number(r.total)) > 0.011);
    const ok = work.length > 0 && unpriced.length === 0 && off.length === 0;
    return { ok, detail: `${rows.length} cost rows from submit (${work.length} work, ${rows.length - work.length} contingency), ${unpriced.length} unpriced work rows, ${off.length} rows where total != subtotal + contingency, grand total ${rows.reduce((a, r) => a + Number(r.total ?? 0), 0).toFixed(2)}` };
  }), S);
  const costRows: Json[] = ce.json?.costEstimates ?? [];

  // ── Estimate -> client approval -> sign -> invoice ───────────────────────
  // What an estimator does with the claim's priced scope: each work row becomes an estimate line;
  // the contingency row becomes the estimate's contingency (invoiced as its own "Contingency" line).
  const workRows = costRows.filter((r) => !(Number(r.contingency) > 0));
  const contingency = Math.round(costRows.reduce((a, r) => a + Number(r.contingency ?? 0), 0) * 100) / 100;
  const lines = workRows.map((r, k) => ({ category: r.category ?? "Labour", description: String(r.description ?? `line ${k}`), qty: Number(r.quantity ?? 1), unit: r.unit ?? "item", rate: Number(r.rate ?? 0), subtotal: Number(r.subtotal ?? 0), displayOrder: k }));
  const expectedInvoice = [...lines.map((l) => ({ description: l.description, subtotal: l.subtotal })), ...(contingency > 0 ? [{ description: "Contingency", subtotal: contingency }] : [])];
  const lineCents = expectedInvoice.map((l) => Math.round(Number(l.subtotal.toFixed(2)) * 100));
  const subC = lineCents.reduce((a, x) => a + x, 0);
  const gstC = lineCents.reduce((a, x) => a + Math.round(x * 0.1), 0);
  const totals = { subtotalExGST: subC / 100, gst: gstC / 100, totalIncGST: (subC + gstC) / 100, contingency };
  const est = await c.call("estimate-create", "payments", RT.estimates, "POST", { body: { reportId, lineItems: lines, ...totals }, headers: { "idempotency-key": key("estimate") } }, expectStatus([200, 201], (j) => ({ ok: !!j?.id && (j.lineItems ?? []).length === lines.length, detail: `estimate ${j?.id} with ${(j?.lineItems ?? []).length}/${lines.length} lines, total ${j?.totals?.totalIncGST}` })), ["submit-priced"]);
  const eid: string = est.json?.id ?? "none";
  const E: string[] = ["estimate-create"];
  for (const st of ["INTERNAL_REVIEW", "SENT", "CLIENT_REVIEW"] as const) {
    const step = `estimate-${st.toLowerCase().replace("_", "-")}`;
    await c.call(step, "payments", RT.estimateStatus, "PATCH", { params: { id: eid }, body: { status: st } }, expectStatus([200]), [...E]);
    E.push(step);
  }
  const ap = await c.call("approval-request", "payments", RT.approvals, "POST", { params: { id: reportId }, body: { approvalType: "COST_ESTIMATE", amount: est.json?.totals?.totalIncGST ?? totals.totalIncGST }, headers: { "idempotency-key": key("approval") } }, expectStatus([201, 200], (j) => ({ ok: !!j?.approval?.id, detail: `approval ${j?.approval?.id} ${j?.approval?.status}` })), [...E]);
  await c.call("approval-recorded", "payments", RT.approvalRespond, "POST", { params: { id: reportId, approvalId: ap.json?.approval?.id ?? "none" }, body: { status: "APPROVED", clientComments: "Approved by phone (J6)" }, headers: { "idempotency-key": key("approval-respond") } }, expectStatus([200], (j) => ({ ok: j?.approval?.status === "APPROVED" && !!j.approval.respondedAt, detail: `approval ${j?.approval?.status}` })), ["approval-request"]);
  await c.call("estimate-approved", "payments", RT.estimateStatus, "PATCH", { params: { id: eid }, body: { status: "APPROVED" } }, expectStatus([200]), ["approval-recorded"]);
  await c.call("sign", "flow", RT.sign, "POST", { params: ip, body: { signatoryName: `Lead Tech ${v.key}`, role: "Site Supervisor" }, headers: { "idempotency-key": key("sign") } }, expectStatus([200], (j) => ({ ok: !!j?.signedAt, detail: `signedAt ${j?.signedAt}, status ${j?.status}` })), S);
  // The NIR report reads review-ready statuses only (SUBMITTED / ESTIMATED / COMPLETED), so it is taken before billing.
  await c.call("report-json-photos", "photos", RT.nirReport, "GET", { params: ip, query: "format=json" }, expectStatus([200], (j) => {
    const ps: Json[] = j?.photos ?? [];
    const hit = ps.find((p) => p.url === photo?.url);
    return { ok: !!hit && hit.location === room0, detail: `${ps.length} photo(s) in report JSON; uploaded url ${hit ? "present" : "absent"}, location ${hit?.location}` };
  }), ["photo-upload", "submit"]);
  await c.call("nir-pdf-photos", "photos", RT.nirReport, "GET", { params: ip, query: "format=pdf" }, (res) => reportPhotosOracle(res.status, res.text, PHOTO.width, PHOTO.height), ["photo-upload", "submit"]);
  let invoiceId: string | null = null;
  await c.call("invoice-from-claim", "payments", RT.generateInvoice, "POST", { params: ip, body: {}, headers: { "idempotency-key": key("invoice") } }, async (res, j) => {
    if (res.status !== 201 && res.status !== 200) return { ok: false, detail: `status ${res.status}: ${msg(j, res.text)}${j?.missing ? ` missing ${JSON.stringify(j.missing)}` : ""}` };
    invoiceId = j?.invoiceId ?? null;
    if (!invoiceId) return { ok: false, detail: `no invoiceId: ${res.text.slice(0, 120)}` };
    const inv = (await quietGet(w, RT.invoice, { id: invoiceId })).json?.invoice;
    const o = invoiceOracle(inv, expectedInvoice);
    return { ok: o.ok, detail: `${j?.invoiceNumber}: ${o.detail}` };
  }, ["estimate-approved", "sign"]);

  // ── Reports with the photo ───────────────────────────────────────────────
  const before = store().deliveries;
  await c.call("report-photos", "photos", RT.reportPdf, "GET", { params: { id: reportId } }, (res) => {
    const o = reportPhotosOracle(res.status, res.text, PHOTO.width, PHOTO.height);
    return { ok: o.ok, detail: `${o.detail}; stand-in deliveries ${store().deliveries - before}` };
  }, ["photo-upload", "inspection-create"]);
  await c.call("report-after-invoice", "flow", RT.nirReport, "GET", { params: ip, query: "format=json" }, expectStatus([200], (j) => ({ ok: Array.isArray(j?.photos) && j.photos.some((p: Json) => p.url === photo?.url), detail: `invoiced claim's NIR report answered with ${(j?.photos ?? []).length} photo(s), status ${j?.inspection?.status}` })), ["invoice-from-claim"]);
  return c;
}

// ── Controls: the same oracles aimed at planted defects ────────────────────
async function runControls(w: J3World) {
  const vs = j6Variants();
  const ctrl = (id: string, area: JevArea, route: string, state: JevState, detail: string) => results.push({ id, family: FAMILY, kind: "control", area, route, identity: "A_OWNER", state, detail });
  const verdict = (c: Check): JevState => (c.ok ? "PASS" : "FAIL");
  const call = async (rt: Route, method: Method, opts: InvokeOptions) => {
    asIdentity(sessionUser(w, "A_OWNER"));
    takeBlocked();
    const r = await invokeRoute(rt, method, { timeoutMs: 30_000, ...opts });
    return { ...r, json: parse(r.text), blocked: takeBlocked() };
  };
  const freshInspection = async (tag: string) => {
    const cl = await call(RT.clients, "POST", { body: { name: `Control ${tag} ${w.run}`, email: `${w.run}-ctrl-${tag}@jev.test` } });
    const clientId = cl.json?.id ?? cl.json?.client?.id;
    const ins = await call(RT.inspections, "POST", { body: { propertyAddress: `9 Control ${tag} St, Brisbane QLD`, propertyPostcode: "4000", clientId, claimType: "WATER", inspectionDate: "2026-10-20T09:00:00.000Z" }, headers: { "idempotency-key": `j6-${w.run}-ctrl-${tag}` } });
    return ins.json?.inspection as Json | undefined;
  };
  await resetRateLimits(w);

  // 1. A store that drops the bytes: the upload "succeeds", the report must not show the photo.
  {
    const id = "J6-CTRL-store-drops-bytes";
    const route = `GET ${RT.reportPdf.route}`;
    setMode("drop");
    try {
      const ins = await freshInspection("drop");
      const up = ins ? await call(RT.photos, "POST", { params: { id: ins.id }, form: fileForm(IMG.png, "drop.png", "image/png", { location: "Lounge" }), headers: { "idempotency-key": `j6-${w.run}-ctrl-drop-photo` } }) : null;
      const url: string | undefined = up?.json?.photo?.url;
      const listed = ins ? ((await quietGet(w, RT.photos, { id: ins.id })).json?.photos ?? []).length : 0;
      const fetched = url ? await fetch(url) : null;
      const pdf = ins?.reportId ? await call(RT.reportPdf, "GET", { params: { id: ins.reportId } }) : null;
      const pre = !!up && up.status === 201 && listed === 1 && fetched?.status === 404 && store().objects.get(objectFor(url)?.publicId ?? "")?.dropped === true && pdf?.status === 200;
      if (!pre) ctrl(id, "photos", route, "INCONCLUSIVE", `precondition absent: upload ${up?.status}, listed ${listed}, delivery ${fetched?.status}, pdf ${pdf?.status} ${pdf?.error ?? ""}`);
      else {
        const o = reportPhotosOracle(pdf!.status, pdf!.text, PHOTO.width, PHOTO.height);
        ctrl(id, "photos", route, verdict(o), `bytes dropped behind ${url}: ${o.detail}`);
      }
    } finally {
      setMode("keep");
    }
  }

  // 2. Invoice from the claim at 15% GST.
  {
    const id = "J6-CTRL-invoice-gst15";
    const lines = [
      { description: "Extract standing water", subtotal: 123.45 },
      { description: "Air movers x 3 days", subtotal: 99.99 },
      { description: "Dehumidifier x 3 days", subtotal: 45.5 },
    ];
    const r = await call(PLANTED.gst15, "POST", { params: { id: "planted" }, body: { lines } });
    const inv = r.json?.invoice;
    const sub = lines.reduce((a, l) => a + Math.round(l.subtotal * 100), 0);
    const pre = inv && inv.gstAmount === Math.round(sub * 0.15) && inv.gstAmount !== Math.round(sub * 0.1);
    if (!pre) ctrl(id, "payments", `POST ${PLANTED.gst15.route}`, "INCONCLUSIVE", `precondition absent: planted GST not 15% (${r.status} ${r.text.slice(0, 80)})`);
    else {
      const o = invoiceOracle(inv, lines);
      ctrl(id, "payments", `POST ${PLANTED.gst15.route}`, verdict(o), o.detail);
    }
  }

  // 3. A classifier that ignores the water category, on a sewage claim.
  {
    const id = "J6-CTRL-classify-ignores-category";
    const v = vs.find((x) => x.category === 3)!;
    const r = await call(PLANTED.classify, "POST", { body: { areas: v.areas } });
    const pre = s500Expected(v.areas).category === "3" && r.json?.classification?.category === "1";
    if (!pre) ctrl(id, "flow", `POST ${PLANTED.classify.route}`, "INCONCLUSIVE", `precondition absent: input not Category 3 or planted did not store 1 (${r.text.slice(0, 80)})`);
    else {
      const o = classificationOracle(r.json!.classification, v.areas);
      ctrl(id, "flow", `POST ${PLANTED.classify.route}`, verdict(o), o.detail);
    }
  }

  // 4. A submit handler that marks SUBMITTED with zero photos.
  {
    const id = "J6-CTRL-submit-zero-photos";
    const route = `POST ${PLANTED.submit.route}`;
    const ins = await freshInspection("submit0");
    const photos = ins ? ((await quietGet(w, RT.photos, { id: ins.id })).json?.photos ?? null) : null;
    const r = ins ? await call(PLANTED.submit, "POST", { params: { id: ins.id }, body: {} }) : null;
    const persisted = ins ? (await quietGet(w, RT.inspection, { id: ins.id })).json?.inspection : null;
    const pre = Array.isArray(photos) && photos.length === 0 && r?.status === 200 && persisted?.status === "SUBMITTED";
    if (!pre) ctrl(id, "flow", route, "INCONCLUSIVE", `precondition absent: photos ${Array.isArray(photos) ? photos.length : "?"}, planted ${r?.status}, stored ${persisted?.status}`);
    else {
      const o = submitOracle(r!.status, r!.json, persisted, photos.length);
      ctrl(id, "flow", route, verdict(o), o.detail);
    }
  }
}

describe.skipIf(!process.env.DATABASE_URL)("J6 photos through submit, classification, invoice and report", () => {
  let w: J3World;
  beforeAll(async () => {
    restoreFetch = installDelivery();
    IMG.png = await sharp({ create: { width: PHOTO.width, height: PHOTO.height, channels: 3, background: { r: 30, g: 90, b: 160 } } }).png().toBuffer();
    IMG.jpg = await sharp({ create: { width: PHOTO.width, height: PHOTO.height, channels: 3, background: { r: 160, g: 90, b: 30 } } }).jpeg({ quality: 90 }).toBuffer();
    IMG.plan = await sharp({ create: { width: PLAN.width, height: PLAN.height, channels: 3, background: { r: 240, g: 240, b: 240 } } }).png().toBuffer();
    w = await buildJ3World("j6");
  });

  it("controls: planted defects are caught by the step oracles", async () => {
    await runControls(w);
  });

  it("cases: every variant through every step", async () => {
    if (w.seedErrors.length) {
      results.push({ id: "J6-PRECOND-world", family: FAMILY, kind: "case", area: "flow", state: "INCONCLUSIVE", detail: `seed errors: ${w.seedErrors.join(" | ")}` });
    }
    const only = process.env.JEV_J6_VARIANTS ? Number(process.env.JEV_J6_VARIANTS) : Infinity;
    for (const v of j6Variants().slice(0, only)) await runClaim(w, v);
  });
});
