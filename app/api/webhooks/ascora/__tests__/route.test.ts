/**
 * RA-6977 — AscoraIntegration.webhookSecret decrypt-with-fallback.
 *
 * The Ascora webhook route read `webhookSecret` un-decrypted, unlike the
 * DR-NRPG webhook route which already decrypts via the credential vault with
 * a legacy-plaintext fallback (app/api/webhooks/dr-nrpg/route.ts). This mirrors
 * that pattern so HMAC verification works whether the stored secret is
 * AES-256-GCM ciphertext or legacy plaintext.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

process.env.NEXTAUTH_SECRET = "test-nextauth-secret-for-vault-fallback";

const ascoraIntegrationFindUnique = vi.fn();
const ascoraIntegrationUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ascoraIntegration: {
      findUnique: (...a: unknown[]) => ascoraIntegrationFindUnique(...a),
      update: (...a: unknown[]) => ascoraIntegrationUpdate(...a),
    },
  },
}));

vi.mock("@/lib/webhook-audit", () => ({
  recordWebhookFailure: vi.fn(),
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
import { encrypt } from "@/lib/credential-vault";

const INTEGRATION_ID = "integ-1";
const PLAINTEXT_SECRET = "test-ascora-plaintext-secret";

function makeRequest(payload: Record<string, unknown>, secret: string) {
  const body = JSON.stringify(payload);
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/ascora", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "x-ascora-integration-id": INTEGRATION_ID,
      "x-ascora-signature": `sha256=${digest}`,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ascoraIntegrationUpdate.mockResolvedValue({});
});

describe("POST /api/webhooks/ascora — webhookSecret decrypt-with-fallback (RA-6977)", () => {
  it("verifies HMAC when webhookSecret is stored as AES-256-GCM ciphertext", async () => {
    ascoraIntegrationFindUnique.mockResolvedValue({
      id: INTEGRATION_ID,
      userId: "user_1",
      webhookSecret: encrypt(PLAINTEXT_SECRET),
      isActive: true,
    });

    const res = await POST(
      makeRequest({ event: "job.updated", data: {} }, PLAINTEXT_SECRET),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ received: true, eventType: "job.updated" });
  });

  it("verifies HMAC when webhookSecret is stored as legacy plaintext", async () => {
    ascoraIntegrationFindUnique.mockResolvedValue({
      id: INTEGRATION_ID,
      userId: "user_1",
      webhookSecret: PLAINTEXT_SECRET,
      isActive: true,
    });

    const res = await POST(
      makeRequest({ event: "job.updated", data: {} }, PLAINTEXT_SECRET),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ received: true, eventType: "job.updated" });
  });

  it("rejects an incorrect signature even when webhookSecret is encrypted", async () => {
    ascoraIntegrationFindUnique.mockResolvedValue({
      id: INTEGRATION_ID,
      userId: "user_1",
      webhookSecret: encrypt(PLAINTEXT_SECRET),
      isActive: true,
    });

    const res = await POST(
      makeRequest({ event: "job.updated", data: {} }, "wrong-secret"),
    );

    expect(res.status).toBe(401);
  });
});
