/**
 * Text the Job In (S1) — POST /api/webhooks/messaging/[channel].
 *
 * Uses an in-memory Prisma whose where-matchers throw on unmodelled keys, so a
 * dropped tenancy clause cannot pass silently. Telegram is reached only
 * through a stubbed global fetch; every env value here is a fake literal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", async () => ({
  prisma: (await import("./fake-prisma")).fakePrisma,
}));

const recordWebhookFailure = vi.fn();
vi.mock("@/lib/webhook-audit", () => ({
  recordWebhookFailure: (...a: unknown[]) => recordWebhookFailure(...a),
}));

vi.mock("@/lib/api-errors", () => ({
  apiError: (
    _req: unknown,
    input: { code: string; message: string; status: number },
  ) =>
    new Response(
      JSON.stringify({ error: { code: input.code, message: input.message } }),
      { status: input.status, headers: { "Content-Type": "application/json" } },
    ),
}));

import { POST } from "../route";
import { fakePrisma, resetState, state, tick } from "./fake-prisma";
import { issueLinkCode } from "@/lib/messaging/link-codes";

const SECRET = "fake-webhook-secret";
const ORG_A = "org_a";
const ORG_B = "org_b";
const TECH_A = "user_tech_a";
const ADDRESS_A = "1001";

let updateId = 0;
let sent: Array<{ chat_id: string; text: string }> = [];

function update(text: string, opts: { from?: number; id?: number } = {}) {
  const id = opts.id ?? ++updateId;
  return {
    id,
    body: JSON.stringify({
      update_id: id,
      message: {
        message_id: id,
        text,
        from: { id: opts.from ?? Number(ADDRESS_A), is_bot: false },
        chat: { id: opts.from ?? Number(ADDRESS_A) },
      },
    }),
  };
}

async function post(
  body: string,
  opts: { secret?: string | null; channel?: string } = {},
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = opts.secret === undefined ? SECRET : opts.secret;
  if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
  const channel = opts.channel ?? "telegram";
  const req = new NextRequest(
    `http://localhost/api/webhooks/messaging/${channel}`,
    { method: "POST", body, headers },
  );
  return POST(req, { params: Promise.resolve({ channel }) });
}

async function text(t: string, opts: { from?: number; id?: number } = {}) {
  const u = update(t, opts);
  const res = await post(u.body);
  return { res, id: u.id, body: u.body };
}

function lastReply(): string {
  return sent[sent.length - 1]?.text ?? "";
}

function addInspection(row: {
  id: string;
  userId: string;
  number: string;
  technicianId?: string | null;
  status?: string;
  workspaceId?: string | null;
}) {
  state.inspections.push({
    id: row.id,
    userId: row.userId,
    technicianId: row.technicianId ?? null,
    workspaceId: row.workspaceId ?? null,
    inspectionNumber: row.number,
    propertyAddress: `${row.id} Street`,
    status: row.status ?? "SUBMITTED",
    updatedAt: tick(),
  });
}

function seed() {
  state.users.push(
    { id: TECH_A, organizationId: ORG_A, role: "USER" },
    { id: "user_owner_a", organizationId: ORG_A, role: "ADMIN" },
    { id: "user_b", organizationId: ORG_B, role: "USER" },
    { id: "user_solo", organizationId: null, role: "USER" },
  );
  state.identities.push({
    id: "mid_a",
    userId: TECH_A,
    channel: "telegram",
    address: ADDRESS_A,
    verifiedAt: new Date(),
  });
  addInspection({ id: "insp_a1", userId: TECH_A, number: "NIR-2026-09-AAA111" });
  // Org B's job names org A's technician. It must stay out of reach.
  addInspection({
    id: "insp_b1",
    userId: "user_b",
    number: "NIR-2026-09-BBB222",
    technicianId: TECH_A,
  });
}

beforeEach(() => {
  resetState();
  seed();
  sent = [];
  recordWebhookFailure.mockReset();
  process.env.TEXT_JOB_IN_ENABLED = "true";
  process.env.TELEGRAM_JOB_WEBHOOK_SECRET = SECRET;
  process.env.TELEGRAM_JOB_BOT_TOKEN = "fake-bot-token";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TEXT_JOB_IN_ENABLED;
  delete process.env.TELEGRAM_JOB_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_JOB_BOT_TOKEN;
});

describe("gatekeeping", () => {
  it("returns 404 and does nothing when the flag is off", async () => {
    delete process.env.TEXT_JOB_IN_ENABLED;
    const res = await post(update("NIR-2026-09-AAA111 wall 30%").body);
    expect(res.status).toBe(404);
    expect(state.messages).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("returns 404 for an unknown channel", async () => {
    const res = await post(update("hello").body, { channel: "carrier-pigeon" });
    expect(res.status).toBe(404);
  });

  it("returns 401 for a wrong secret and audits it", async () => {
    const res = await post(update("NIR-2026-09-AAA111 wall 30%").body, {
      secret: "not-the-secret",
    });
    expect(res.status).toBe(401);
    expect(recordWebhookFailure).toHaveBeenCalledTimes(1);
    expect(state.messages).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("returns 401 when the secret header is missing", async () => {
    const res = await post(update("hi").body, { secret: null });
    expect(res.status).toBe(401);
  });

  it("returns 401 when the server has no secret configured", async () => {
    delete process.env.TELEGRAM_JOB_WEBHOOK_SECRET;
    const res = await post(update("hi").body, { secret: "" });
    expect(res.status).toBe(401);
  });

  it("stores nothing for an unknown sender", async () => {
    const { res } = await text("NIR-2026-09-AAA111 wall 30%", { from: 9999 });
    expect(res.status).toBe(200);
    expect(state.messages).toHaveLength(0);
    expect(lastReply()).toMatch(/isn't linked/);
  });

  it("stores nothing for an identity that was never verified", async () => {
    state.identities[0].verifiedAt = null;
    await text("NIR-2026-09-AAA111 wall 30%");
    expect(state.messages).toHaveLength(0);
    expect(lastReply()).toMatch(/isn't linked/);
  });

  it("stores nothing for a user with no organisation", async () => {
    state.identities[0].userId = "user_solo";
    await text("NIR-2026-09-AAA111 wall 30%");
    expect(state.messages).toHaveLength(0);
    expect(lastReply()).toMatch(/isn't part of an organisation/);
  });

  it("ignores non-text updates", async () => {
    const res = await post(JSON.stringify({ update_id: 5, message: { photo: [] } }));
    expect(res.status).toBe(200);
    expect(state.messages).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});

describe("job matching", () => {
  it("files a note with a job number as a draft on that job", async () => {
    addInspection({ id: "insp_a2", userId: TECH_A, number: "NIR-2026-09-CCC333" });
    await text("nir-2026-09-aaa111 Bedroom carpet 35%");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      status: "draft",
      inspectionId: "insp_a1",
      organizationId: ORG_A,
      userId: TECH_A,
    });
    expect(lastReply()).toContain("Draft for NIR-2026-09-AAA111");
    expect(state.observations).toHaveLength(0);
  });

  it("uses the only active job when the note has no number", async () => {
    await text("Bedroom carpet 35%");
    expect(state.messages[0]).toMatchObject({
      status: "draft",
      inspectionId: "insp_a1",
    });
  });

  it("does not offer closed jobs", async () => {
    addInspection({
      id: "insp_a_closed",
      userId: TECH_A,
      number: "NIR-2026-09-ZZZ999",
      status: "CLOSED",
    });
    await text("NIR-2026-09-ZZZ999 wall 20%");
    expect(state.messages[0].inspectionId).toBeNull();
    expect(state.messages[0].status).toBe("unmatched");
  });

  it("offers the three most recent jobs and files the note on the pick", async () => {
    for (const n of ["C1", "C2", "C3"]) {
      addInspection({ id: `insp_${n}`, userId: TECH_A, number: `NIR-2026-09-${n}0000` });
    }
    await text("Bedroom carpet 35%");
    expect(state.messages[0].status).toBe("unmatched");
    const reply = lastReply();
    const lines = reply.split("\n").filter((l) => /^\d\. /.test(l));
    expect(lines).toEqual([
      "1. NIR-2026-09-C30000 - insp_C3 Street",
      "2. NIR-2026-09-C20000 - insp_C2 Street",
      "3. NIR-2026-09-C10000 - insp_C1 Street",
    ]);

    await text("2");
    const note = state.messages.find((m) => m.body === "Bedroom carpet 35%")!;
    expect(note).toMatchObject({ status: "draft", inspectionId: "insp_C2" });
    expect(lastReply()).toContain("Draft for NIR-2026-09-C20000");
  });
});

describe("tenancy", () => {
  it("cannot file against another organisation's job by number", async () => {
    await text("NIR-2026-09-BBB222 wall 30%");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].inspectionId).toBeNull();
    expect(state.messages[0].status).toBe("unmatched");
    expect(JSON.stringify(state.messages[0].parsed)).not.toContain("insp_b1");
    expect(lastReply()).not.toContain("BBB222 -");
  });

  it("does not count another organisation's job that names the sender", async () => {
    // Org A has one reachable job; org B's job lists TECH_A as technician.
    await text("wall 30%");
    expect(state.messages[0].inspectionId).toBe("insp_a1");
    expect(sent.map((s) => s.text).join("\n")).not.toContain("BBB222");
  });

  it("does not reach a same-organisation job the technician cannot open", async () => {
    addInspection({
      id: "insp_a_other",
      userId: "user_owner_a",
      number: "NIR-2026-09-OWN000",
    });
    await text("NIR-2026-09-OWN000 wall 30%");
    expect(state.messages[0].inspectionId).toBeNull();
  });

  it("refuses a pick that points at another organisation's job", async () => {
    state.messages.push({
      id: "msg_forged",
      organizationId: ORG_A,
      userId: TECH_A,
      inspectionId: null,
      channel: "telegram",
      externalId: "telegram:forged",
      body: "wall 30%",
      mediaRefs: [],
      parsed: {
        type: "general_note",
        parsed: { note: "wall 30%" },
        confidence: "low",
        candidateIds: ["insp_b1"],
      },
      status: "unmatched",
      createdAt: tick(),
      updatedAt: tick(),
    });
    await text("1");
    const forged = state.messages.find((m) => m.id === "msg_forged")!;
    expect(forged).toMatchObject({ status: "unmatched", inspectionId: null });
    expect(lastReply()).toMatch(/isn't on the list/);
  });

  it("cannot confirm a draft whose job is outside the sender's reach", async () => {
    state.messages.push({
      id: "msg_cross",
      organizationId: ORG_A,
      userId: TECH_A,
      inspectionId: "insp_b1",
      channel: "telegram",
      externalId: "telegram:cross",
      body: "wall 30%",
      mediaRefs: [],
      parsed: { type: "general_note", parsed: { note: "x" }, confidence: "low" },
      status: "draft",
      createdAt: tick(),
      updatedAt: tick(),
    });
    await text("yes");
    expect(state.messages.find((m) => m.id === "msg_cross")!.status).toBe("draft");
    expect(state.observations).toHaveLength(0);
    expect(state.sessions).toHaveLength(0);
  });
});

describe("confirm", () => {
  it("turns the draft into a confirmed observation on yes", async () => {
    await text("NIR-2026-09-AAA111 Bedroom carpet 35%");
    await text("Yes");
    const note = state.messages.find((m) => m.status !== "control")!;
    expect(note.status).toBe("confirmed");
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]).toMatchObject({
      inspectionId: "insp_a1",
      userId: TECH_A,
      mode: "text",
    });
    expect(state.observations).toHaveLength(1);
    expect(state.observations[0]).toMatchObject({
      sessionId: state.sessions[0].id,
      rawTranscript: "NIR-2026-09-AAA111 Bedroom carpet 35%",
      needsConfirmation: false,
    });
    expect(state.observations[0].confirmedAt).toBeInstanceOf(Date);
    expect(lastReply()).toContain("Saved to NIR-2026-09-AAA111");
  });

  it("accepts a thumbs-up with a skin tone", async () => {
    await text("NIR-2026-09-AAA111 wall 30%");
    await text("\u{1F44D}\u{1F3FD}");
    expect(state.observations).toHaveLength(1);
  });

  it("leaves the draft alone when the reply is anything else", async () => {
    await text("NIR-2026-09-AAA111 wall 30%");
    await text("actually hold on");
    const first = state.messages.find((m) => m.body === "NIR-2026-09-AAA111 wall 30%")!;
    expect(first.status).toBe("draft");
    expect(state.observations).toHaveLength(0);
  });

  it("says so when there is nothing to confirm", async () => {
    await text("y");
    expect(state.observations).toHaveLength(0);
    expect(lastReply()).toMatch(/no draft waiting/);
  });
});

describe("idempotency", () => {
  it("does not store or reply twice for a redelivered note", async () => {
    const first = await text("NIR-2026-09-AAA111 wall 30%");
    const again = await post(first.body);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ duplicate: true });
    expect(state.messages).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("treats a unique-index race as a duplicate", async () => {
    const first = await text("NIR-2026-09-AAA111 wall 30%");
    vi.spyOn(fakePrisma.inboundJobMessage, "findUnique").mockResolvedValueOnce(null);
    const again = await post(first.body);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ duplicate: true });
    expect(state.messages).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("a replayed yes cannot confirm a second draft", async () => {
    await text("NIR-2026-09-AAA111 first reading 30%");
    const yes = await text("yes");
    await text("NIR-2026-09-AAA111 second reading 40%");
    const replay = await post(yes.body);
    expect(replay.status).toBe(200);
    const second = state.messages.find((m) => m.body.includes("second reading"))!;
    expect(second.status).toBe("draft");
    expect(state.observations).toHaveLength(1);
    expect(state.observations[0].rawTranscript).toContain("first reading");
  });

  it("returns 500 when the message cannot be claimed, so it is redelivered", async () => {
    vi.spyOn(fakePrisma.inboundJobMessage, "create").mockRejectedValueOnce(
      new Error("db down"),
    );
    const { res } = await text("NIR-2026-09-AAA111 wall 30%");
    expect(res.status).toBe(500);
    expect(recordWebhookFailure).toHaveBeenCalled();
  });
});

describe("linking", () => {
  const ADDRESS_NEW = 2002;

  it("links a chat with a valid code, once", async () => {
    const { code } = await issueLinkCode("user_owner_a");
    await text(`link ${code.toLowerCase()}`, { from: ADDRESS_NEW });
    const identity = state.identities.find((i) => i.address === String(ADDRESS_NEW));
    expect(identity).toMatchObject({ userId: "user_owner_a", channel: "telegram" });
    expect(identity!.verifiedAt).toBeInstanceOf(Date);
    expect(lastReply()).toMatch(/^Linked/);
    expect(state.messages).toHaveLength(0);
    expect(state.tokens).toHaveLength(0);

    await text(`link ${code}`, { from: 3003 });
    expect(state.identities.find((i) => i.address === "3003")).toBeUndefined();
    expect(lastReply()).toMatch(/didn't work/);
  });

  it("rejects an expired code", async () => {
    const { code } = await issueLinkCode("user_owner_a");
    state.tokens[0].expires = new Date(Date.now() - 1000);
    await text(`link ${code}`, { from: ADDRESS_NEW });
    expect(state.identities.find((i) => i.address === String(ADDRESS_NEW))).toBeUndefined();
    expect(lastReply()).toMatch(/didn't work/);
  });

  it("rejects an unknown code", async () => {
    await text("link ABCDEFGH", { from: ADDRESS_NEW });
    expect(state.identities).toHaveLength(1);
  });

  it("replaces an earlier unused code when a new one is issued", async () => {
    const first = await issueLinkCode("user_owner_a");
    await issueLinkCode("user_owner_a");
    expect(state.tokens).toHaveLength(1);
    await text(`link ${first.code}`, { from: ADDRESS_NEW });
    expect(lastReply()).toMatch(/didn't work/);
  });
});
