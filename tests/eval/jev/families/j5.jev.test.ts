/**
 * J5 — attack payloads on create and update routes, in-process against the
 * throwaway database.
 *
 * Each case puts one payload (XSS, SQL injection, path traversal, NUL / RTL /
 * emoji / 100k strings, prototype keys, wrong types, edge numbers) in one
 * body field of an otherwise valid request, as firm A's owner, and as firm
 * B's owner against firm A's record where the route takes one (id swap).
 * A mass-assignment case per route adds userId / organizationId / role /
 * id / inspectionId fields that must not take effect.
 *
 * Oracle per call: judgeCall (no 5xx unless a refused host explains it, no
 * unhandled throw, no firm A marker to an outsider, no outsider write
 * accepted); no database error text or stack trace in the body; no
 * Object.prototype pollution; ownership/role unchanged after a mass-assignment
 * attempt (read back via prisma); and a stored value comes back from the
 * route's GET exactly as stored.
 */
import { afterAll, describe, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { classify, recordResults, type JevResult } from "../runner/record";
import { invokeRoute, type InvokeResult } from "../runner/route-harness";
import { asIdentity, takeBlocked } from "../runner/setup";
import { areaOf, judgeCall } from "../runner/judge";
import { buildWorld, clearRateLimits, FIRM_A, sessionUser, type IdentityName, type World } from "../runner/world";
import { ERROR_TEXT, PAYLOADS, serialize, setPath } from "./j5/payloads";
import { plantedSpecs, specs, type Ctx, type Spec } from "./j5/specs";

const FAMILY = "J5";
const results: JevResult[] = [];
afterAll(() => recordResults(FAMILY, results));

const reach = { markA: 0, compared: new Map<string, number>() };
const FORCED_ID = "jevforcedid000000000000000";

async function freshInspection(w: World, n: number): Promise<string> {
  const i = await prisma.inspection.create({
    data: {
      inspectionNumber: `NIR-${w.run}-J5-${n}`,
      propertyAddress: `${n} ${w.markA} St, Brisbane QLD`,
      propertyPostcode: "4000",
      userId: w.users.A_OWNER.id,
      technicianId: w.users.A_TECH.id,
      technicianName: "A_TECH",
    },
  });
  return i.id;
}

async function freshInvoice(w: World, clientId: string, tag: string): Promise<string> {
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `RA-${w.run}-J5-${tag}`,
      dueDate: new Date(Date.now() + 14 * 864e5),
      customerName: `${w.markA} Customer`,
      customerEmail: `${w.run}-invu@jev.test`,
      subtotalExGST: 10000,
      gstAmount: 1000,
      totalIncGST: 11000,
      amountDue: 11000,
      userId: w.users.A_OWNER.id,
      clientId,
    } as never,
  });
  return invoice.id;
}

async function caseCtx(c: Ctx, spec: Spec, n: number): Promise<Ctx> {
  if (spec.fresh === "inspection") return { ...c, inspection: await freshInspection(c.w, n) };
  if (spec.fresh === "invoice") return { ...c, invoice: await freshInvoice(c.w, c.client, String(n)) };
  return c;
}

async function makeCtx(w: World): Promise<Ctx> {
  const client = await prisma.client.create({
    data: { name: `${w.markA} J5 Client`, email: `${w.run}-cu@jev.test`, address: `9 ${w.markA} St`, userId: w.users.A_OWNER.id },
  });
  return { w, client: client.id, invoice: await freshInvoice(w, client.id, "base"), inspection: w.a.inspection, run: w.run };
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function createdId(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (typeof o.id === "string") return o.id;
  for (const v of Object.values(o)) if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") return (v as { id: string }).id;
  return null;
}

function findById(json: unknown, id: string, depth = 0): Record<string, unknown> | null {
  if (!json || typeof json !== "object" || depth > 8) return null;
  if (Array.isArray(json)) {
    for (const x of json) {
      const f = findById(x, id, depth + 1);
      if (f) return f;
    }
    return null;
  }
  const o = json as Record<string, unknown>;
  if (o.id === id) return o;
  for (const v of Object.values(o)) {
    const f = findById(v, id, depth + 1);
    if (f) return f;
  }
  return null;
}

function norm(v: unknown): string {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (v && typeof v === "object" && typeof (v as { toFixed?: unknown }).toFixed === "function" && !(typeof v === "number")) return JSON.stringify(Number(v));
  return JSON.stringify(v ?? null);
}

const delegate = (model: string) => (prisma as unknown as Record<string, { findUnique: Function; findFirst: Function }>)[model];

function massBody(c: Ctx, base: Record<string, unknown>): Record<string, unknown> {
  return {
    ...base,
    id: FORCED_ID,
    userId: c.w.users.B_OWNER.id,
    organizationId: c.w.orgB,
    ownerId: c.w.users.B_OWNER.id,
    createdById: c.w.users.B_OWNER.id,
    inspectionId: c.w.b.inspection,
    role: "ADMIN",
    subscriptionStatus: "ACTIVE",
    isAdmin: true,
  };
}

type Outcome = { state: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string };

async function runCase(shared: Ctx, spec: Spec, who: IdentityName, field: string, payload: string, n: number): Promise<Outcome> {
  const c = await caseCtx(shared, spec, n);
  const w = c.w;
  pending.inconclusive = null;
  pending.note = "";
  const mass = field === "mass";
  const base = spec.base(c, n);
  const body = mass ? massBody(c, spec.key === "team-member-role" ? { role: "MANAGER", email: `${c.run}-hijack@jev.test` } : base) : setPath(base, field, PAYLOADS[payload]);
  const actor = who === "anon" ? null : w.users[who];
  const actorBefore = actor ? await prisma.user.findUnique({ where: { id: actor.id }, select: { role: true, organizationId: true } }) : null;
  const target = spec.readback.rowId(c, null);
  const rowBefore = target ? await delegate(spec.readback.model).findUnique({ where: { id: target } }) : null;

  await clearRateLimits();
  asIdentity(sessionUser(w, who));
  takeBlocked();
  const res: InvokeResult = await invokeRoute(spec, spec.method, { params: spec.params(c), rawBody: serialize(body), headers: spec.headers?.(c, n), timeoutMs: 30_000 });
  const blocked = takeBlocked();
  if (FIRM_A.includes(who) && res.text.includes(w.markA)) reach.markA++;

  const label = `${field}.${payload}`;
  const v = judgeCall({ who, route: spec.route, method: spec.method, touchesA: spec.swap, payload: label, res, markA: w.markA, blocked });
  const fails: string[] = [];
  if (v.state === "FAIL") fails.push(v.detail);
  const leakText = res.text.match(ERROR_TEXT);
  if (leakText) fails.push(`database/stack text in response (${res.status}): …${res.text.slice(Math.max(0, (leakText.index ?? 0) - 60), (leakText.index ?? 0) + 100).replace(/\s+/g, " ")}…`);
  if ((Object.prototype as Record<string, unknown>).jevPolluted !== undefined) {
    fails.push("Object.prototype polluted by the request body");
    delete (Object.prototype as Record<string, unknown>).jevPolluted;
  }

  try {
    // Ownership and role after the call. Mass-assignment cases assert the
    // injected fields did not land; every case asserts the caller's own role.
    if (actor && actorBefore) {
      const after = await prisma.user.findUnique({ where: { id: actor.id }, select: { role: true, organizationId: true } });
      if (after && (after.role !== actorBefore.role || after.organizationId !== actorBefore.organizationId))
        fails.push(`caller ${who} changed from ${actorBefore.role}/${actorBefore.organizationId} to ${after.role}/${after.organizationId}`);
    }
    const ok = res.status !== null && res.status >= 200 && res.status < 300;
    const json = parse(res.text);
    const rowId = spec.readback.rowId(c, ok ? createdId(json) : null);
    if (ok && FIRM_A.includes(who) && rowId) {
      const row = (await delegate(spec.readback.model).findUnique({ where: { id: rowId } })) as Record<string, unknown> | null;
      if (mass && row) {
        if (row.id === FORCED_ID) fails.push("client-chosen id accepted");
        for (const k of ["userId", "organizationId", "ownerId", "createdById", "inspectionId"] as const) {
          if (!(k in row)) continue;
          const was = rowBefore ? (rowBefore as Record<string, unknown>)[k] : undefined;
          const injected = (body as Record<string, unknown>)[k];
          if (row[k] === injected && was !== injected) fails.push(`mass assignment: ${k} set to the injected value ${String(injected)}`);
        }
        if ("role" in row && spec.readback.model === "user" && row.role === "ADMIN") fails.push("mass assignment: role ADMIN applied");
        if ("role" in row && spec.readback.model === "userInvite" && row.role === "ADMIN") fails.push("mass assignment: invite role ADMIN applied");
      }
      if (!mass && row && !spec.planted) {
        const key = field.split(".").pop()!;
        let src: Record<string, unknown> | null = row;
        let srcId = rowId;
        if (field.startsWith("lineItems.") && spec.readback.child) {
          src = (await delegate(spec.readback.child.model).findFirst({ where: spec.readback.child.where(rowId) })) as Record<string, unknown> | null;
          srcId = (src?.id as string) ?? rowId;
        }
        if (src && key in src) await roundTrip(c, spec, who, src[key], srcId, key, fails, (o) => (v.state === "INCONCLUSIVE" ? undefined : o));
      }
      if (!mass && row && spec.planted) await roundTrip(c, spec, who, row.name, rowId, "name", fails, (o) => o);
    }
  } catch (err) {
    fails.push(`read-back threw ${err instanceof Error ? err.message.split("\n").pop()?.slice(0, 200) : String(err)}`);
  } finally {
    if (spec.reset) await spec.reset(c).catch(() => undefined);
  }

  if (fails.length) return { state: "FAIL", detail: `${fails.join(" | ")} [status ${res.status}${res.error ? `, ${res.error.slice(0, 120)}` : ""}]` };
  if (v.state === "INCONCLUSIVE") return { state: "INCONCLUSIVE", detail: v.detail };
  if (pending.inconclusive) {
    const d = pending.inconclusive;
    pending.inconclusive = null;
    return { state: "INCONCLUSIVE", detail: d };
  }
  return { state: "PASS", detail: `${res.status}${pending.note ? `; ${pending.note}` : ""}` };
}

const pending: { inconclusive: string | null; note: string } = { inconclusive: null, note: "" };

async function roundTrip(c: Ctx, spec: Spec, who: IdentityName, stored: unknown, rowId: string, key: string, fails: string[], _gate: (o: unknown) => unknown) {
  pending.note = "";
  pending.inconclusive = null;
  const g = spec.readback.get;
  asIdentity(sessionUser(c.w, who));
  takeBlocked();
  const res = await invokeRoute(g, "GET", { params: g.params(c, rowId), timeoutMs: 30_000 });
  const blocked = takeBlocked();
  if (res.text.includes(c.w.markA)) reach.markA++;
  if (res.status === null || res.status >= 500) {
    if (blocked.length) pending.inconclusive = `read-back GET needs provider ${blocked.join(",")}`;
    else fails.push(`read-back GET ${g.route} failed after storing the payload: ${res.status ?? res.error}`);
    return;
  }
  if (res.status >= 300) {
    pending.note = `read-back GET ${res.status}`;
    return;
  }
  const json = parse(res.text);
  if (json === undefined) {
    if (res.text.length >= 20_000) pending.inconclusive = "round trip unobservable: harness truncates the GET body at 20,000 chars";
    else fails.push(`read-back GET returned non-JSON (${res.text.slice(0, 80)})`);
    return;
  }
  const obj = findById(json, rowId);
  if (!obj || !(key in obj)) {
    pending.note = `${key} not exposed by GET ${g.route}`;
    return;
  }
  reach.compared.set(spec.key, (reach.compared.get(spec.key) ?? 0) + 1);
  const a = norm(stored);
  const b = norm(obj[key]);
  if (a !== b) fails.push(`stored value does not round-trip through GET ${g.route}: stored ${a.slice(0, 120)}, GET ${b.slice(0, 120)}`);
}

function push(spec: Spec, who: IdentityName, field: string, payload: string, o: Outcome, kind: "case" | "control", id: string) {
  const base = { id, family: FAMILY, kind, area: kind === "control" ? ("security" as const) : areaOf(spec.route), route: `${spec.method} ${spec.route}`, identity: who };
  if (kind === "control" || o.state === "INCONCLUSIVE") results.push({ ...base, state: o.state, detail: o.detail.slice(0, 1200) });
  else results.push({ ...base, ...classify(id, o.state === "PASS", `${field}.${payload}: ${o.detail}`.slice(0, 1200)) });
}

describe.skipIf(!process.env.DATABASE_URL)("J5 attack payloads", () => {
  it("controls: planted handlers are caught by the same oracles", async () => {
    const w = await buildWorld("j5c");
    const c = await makeCtx(w);
    let n = 0;
    for (const p of plantedSpecs()) {
      const o = await runCase(c, p.spec, p.who, p.field, p.payload, n++);
      push(p.spec, p.who, p.field, p.payload, o, "control", p.id);
    }
  });

  it("cases: every route x field x payload, id swap, mass assignment", async () => {
    const w = await buildWorld("j5");
    const c = await makeCtx(w);
    const all = specs();
    const names = Object.keys(PAYLOADS);
    let n = 0;
    // Outsiders first, so firm A's marked records are intact when B probes them.
    for (const spec of all.filter((s) => s.swap)) {
      for (const field of spec.fields) {
        for (const p of names) {
          const o = await runCase(c, spec, "B_OWNER", field, p, n++);
          push(spec, "B_OWNER", field, p, o, "case", `J5-${spec.method} ${spec.route}-${field}.${p}-B_OWNER`);
        }
      }
    }
    for (const spec of all) {
      for (const field of spec.fields) {
        for (const p of names) {
          const o = await runCase(c, spec, "A_OWNER", field, p, n++);
          push(spec, "A_OWNER", field, p, o, "case", `J5-${spec.method} ${spec.route}-${field}.${p}-A_OWNER`);
        }
      }
    }
    for (const spec of all) {
      for (const who of ["A_OWNER", "A_MANAGER"] as const) {
        const o = await runCase(c, spec, who, "mass", "assign", n++);
        push(spec, who, "mass", "assign", o, "case", `J5-${spec.method} ${spec.route}-mass.assign-${who}`);
      }
    }
    const compared = [...reach.compared.entries()].map(([k, v]) => `${k}=${v}`).join(", ");
    results.push({
      id: "J5-PRECOND-roundtrip-reach",
      family: FAMILY,
      kind: "case",
      area: "security",
      state: reach.compared.size > 0 ? "PASS" : "FAIL",
      detail: `stored values compared against GET: ${compared || "none"}`,
    });
    results.push({
      id: "J5-PRECOND-oracle-reach",
      family: FAMILY,
      kind: "case",
      area: "security",
      state: reach.markA > 0 ? "PASS" : "FAIL",
      detail: `firm A saw its own marked data in ${reach.markA} responses`,
    });
  });
});
