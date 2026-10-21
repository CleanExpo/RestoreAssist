/**
 * J2 — golden regressions: the five failures the 22/10/2026 simulation found
 * (evidence/simulation-20261022/SUMMARY.md). Each case flips to PASS only when
 * the product is fixed. The oracles are pure functions so the planted
 * controls run through exactly the code the real cases use.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, it } from "vitest";
import { classify, recordResults, type JevArea, type JevResult } from "../runner/record";
import { invokeRoute, REPO, type InvokeResult } from "../runner/route-harness";
import { asIdentity, takeBlocked } from "../runner/setup";
import { buildWorld, sessionUser } from "../runner/world";

const FAMILY = "J2";
const results: JevResult[] = [];
afterAll(() => recordResults(FAMILY, results));

type Oracle = { passed: boolean; inconclusive?: boolean; detail: string };

// --- oracles -------------------------------------------------------------

// prisma.<model>.<write>( or, inside $transaction, tx.<model>.<write>(
const DIRECT_WRITE = /\b(?:prisma|tx|trx)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
/** The Phase 1 exit run may not move a claim forward by writing to the database. */
export function directWriteOracle(sources: Record<string, string>): Oracle {
  const hits = Object.entries(sources).flatMap(([f, src]) => [...src.matchAll(DIRECT_WRITE)].map((m) => `${f}: ${m[0]}`));
  if (Object.keys(sources).length === 0) return { passed: false, inconclusive: true, detail: "no source read" };
  return { passed: hits.length === 0, detail: hits.length ? `direct writes: ${hits.join("; ")}` : "no direct writes" };
}

export function rolesOracle(byRole: Record<string, InvokeResult>): Oracle {
  const bad = Object.entries(byRole).filter(([, r]) => r.status === null || r.status < 200 || r.status >= 300);
  return { passed: bad.length === 0, detail: Object.entries(byRole).map(([k, r]) => `${k}=${r.status ?? r.error}`).join(" ") };
}

export function photoOracle(r: InvokeResult, blocked: string[]): Oracle {
  if (r.status === null) return { passed: false, inconclusive: blocked.length > 0, detail: `${blocked.length ? `refused ${blocked}` : "crash"}: ${r.error}` };
  if (r.status >= 200 && r.status < 300) return { passed: true, detail: `stored (${r.status})` };
  const clear = r.status < 500 || r.status === 503;
  const hasMessage = /"(error|message)"\s*:\s*"[^"]{4,}/.test(r.text);
  return { passed: clear && hasMessage, detail: `${r.status} ${r.text.slice(0, 160)}` };
}

export function activateOracle(pricingSaved: InvokeResult, activate: InvokeResult): Oracle {
  if (pricingSaved.status === null || pricingSaved.status >= 300) return { passed: false, inconclusive: true, detail: `pricing save ${pricingSaved.status ?? pricingSaved.error}` };
  if (activate.status === null) return { passed: false, detail: `activate crash: ${activate.error}` };
  let failed: Array<{ capability?: string }> = [];
  try {
    failed = (JSON.parse(activate.text) as { failedChecks?: Array<{ capability?: string }> }).failedChecks ?? [];
  } catch {
    failed = [];
  }
  const pricingRed = failed.some((c) => c.capability === "pricing");
  return {
    passed: !pricingRed && activate.status < 500,
    detail: `activate ${activate.status}; red checks: ${failed.map((c) => c.capability).join(",") || "none"}`,
  };
}

export function sketchAreaOracle(save: InvokeResult, estimate: InvokeResult, wantM2: number): Oracle {
  if (save.status === null || save.status >= 300) return { passed: false, detail: `sketch save ${save.status ?? save.error}: ${save.text.slice(0, 120)}` };
  if (estimate.status === null || estimate.status >= 300) return { passed: false, detail: `estimate ${estimate.status ?? estimate.error}` };
  // The route answers { estimate: SketchEstimate } (estimate/route.ts:91). The
  // 22/10 walkthrough read lineItems at the top level and so always saw none.
  let lines: Array<{ areaM2?: number }> | null = null;
  try {
    lines = (JSON.parse(estimate.text) as { estimate?: { lineItems?: Array<{ areaM2?: number }> } }).estimate?.lineItems ?? null;
  } catch {
    lines = null;
  }
  if (lines === null) return { passed: false, detail: `estimate body has no estimate.lineItems: ${estimate.text.slice(0, 120)}` };
  const areas = lines.filter((l) => typeof l.areaM2 === "number").map((l) => l.areaM2 as number);
  const hit = areas.some((a) => Math.abs(a - wantM2) < 0.05);
  return { passed: hit, detail: `${areas.length} measured area line(s) [${areas.join(", ")}], want ${wantM2} m2` };
}

// --- recording -----------------------------------------------------------

function push(id: string, area: JevArea, route: string, kind: "case" | "control", o: Oracle) {
  const base = { id, family: FAMILY, kind, area, route };
  if (kind === "control") results.push({ ...base, state: o.passed ? "PASS" : "FAIL", detail: o.detail });
  else if (o.inconclusive) results.push({ ...base, state: "INCONCLUSIVE", detail: o.detail });
  else results.push({ ...base, ...classify(id, o.passed, o.detail) });
}

const ROOM_3X3 = {
  type: "polygon",
  points: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 300 },
    { x: 0, y: 300 },
  ],
  data: { type: "room", label: "Bathroom", provenance: "operator_measured" },
};

describe.skipIf(!process.env.DATABASE_URL)("J2 golden regressions", () => {
  it("controls: each oracle fails its planted defect", () => {
    push("J2-CTRL-direct-write", "flow", "planted", "control", directWriteOracle({ "planted.ts": "await prisma.invoice.updateMany({ where: {} })" }));
    push("J2-CTRL-direct-write-tx", "flow", "planted", "control", directWriteOracle({ "planted.ts": "await prisma.$transaction(async (tx) => { await tx.invoicePayment.create({ data }) })" }));
    push("J2-CTRL-roles", "security", "planted", "control", rolesOracle({ OWNER: { status: 400, text: "" }, USER: { status: 200, text: "" } }));
    push("J2-CTRL-photo-500", "photos", "planted", "control", photoOracle({ status: 500, text: '{"error":"Internal error"}' }, []));
    push("J2-CTRL-activate", "flow", "planted", "control", activateOracle({ status: 200, text: "" }, { status: 400, text: '{"failedChecks":[{"capability":"pricing"}]}' }));
    push("J2-CTRL-sketch-zero", "floorplans", "planted", "control", sketchAreaOracle({ status: 201, text: "" }, { status: 200, text: '{"estimate":{"lineItems":[{"areaM2":0}]}}' }, 9));
    push("J2-CTRL-sketch-old-shape", "floorplans", "planted", "control", sketchAreaOracle({ status: 201, text: "" }, { status: 200, text: '{"lineItems":[{"areaM2":9}]}' }, 9));
  });

  it("J2-XERO-DIRECT-WRITE: the reference-claim exit steps go through the app", () => {
    const dir = path.join(REPO, "app/api/test/v1-reference-claim");
    const sources: Record<string, string> = {};
    for (const step of ["issue-invoice", "finalize-exit"]) {
      const f = path.join(dir, step, "route.ts");
      if (fs.existsSync(f)) sources[`${step}/route.ts`] = fs.readFileSync(f, "utf8");
    }
    push("J2-XERO-DIRECT-WRITE", "payments", "app/api/test/v1-reference-claim", "case", directWriteOracle(sources));
  });

  it("J2-SIGNIN-ROLES: test sign-in covers Owner and Technician", async () => {
    const prev = { a: process.env.ALLOW_TEST_HELPERS, s: process.env.NEXTAUTH_SECRET };
    process.env.ALLOW_TEST_HELPERS = "true";
    process.env.NEXTAUTH_SECRET ??= "jev-fake-nextauth-secret-not-real";
    asIdentity(null);
    const info = { file: "app/api/test/sign-in-as/route.ts", route: "/api/test/sign-in-as" };
    const pre = await invokeRoute(info, "POST", { body: { role: "USER" } });
    const byRole: Record<string, InvokeResult> = {};
    for (const role of ["OWNER", "TECHNICIAN"]) byRole[role] = await invokeRoute(info, "POST", { body: { role } });
    process.env.ALLOW_TEST_HELPERS = prev.a;
    if (prev.s === undefined) delete process.env.NEXTAUTH_SECRET;
    const o = rolesOracle(byRole);
    // Precondition: the route answers a role it does know; otherwise the case measures the guard.
    if (pre.status === null || pre.status >= 300) o.inconclusive = true;
    o.detail = `USER=${pre.status ?? pre.error} ${o.detail}`;
    push("J2-SIGNIN-ROLES", "security", "/api/test/sign-in-as", "case", o);
  });

  it("J2-PHOTO-NO-STORAGE: photo upload without a storage provider fails clearly, not with a 500", async () => {
    const w = await buildWorld("j2p");
    for (const k of Object.keys(process.env)) if (k.startsWith("CLOUDINARY")) delete process.env[k];
    asIdentity(sessionUser(w, "A_OWNER"));
    takeBlocked();
    const form = new FormData();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    form.append("file", new File([png], "jev.png", { type: "image/png" }));
    form.append("location", "Bathroom");
    const r = await invokeRoute({ file: "app/api/inspections/[id]/photos/route.ts", route: "/api/inspections/[id]/photos" }, "POST", {
      params: { id: w.a.inspection },
      form,
    });
    push("J2-PHOTO-NO-STORAGE", "photos", "POST /api/inspections/[id]/photos", "case", photoOracle(r, takeBlocked()));
  });

  it("J2-SETUP-ACTIVATE: saved pricing is not reported missing at Activate", async () => {
    const w = await buildWorld("j2s");
    asIdentity(sessionUser(w, "A_OWNER"));
    const pricing = await invokeRoute({ file: "app/api/setup/pricing/route.ts", route: "/api/setup/pricing" }, "PATCH", {
      body: { masterQualifiedNormalHours: 95, administrationFee: 50 },
    });
    const activate = await invokeRoute({ file: "app/api/setup/activate/route.ts", route: "/api/setup/activate" }, "POST", { body: {} });
    push("J2-SETUP-ACTIVATE", "flow", "POST /api/setup/activate", "case", activateOracle(pricing, activate));
  });

  it("J2-SKETCH-3X3-AREA: a 3 m x 3 m room gives a 9 m2 area line", async () => {
    const w = await buildWorld("j2k");
    asIdentity(sessionUser(w, "A_OWNER"));
    const params = { id: w.a.inspection };
    const save = await invokeRoute({ file: "app/api/inspections/[id]/sketches/route.ts", route: "/api/inspections/[id]/sketches" }, "POST", {
      params,
      body: { floorNumber: 0, floorLabel: "Ground Floor", sketchType: "structural", sketchData: { scaleConfig: { pxPerMetre: 100 }, objects: [ROOM_3X3] } },
    });
    const est = await invokeRoute({ file: "app/api/inspections/[id]/sketches/estimate/route.ts", route: "/api/inspections/[id]/sketches/estimate" }, "GET", { params });
    push("J2-SKETCH-3X3-AREA", "floorplans", "GET /api/inspections/[id]/sketches/estimate", "case", sketchAreaOracle(save, est, 9));
  });
});
