/**
 * J1 — route security matrix. Every app/api route x method x identity x
 * payload, in-process against the throwaway database.
 *
 * Identities: signed out, firm A owner / manager / technician, firm B owner /
 * technician. Dynamic segments are filled with firm A's record ids, so every
 * firm B call is a cross-tenant attempt. Payloads: empty, malformed JSON, and
 * an id swap carrying firm A's ids in the body or query.
 *
 * Order matters: outsiders first, then firm A, then firm A's DELETEs last so
 * a successful delete cannot remove a record a later case needs.
 */
import { afterAll, describe, it } from "vitest";
import { recordResults, classify, type JevResult } from "../runner/record";
import { invokeRoute, listRoutes, type Method, type RouteInfo } from "../runner/route-harness";
import { asIdentity, takeBlocked } from "../runner/setup";
import { areaOf, judgeCall } from "../runner/judge";
import { aIdFor, buildWorld, FIRM_A, IDENTITIES, sessionUser, type IdentityName, type World } from "../runner/world";
import { PLANTED } from "./j1/planted";

const FAMILY = "J1";
const results: JevResult[] = [];
// Firm A seeing its own marked data proves the leak oracle has something to find.
const oracleReach = { count: 0 };
afterAll(() => recordResults(FAMILY, results));

type Payload = "empty" | "malformed" | "swap";
const PAYLOADS: Record<Method, Payload[]> = {
  GET: ["empty", "swap"],
  POST: ["empty", "malformed", "swap"],
  PUT: ["empty", "malformed", "swap"],
  PATCH: ["empty", "malformed", "swap"],
  DELETE: ["empty", "swap"],
};
const ROUTE_FILTER = process.env.JEV_J1_FILTER ? new RegExp(process.env.JEV_J1_FILTER) : null;

function swapBody(w: World): Record<string, string> {
  return {
    clientId: w.a.client,
    inspectionId: w.a.inspection,
    reportId: w.a.report,
    estimateId: w.a.estimate,
    invoiceId: w.a.invoice ?? w.a.inspection,
    organizationId: w.orgA,
    userId: w.users.A_OWNER.id,
    id: w.a.inspection,
  };
}

async function runCase(w: World, info: Pick<RouteInfo, "file" | "route" | "params">, method: Method, who: IdentityName, payload: Payload, id: string, kind: "case" | "control") {
  const params = Object.fromEntries(info.params.map((p) => [p, aIdFor(w, info.route, p)]));
  const swap = swapBody(w);
  asIdentity(sessionUser(w, who));
  takeBlocked();
  const res = await invokeRoute(info, method, {
    params,
    body: payload === "swap" ? swap : payload === "empty" ? {} : undefined,
    rawBody: payload === "malformed" ? '{"jev": ' : undefined,
    query: payload === "swap" ? new URLSearchParams(swap).toString() : undefined,
    timeoutMs: 20_000,
  });
  if (FIRM_A.includes(who) && res.text.includes(w.markA)) oracleReach.count++;
  const v = judgeCall({ who, route: info.route, method, touchesA: info.params.length > 0, payload, res, markA: w.markA, blocked: takeBlocked() });
  const base = { id, family: FAMILY, kind, area: kind === "control" ? ("security" as const) : areaOf(info.route), route: `${method} ${info.route}`, identity: who };
  if (v.state === "INCONCLUSIVE") results.push({ ...base, state: "INCONCLUSIVE", detail: v.detail });
  else if (kind === "control") results.push({ ...base, state: v.state, detail: v.detail });
  else results.push({ ...base, ...classify(id, v.state === "PASS", v.detail) });
}

describe.skipIf(!process.env.DATABASE_URL)("J1 route security matrix", () => {
  it("controls: planted defects are caught", async () => {
    const w = await buildWorld("j1c");
    for (const p of PLANTED) await runCase(w, p.info, p.method, p.who, p.payload, p.id, "control");
  });

  it("cases: every route x method x identity x payload", async () => {
    const w = await buildWorld("j1");
    const routes = listRoutes().filter((r) => !ROUTE_FILTER || ROUTE_FILTER.test(r.route));
    const plan: Array<{ r: RouteInfo; m: Method; who: IdentityName; p: Payload; phase: number }> = [];
    for (const r of routes) {
      for (const m of r.methods) {
        for (const who of IDENTITIES) {
          for (const p of PAYLOADS[m]) {
            const phase = who === "anon" || who.startsWith("B_") ? 0 : m === "DELETE" ? 2 : 1;
            plan.push({ r, m, who, p, phase });
          }
        }
      }
    }
    plan.sort((x, y) => x.phase - y.phase);
    for (const c of plan) {
      await runCase(w, c.r, c.m, c.who, c.p, `J1-${c.m}-${c.r.route}-${c.who}-${c.p}`, "case");
    }
    results.push({
      id: "J1-PRECOND-oracle-reach",
      family: FAMILY,
      kind: "case",
      area: "security",
      state: oracleReach.count > 0 ? "PASS" : "FAIL",
      detail: `firm A saw its own marked data in ${oracleReach.count} responses`,
    });
  });
});
