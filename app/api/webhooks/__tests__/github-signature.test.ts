/**
 * RA-6940 — wrong-length webhook signatures must 401, not throw.
 *
 * crypto.timingSafeEqual throws on buffers of different length, so any
 * x-hub-signature-256 header that wasn't exactly the right length turned
 * into a 500 (and GitHub retries on 5xx). A length pre-check now returns
 * false instead — length is not secret, the expected digest length is
 * public knowledge.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const appReleaseFindUnique = vi.hoisted(() => vi.fn());
const appReleaseCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appRelease: {
      findUnique: (...a: unknown[]) => appReleaseFindUnique(...a),
      create: (...a: unknown[]) => appReleaseCreate(...a),
    },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    notification: { createMany: vi.fn() },
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn() }));
vi.mock("@/lib/webhook-audit", () => ({ recordWebhookFailure: vi.fn() }));
vi.mock("@prisma/client", () => ({ NotificationType: { INFO: "INFO" } }));

import { POST } from "../github/route";

const SECRET = "webhook-test-secret";

function makeReq(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-github-event": "push",
  };
  if (signature !== undefined) {
    headers["x-hub-signature-256"] = signature;
  }
  return new NextRequest("http://localhost/api/webhooks/github", {
    method: "POST",
    body,
    headers,
  });
}

function sign(body: string): string {
  return (
    "sha256=" +
    crypto.createHmac("sha256", SECRET).update(body).digest("hex")
  );
}

beforeEach(() => {
  appReleaseFindUnique.mockReset();
  appReleaseCreate.mockReset();
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", SECRET);
});

describe("POST /api/webhooks/github signature handling", () => {
  it("returns 401 (not 500) for a wrong-length signature", async () => {
    const res = await POST(makeReq("{}", "sha256=deadbeef"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for an empty signature value", async () => {
    const res = await POST(makeReq("{}", ""));
    // Header present but empty string is falsy -> missing-signature branch;
    // a single space is a present-but-wrong-length value.
    const res2 = await POST(makeReq("{}", " "));
    expect([401]).toContain(res.status);
    expect(res2.status).toBe(401);
  });

  it("returns 401 for a correct-length but invalid signature", async () => {
    const wrong = "sha256=" + "0".repeat(64);
    const res = await POST(makeReq("{}", wrong));
    expect(res.status).toBe(401);
  });

  it("accepts a validly signed non-main push (ignored)", async () => {
    const body = JSON.stringify({ ref: "refs/heads/feature", commits: [] });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: "ignored — not main" });
  });
});
