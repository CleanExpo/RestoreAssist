import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// STORM T2 — authority-form signing (Margaret, homeowner signer on mobile).
// Locks the dual-submit idempotency: the atomic `updateMany WHERE signedAt IS NULL`
// must reject a second/concurrent submission so a form can never be signed twice.

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null), // not rate-limited
  getClientIp: vi.fn().mockReturnValue("1.2.3.4"),
}));
vi.mock("@/lib/auth/botid", () => ({
  verifyBotId: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_req: unknown, opts: { message: string; status: number }) =>
    new Response(JSON.stringify({ error: opts.message }), {
      status: opts.status,
      headers: { "content-type": "application/json" },
    }),
}));

const sigFindUnique = vi.fn();
const sigUpdateMany = vi.fn();
const sigCount = vi.fn();
const instanceUpdate = vi.fn();
const instanceFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorityFormSignature: {
      findUnique: (...a: unknown[]) => sigFindUnique(...a),
      updateMany: (...a: unknown[]) => sigUpdateMany(...a),
      count: (...a: unknown[]) => sigCount(...a),
    },
    authorityFormInstance: {
      update: (...a: unknown[]) => instanceUpdate(...a),
      findUnique: (...a: unknown[]) => instanceFindUnique(...a),
    },
  },
}));

import { POST } from "../route";

const VALID_TOKEN = "11111111-1111-4111-8111-111111111111";

function postReq(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/authority-forms/sign/${VALID_TOKEN}`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
  );
}
const ctx = (token = VALID_TOKEN) => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  sigFindUnique.mockReset();
  sigUpdateMany.mockReset();
  sigCount.mockReset();
  instanceUpdate.mockReset();
  instanceFindUnique.mockReset();
});

describe("POST /api/authority-forms/sign/[token]", () => {
  it("rejects an invalid token with 404", async () => {
    const res = await POST(postReq({ signatureData: "x" }), {
      params: Promise.resolve({ token: "not-a-uuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a missing signature with 400", async () => {
    const res = await POST(postReq({}), ctx());
    expect(res.status).toBe(400);
  });

  it("signs successfully on the first submission (atomic guard on signedAt=null)", async () => {
    sigFindUnique
      .mockResolvedValueOnce({ id: "s_1", instanceId: "f_1", signatoryName: "Margaret" })
      .mockResolvedValueOnce({ id: "s_1", instanceId: "f_1" });
    sigUpdateMany.mockResolvedValueOnce({ count: 1 });
    sigCount.mockResolvedValueOnce(0); // no remaining unsigned → form complete
    instanceUpdate.mockResolvedValueOnce({});

    const res = await POST(postReq({ signatureData: "data:image/png;base64,AA" }), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, allSigned: true, formId: "f_1" });

    // The guard must scope the write to an unsigned row.
    expect(sigUpdateMany.mock.calls[0][0].where).toMatchObject({
      id: "s_1",
      signedAt: null,
    });
  });

  it("rejects a duplicate/concurrent second submission with 400 (idempotent)", async () => {
    sigFindUnique.mockResolvedValueOnce({ id: "s_1", instanceId: "f_1", signatoryName: "Margaret" });
    sigUpdateMany.mockResolvedValueOnce({ count: 0 }); // already signed — guard matched 0 rows

    const res = await POST(postReq({ signatureData: "data:image/png;base64,AA" }), ctx());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/already been signed/i);
    // No completion side-effects fire on a rejected duplicate.
    expect(instanceUpdate).not.toHaveBeenCalled();
  });
});
