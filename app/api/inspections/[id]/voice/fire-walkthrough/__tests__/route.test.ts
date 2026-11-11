import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Real status, router, checklist and action code; only prisma, auth and
 * the tenancy/idempotency wrappers are faked. The fake prisma stores rows
 * in memory and checks the `where` it is given.
 */
const store = vi.hoisted(() => ({
  observations: [] as Array<{ id: string; sessionId: string; type: string; parsed: unknown; createdAt: Date }>,
  sessions: new Map<string, { userId: string; inspectionId: string }>(),
  audit: [] as unknown[],
  claimType: "FIRE" as string | null,
  fireAssessment: false,
  findManyWheres: [] as unknown[],
  clock: 0,
  inspectionStatus: "DRAFT" as string,
}));
const gate = vi.hoisted(() => ({ refuse: false, scopeLost: false }));
/**
 * Idempotency store shaped like lib/idempotency: a key is reserved PENDING,
 * then completed either inside the route's transaction (marked replies) or
 * by the middleware after commit. postCommitCacheFails models that later
 * write failing and the lease lapsing, which frees the key for a re-run.
 */
const idem = vi.hoisted(() => ({
  records: new Map<string, { status: "PENDING" | "COMPLETE"; body?: string }>(),
  postCommitCacheFails: false,
  loseReservation: false,
  seq: 0,
}));
const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }));

vi.mock("next-auth", () => auth);
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const prisma = {
    inspection: {
      findFirst: async () => ({ id: "insp-1", claimType: store.claimType, status: store.inspectionStatus }),
    },
    voiceCopilotSession: {
      findFirst: async ({ where }: { where: { id: string } }) => store.sessions.get(where.id) ?? null,
    },
    voiceCopilotObservation: {
      findMany: async (args: { where: { type: { in: string[] }; session: { inspectionId: string } } }) => {
        store.findManyWheres.push(args.where);
        return store.observations
          .filter((o) => args.where.type.in.includes(o.type))
          .filter((o) => store.sessions.get(o.sessionId)?.inspectionId === args.where.session.inspectionId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((o) => ({ ...o, session: { userId: store.sessions.get(o.sessionId)?.userId ?? null } }));
      },
      create: async ({ data }: { data: { id: string; sessionId: string; type: string; parsed: unknown } }) => {
        store.clock += 1000;
        const row = { ...data, createdAt: new Date(Date.parse("2026-11-11T09:00:00Z") + store.clock) };
        store.observations.push(row);
        return row;
      },
    },
    fireSmokeDamageAssessment: {
      findFirst: async () => (store.fireAssessment ? { id: "fsa-1" } : null),
    },
    auditLog: {
      create: async ({ data }: { data: unknown }) => {
        store.audit.push(data);
        return data;
      },
    },
  };
  return { prisma };
});
vi.mock("@/lib/auth/assert-tenancy", async () => {
  const { prisma } = await import("@/lib/prisma");
  return {
    assertInspectionAssignedWrite: async () =>
      gate.refuse
        ? { ok: false, status: 404, reason: "Inspection not found" }
        : { ok: true, data: { inspectionManyWhere: { id: "insp-1" }, viaAssignment: true } },
    // Mirrors the real helper: the locked update matches only when every
    // field of the scope matches the row, status included.
    // A throw inside the work rolls the transaction back.
    writeWithinInspectionScope: async (s: { status?: string }, _d: unknown, work: (tx: unknown) => unknown) => {
      if (gate.scopeLost || (s.status !== undefined && s.status !== store.inspectionStatus)) return null;
      const [obs, audit] = [store.observations.length, store.audit.length];
      try {
        return await work(prisma);
      } catch (error) {
        store.observations.length = obs;
        store.audit.length = audit;
        throw error;
      }
    },
  };
});
vi.mock("@/lib/idempotency", () => ({
  getIdempotencyKey: (req: NextRequest) => ({ ok: true, key: req.headers.get("Idempotency-Key") }),
  completeIdempotentSuccessInTransaction: async ({ key, responseBody }: { key: string; responseBody: string }) => {
    const record = idem.records.get(key);
    if (idem.loseReservation || record?.status !== "PENDING") return false;
    idem.records.set(key, { status: "COMPLETE", body: responseBody });
    return true;
  },
  withIdempotency: async (
    req: NextRequest,
    _u: string,
    handler: (raw: string) => Promise<Response>,
    options: { successCompletedInHandler?: boolean | "when-marked" } = {},
  ) => {
    const key = req.headers.get("Idempotency-Key")!;
    const record = idem.records.get(key);
    if (record?.status === "COMPLETE") {
      return new Response(record.body, { status: 200, headers: { "Idempotent-Replayed": "true" } });
    }
    if (record) return Response.json({ error: "in progress" }, { status: 409 });
    idem.records.set(key, { status: "PENDING" });
    const res = await handler(await req.text());
    if (res.headers.get("X-RestoreAssist-Idempotency-Uncertain") === "true") return res;
    const completedInTx = res.ok && options.successCompletedInHandler === "when-marked" &&
      res.headers.get("X-RestoreAssist-Idempotency-Completed-In-Transaction") === "true";
    if (completedInTx) return res;
    if (res.status >= 500 || idem.postCommitCacheFails) idem.records.delete(key);
    else idem.records.set(key, { status: "COMPLETE", body: await res.clone().text() });
    return res;
  },
}));

import { GET, POST } from "../route";
import { FIRE_SECTION_IDS } from "@/lib/voice/fire-smoke/checklist";

const ctx = (id = "insp-1") => ({ params: Promise.resolve({ id }) });
const url = (id = "insp-1") => `http://localhost/api/inspections/${id}/voice/fire-walkthrough`;

/** Each call gets a fresh Idempotency-Key unless one is given; null sends none. */
function post(body: unknown, id = "insp-1", key: string | null = `fire-test-key-${++idem.seq}`) {
  return POST(
    new NextRequest(url(id), {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    }),
    ctx(id),
  );
}
const get = () => GET(new NextRequest(url()), ctx());
/** The revision on the technician's screen, read the way the client reads it. */
const reviewed = async (): Promise<string> => (await (await get()).json()).status.reviewRevision;

const ack = () => post({ action: "acknowledge_notice", sessionId: "vs-1", spoken: true, recognitionMode: "cloud" });

async function fillAll(sessionId = "vs-1") {
  for (const sectionId of FIRE_SECTION_IDS) {
    const res = await post({ action: "file", sessionId, sectionId, transcript: `Synthetic note for ${sectionId}`, routedBy: "technician_chose" });
    expect(res.status).toBe(200);
  }
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  store.observations = [];
  store.sessions = new Map([
    ["vs-1", { userId: "tech-1", inspectionId: "insp-1" }],
    ["vs-2", { userId: "tech-1", inspectionId: "insp-1" }],
    ["vs-other-user", { userId: "tech-2", inspectionId: "insp-1" }],
    ["vs-other-job", { userId: "tech-1", inspectionId: "insp-2" }],
  ]);
  store.audit = [];
  store.claimType = "FIRE";
  store.fireAssessment = false;
  store.findManyWheres = [];
  store.clock = 0;
  store.inspectionStatus = "DRAFT";
  gate.refuse = false;
  gate.scopeLost = false;
  idem.records = new Map();
  idem.postCommitCacheFails = false;
  idem.loseReservation = false;
  auth.getServerSession.mockResolvedValue({ user: { id: "tech-1" } });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe("refusals", () => {
  it("401 without a login", async () => {
    auth.getServerSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect((await ack()).status).toBe(401);
    expect(store.observations).toHaveLength(0);
  });

  it("404 when the caller cannot write the job", async () => {
    gate.refuse = true;
    expect((await get()).status).toBe(404);
    expect((await ack()).status).toBe(404);
    expect(store.observations).toHaveLength(0);
  });

  it("404 when the scope is lost between check and write", async () => {
    gate.scopeLost = true;
    expect((await ack()).status).toBe(404);
    expect(store.observations).toHaveLength(0);
  });

  it.each(["vs-other-user", "vs-other-job", "vs-missing"])("403 for session %s", async (sessionId) => {
    const res = await post({ action: "acknowledge_notice", sessionId, spoken: true, recognitionMode: "cloud" });
    expect(res.status).toBe(403);
    expect(store.observations).toHaveLength(0);
  });

  it("400 for bad JSON, an unknown action, or an unknown section", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ action: "delete_everything", sessionId: "vs-1" })).status).toBe(400);
    expect((await post({ action: "file", sessionId: "vs-1", sectionId: "made_up", transcript: "x", routedBy: "technician_chose" })).status).toBe(400);
  });

  it("every refusal the route sends passes the browser's refusal check (round 17)", async () => {
    const { fireRefusalSchema } = await import("@/lib/voice/fire-smoke/reply-schema");
    const refusals = [
      await post("{not json"),
      await post({ action: "delete_everything", sessionId: "vs-1" }),
      await post({ action: "acknowledge_notice", sessionId: "vs-missing", spoken: true, recognitionMode: "cloud" }),
      await post({ action: "capture", sessionId: "vs-1", transcript: "Power isolated at the switchboard" }),
    ];
    gate.refuse = true;
    const noAccess = await ack();
    auth.getServerSession.mockResolvedValue(null);
    const noLogin = await ack();
    const all = [...refusals, noAccess, noLogin];
    expect(all.map((r) => r.status)).toEqual([400, 400, 403, 422, 404, 401]);
    for (const res of all) {
      const parsed = fireRefusalSchema.safeParse(await res.json());
      expect(parsed.success).toBe(true);
      expect(typeof parsed.data?.message).toBe("string");
    }
  });

  it("another technician's notice does not open the microphone for this one", async () => {
    auth.getServerSession.mockResolvedValue({ user: { id: "tech-2" } });
    const theirs = await post({ action: "acknowledge_notice", sessionId: "vs-other-user", spoken: true, recognitionMode: "cloud" });
    expect(theirs.status).toBe(200);
    auth.getServerSession.mockResolvedValue({ user: { id: "tech-1" } });
    expect((await (await get()).json()).status.noticeAcknowledged).toBe(false);
    const res = await post({ action: "capture", sessionId: "vs-1", transcript: "Power isolated at the switchboard" });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("NOTICE_REQUIRED");
    expect(store.observations.filter((o) => o.type !== "fire_notice_acknowledged")).toHaveLength(0);
  });

  it("422 NOTICE_REQUIRED: nothing is recorded before the notice", async () => {
    const res = await post({ action: "capture", sessionId: "vs-1", transcript: "Power isolated at the switchboard" });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("NOTICE_REQUIRED");
    expect(store.observations).toHaveLength(0);
  });

  it("the client cannot choose the stored observation type", async () => {
    await ack();
    await post({ action: "file", sessionId: "vs-1", sectionId: "services", transcript: "Gas off", routedBy: "technician_chose", type: "fire_walkthrough_signoff" });
    expect(store.observations.map((o) => o.type)).toEqual(["fire_notice_acknowledged", "fire_section_entry"]);
  });
});

describe("walkthrough", () => {
  it("capture files a clear answer and asks when unsure", async () => {
    await ack();
    const filed = await (await post({ action: "capture", sessionId: "vs-1", transcript: "Power isolated at the switchboard and the gas meter is off" })).json();
    expect(filed.outcome).toMatchObject({ kind: "filed", sectionId: "services" });

    const ask = await (await post({ action: "capture", sessionId: "vs-1", transcript: "All good here", currentSectionId: "safety_brief" })).json();
    expect(ask.outcome).toEqual({ kind: "ask", candidateSectionId: "safety_brief", say: "Is this part of the safety brief and PPE?" });
    expect(store.observations.filter((o) => o.type === "fire_section_entry")).toHaveLength(1);
  });

  it("422 SECTIONS_OPEN when signing with zero sections done", async () => {
    await ack();
    const res = await post({ action: "sign_off", sessionId: "vs-1", typedName: "Sam Example", declarationAccepted: true, reviewedRevision: await reviewed() });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("SECTIONS_OPEN");
    expect(body.openSectionIds).toEqual([...FIRE_SECTION_IDS]);
  });

  it("accepts a complete walkthrough across two sessions, signs it once, and records an audit row", async () => {
    await ack();
    await fillAll("vs-1");
    await post({ action: "mark_na", sessionId: "vs-2", sectionId: "contents", reason: "No contents left in the building" });

    const res = await post({ action: "sign_off", sessionId: "vs-2", typedName: "Sam Example", declarationAccepted: true, reviewedRevision: await reviewed() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status.signoff.state).toBe("signed");
    expect(body.status.sections.find((s: { sectionId: string }) => s.sectionId === "contents").state).toBe("na");

    const again = await post({ action: "sign_off", sessionId: "vs-2", typedName: "Sam Example", declarationAccepted: true, reviewedRevision: await reviewed() });
    expect(again.status).toBe(200);
    expect(store.observations.filter((o) => o.type === "fire_walkthrough_signoff")).toHaveLength(1);
    expect(store.audit).toHaveLength(1);
    expect(store.audit[0]).toMatchObject({ inspectionId: "insp-1", action: "fire_walkthrough_signoff", userId: "tech-1" });

    const signoff = store.observations.find((o) => o.type === "fire_walkthrough_signoff")!;
    expect(signoff.parsed).toMatchObject({ signerUserId: "tech-1", typedName: "Sam Example" });
  });

  it("refuses a sign-off over answers saved after the technician's last view (K5)", async () => {
    await ack();
    await fillAll("vs-1");
    const seen = await reviewed();
    // Another device saves a new answer the signer has not seen.
    await post({ action: "file", sessionId: "vs-2", sectionId: "services", transcript: "Late note from another device", routedBy: "technician_chose" });
    const res = await post({ action: "sign_off", sessionId: "vs-1", typedName: "Sam Example", declarationAccepted: true, reviewedRevision: seen });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("REVIEW_STALE");
    expect(store.observations.filter((o) => o.type === "fire_walkthrough_signoff")).toHaveLength(0);

    const fresh = await post({ action: "sign_off", sessionId: "vs-1", typedName: "Sam Example", declarationAccepted: true, reviewedRevision: await reviewed() });
    expect(fresh.status).toBe(200);
  });

  it("refuses a stale view even when another technician has already signed the newer rows (K5, round 16)", async () => {
    await ack();
    await fillAll("vs-1");
    const seenByA = await reviewed();
    auth.getServerSession.mockResolvedValue({ user: { id: "tech-2" } });
    await post({ action: "acknowledge_notice", sessionId: "vs-other-user", spoken: true, recognitionMode: "cloud" });
    await post({ action: "file", sessionId: "vs-other-user", sectionId: "services", transcript: "Late note from B", routedBy: "technician_chose" });
    const byB = await post({ action: "sign_off", sessionId: "vs-other-user", typedName: "Bo Example", declarationAccepted: true, reviewedRevision: await reviewed() });
    expect(byB.status).toBe(200);

    auth.getServerSession.mockResolvedValue({ user: { id: "tech-1" } });
    const byA = await post({ action: "sign_off", sessionId: "vs-1", typedName: "Sam Example", declarationAccepted: true, reviewedRevision: seenByA });
    expect(byA.status).toBe(422);
    expect((await byA.json()).code).toBe("REVIEW_STALE");
    expect(store.observations.filter((o) => o.type === "fire_walkthrough_signoff")).toHaveLength(1);
    expect(store.audit).toHaveLength(1);
  });

  it("a technician cannot sign before acknowledging the notice themselves (round 19, K11)", async () => {
    await ack();
    await fillAll("vs-1");
    auth.getServerSession.mockResolvedValue({ user: { id: "tech-2" } });
    const sign = async () =>
      post({ action: "sign_off", sessionId: "vs-other-user", typedName: "Bo Example", declarationAccepted: true, reviewedRevision: await reviewed() });
    const before = await sign();
    expect(before.status).toBe(422);
    expect((await before.json()).code).toBe("NOTICE_REQUIRED");
    expect(store.observations.filter((o) => o.type === "fire_walkthrough_signoff")).toHaveLength(0);
    expect(store.audit).toHaveLength(0);

    // Positive control: the same request succeeds once B has acknowledged.
    await post({ action: "acknowledge_notice", sessionId: "vs-other-user", spoken: true, recognitionMode: "cloud" });
    expect((await sign()).status).toBe(200);
    expect(store.observations.filter((o) => o.type === "fire_walkthrough_signoff")).toHaveLength(1);
  });

  it("a second technician with a current view signs in their own name (round 16)", async () => {
    await ack();
    await fillAll("vs-1");
    await post({ action: "sign_off", sessionId: "vs-1", typedName: "Sam Example", declarationAccepted: true, reviewedRevision: await reviewed() });
    auth.getServerSession.mockResolvedValue({ user: { id: "tech-2" } });
    await post({ action: "acknowledge_notice", sessionId: "vs-other-user", spoken: true, recognitionMode: "cloud" });
    const byB = await post({ action: "sign_off", sessionId: "vs-other-user", typedName: "Bo Example", declarationAccepted: true, reviewedRevision: await reviewed() });
    expect(byB.status).toBe(200);
    const signoffs = store.observations.filter((o) => o.type === "fire_walkthrough_signoff");
    expect(signoffs.map((o) => (o.parsed as { signerUserId: string }).signerUserId)).toEqual(["tech-1", "tech-2"]);
    expect(store.audit).toHaveLength(2);
  });

  it("a submitted job refuses every walkthrough write, so its sign-off stays as signed (K13)", async () => {
    await ack();
    await fillAll();
    await post({ action: "sign_off", sessionId: "vs-1", typedName: "Sam Example", declarationAccepted: true, reviewedRevision: await reviewed() });
    const before = store.observations.length;
    store.inspectionStatus = "SUBMITTED";

    const late = await post({ action: "file", sessionId: "vs-1", sectionId: "contents", transcript: "Late note after submit", routedBy: "technician_chose" });
    expect(late.status).toBe(422);
    expect((await late.json()).code).toBe("INSPECTION_SUBMITTED");
    const resign = await post({ action: "sign_off", sessionId: "vs-1", typedName: "Sam Example", declarationAccepted: true, reviewedRevision: await reviewed() });
    expect(resign.status).toBe(422);
    expect(store.observations).toHaveLength(before);
    expect(store.audit).toHaveLength(1);
    expect((await (await get()).json()).status.signoff.state).toBe("signed");
  });

  it("a change after sign-off shows as changed and allows a fresh sign-off", async () => {
    await ack();
    await fillAll();
    await post({ action: "sign_off", sessionId: "vs-1", typedName: "Sam Example", declarationAccepted: true, reviewedRevision: await reviewed() });
    const changed = await (await post({ action: "file", sessionId: "vs-1", sectionId: "contents", transcript: "Found more items", routedBy: "technician_chose" })).json();
    expect(changed.status.signoff.state).toBe("changed");
    const resigned = await (await post({ action: "sign_off", sessionId: "vs-1", typedName: "Sam Example", declarationAccepted: true, reviewedRevision: await reviewed() })).json();
    expect(resigned.status.signoff.state).toBe("signed");
    expect(store.audit).toHaveLength(2);
  });

  it("reads every session of the job with no endedAt or expiresAt filter", async () => {
    await get();
    expect(store.findManyWheres[0]).toEqual({
      type: { in: ["fire_notice_acknowledged", "fire_section_entry", "fire_section_na", "fire_walkthrough_signoff"] },
      session: { inspectionId: "insp-1" },
    });
  });
});

describe("retry after a lost reply (K12)", () => {
  const capture = { action: "file", sessionId: "vs-1", sectionId: "services", transcript: "Synthetic gas isolated", routedBy: "technician_chose" };

  it("a retry with the same key replays the reply and writes nothing twice, even if the later cache write fails", async () => {
    expect((await ack()).status).toBe(200);
    idem.postCommitCacheFails = true;
    const first = await post(capture, "insp-1", "fire-retry-key-0001");
    expect(first.status).toBe(200);
    const audit = store.audit.length;
    const again = await post(capture, "insp-1", "fire-retry-key-0001");
    expect(again.status).toBe(200);
    expect(again.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await again.json()).toEqual(await first.json());
    expect(store.observations.filter((o) => o.type === "fire_section_entry")).toHaveLength(1);
    expect(store.audit).toHaveLength(audit);
  });

  it("if the key's reservation is gone at commit, nothing is written and the reply is unconfirmed", async () => {
    expect((await ack()).status).toBe(200);
    const rows = store.observations.length;
    const audit = store.audit.length;
    idem.loseReservation = true;
    const res = await post(capture, "insp-1", "fire-retry-key-0002");
    expect(res.status).toBe(409);
    expect(res.headers.get("X-RestoreAssist-Idempotency-Uncertain")).toBe("true");
    expect(store.observations).toHaveLength(rows);
    expect(store.audit).toHaveLength(audit);
  });

  it("refuses an action without an Idempotency-Key", async () => {
    const res = await post({ action: "acknowledge_notice", sessionId: "vs-1", spoken: true, recognitionMode: "cloud" }, "insp-1", null);
    expect(res.status).toBe(400);
    expect(store.observations).toHaveLength(0);
  });
});

describe("applicability", () => {
  it.each([["FIRE", true], ["fire", true], ["FIRE_SMOKE", true], ["WATER", false], [null, false]])(
    "claimType %s -> applicable %s",
    async (claimType, applicable) => {
      store.claimType = claimType;
      expect((await (await get()).json()).applicable).toBe(applicable);
    },
  );

  it("stays applicable once started, even after claimType is overwritten", async () => {
    await ack();
    await post({ action: "file", sessionId: "vs-1", sectionId: "services", transcript: "Gas off", routedBy: "technician_chose" });
    store.claimType = "HVAC";
    expect((await (await get()).json()).applicable).toBe(true);
  });

  it("is applicable when a fire assessment exists", async () => {
    store.claimType = "HVAC";
    store.fireAssessment = true;
    expect((await (await get()).json()).applicable).toBe(true);
  });

  it("GET tells Margot the first open section", async () => {
    const body = await (await get()).json();
    expect(body.nextSectionId).toBe("site_access");
    expect(body.nextPrompt.length).toBeGreaterThan(10);
  });
});
