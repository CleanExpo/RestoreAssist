/**
 * RA-8589 — an unsigned signing link expires 14 days after it was sent, and an
 * expired link gets exactly the reply an unknown token gets.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/auth/botid", () => ({
  verifyBotId: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/authority-forms/notify-signatory-copy", () => ({
  notifySignatoryOfSignedCopy: vi.fn(async () => undefined),
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

const sigFindUnique = vi.fn();
const sigUpdateMany = vi.fn();
const sigCount = vi.fn();
const instanceFindUnique = vi.fn();
const instanceUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorityFormSignature: {
      findUnique: (...a: unknown[]) => sigFindUnique(...a),
      updateMany: (...a: unknown[]) => sigUpdateMany(...a),
      count: (...a: unknown[]) => sigCount(...a),
    },
    authorityFormInstance: {
      findUnique: (...a: unknown[]) => instanceFindUnique(...a),
      update: (...a: unknown[]) => instanceUpdate(...a),
    },
  },
}));

import { GET, POST } from "../route";

const TOKEN = "12345678-1234-4123-8abc-1234567890ab";
const DAY = 86_400_000;
const ctx = () => ({ params: Promise.resolve({ token: TOKEN }) });
const getReq = () =>
  new NextRequest(`http://localhost/api/authority-forms/sign/${TOKEN}`);
const postReq = () =>
  new NextRequest(`http://localhost/api/authority-forms/sign/${TOKEN}`, {
    method: "POST",
    headers: { origin: "http://localhost" },
    body: JSON.stringify({ signatureData: "data:image/png;base64,AA" }),
  });

function row(sentDaysAgo: number | null) {
  return {
    id: "s_1",
    instanceId: "f_1",
    signatoryName: "Margaret",
    signatoryRole: "CLIENT",
    signatoryEmail: "margaret@example.com",
    signedAt: null,
    signatureRequestSentAt:
      sentDaysAgo === null ? null : new Date(Date.now() - sentDaysAgo * DAY),
    instance: {
      id: "f_1",
      status: "PENDING_SIGNATURES",
      template: { name: "Authority to Proceed", code: "ATP" },
      signatures: [],
    },
  };
}

async function unknownTokenReply(handler: typeof GET | typeof POST) {
  sigFindUnique.mockResolvedValueOnce(null);
  const res = await handler(handler === GET ? getReq() : postReq(), ctx());
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/authority-forms/sign/[token] — expiry (RA-8589)", () => {
  it("serves a link sent 13 days ago", async () => {
    sigFindUnique.mockResolvedValueOnce(row(13));
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(200);
  });

  it("refuses a link sent 15 days ago with the unknown-token reply", async () => {
    const unknown = await unknownTokenReply(GET);
    sigFindUnique.mockResolvedValueOnce(row(15));
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(unknown.status);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe(unknown.body.error.code);
    expect(body.error.message).toBe(unknown.body.error.message);
  });

  it("refuses a token that was never stamped as sent", async () => {
    sigFindUnique.mockResolvedValueOnce(row(null));
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(404);
  });
});

describe("POST /api/authority-forms/sign/[token] — expiry (RA-8589)", () => {
  it("refuses an expired link before any write", async () => {
    const unknown = await unknownTokenReply(POST);
    sigFindUnique.mockResolvedValueOnce(row(15));
    const res = await POST(postReq(), ctx());
    expect(res.status).toBe(unknown.status);
    const body = await res.json();
    expect(body.error.code).toBe(unknown.body.error.code);
    expect(body.error.message).toBe(unknown.body.error.message);
    expect(sigUpdateMany).not.toHaveBeenCalled();
    expect(instanceUpdate).not.toHaveBeenCalled();
  });

  it("the signature write itself requires a live link", async () => {
    sigFindUnique.mockResolvedValueOnce(row(1));
    sigUpdateMany.mockResolvedValueOnce({ count: 0 });
    await POST(postReq(), ctx());
    const where = sigUpdateMany.mock.calls[0][0].where;
    expect(where.signatureRequestSentAt.gt).toBeInstanceOf(Date);
    const cutoffAge = Date.now() - where.signatureRequestSentAt.gt.getTime();
    expect(Math.round(cutoffAge / DAY)).toBe(14);
  });
});
