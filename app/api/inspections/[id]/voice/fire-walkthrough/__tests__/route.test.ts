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
}));
const gate = vi.hoisted(() => ({ refuse: false, scopeLost: false }));
const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }));

vi.mock("next-auth", () => auth);
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const prisma = {
    inspection: {
      findFirst: async () => ({ id: "insp-1", claimType: store.claimType }),
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
    writeWithinInspectionScope: async (_s: unknown, _d: unknown, work: (tx: unknown) => unknown) =>
      gate.scopeLost ? null : work(prisma),
  };
});
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (req: NextRequest, _u: string, handler: (raw: string) => Promise<Response>) =>
    handler(await req.text()),
}));

import { GET, POST } from "../route";
import { FIRE_SECTION_IDS } from "@/lib/voice/fire-smoke/checklist";

const ctx = (id = "insp-1") => ({ params: Promise.resolve({ id }) });
const url = (id = "insp-1") => `http://localhost/api/inspections/${id}/voice/fire-walkthrough`;

function post(body: unknown, id = "insp-1") {
  return POST(
    new NextRequest(url(id), {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
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
  gate.refuse = false;
  gate.scopeLost = false;
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
