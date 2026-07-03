/**
 * RA-6940 — paid-proxy gates on the HeyGen / ElevenLabs routes.
 *
 * These routes proxy to services that spend real money (avatar video, TTS,
 * SFX). A bare session used to be the only requirement; they must now also
 * enforce an active subscription (402 otherwise) and a fail-closed per-user
 * rate limit (429 when exceeded).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const applyRateLimit = vi.hoisted(() => vi.fn());
const requireActiveSubscription = vi.hoisted(() => vi.fn());
const generateAvatarVideo = vi.hoisted(() => vi.fn());
const getVideoStatus = vi.hoisted(() => vi.fn());
const generateVoice = vi.hoisted(() => vi.fn());
const streamVoice = vi.hoisted(() => vi.fn());
const listVoices = vi.hoisted(() => vi.fn());
const generateSFX = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...a: unknown[]) => applyRateLimit(...a),
}));
vi.mock("@/lib/billing/subscription-gate", () => ({
  requireActiveSubscription: (...a: unknown[]) =>
    requireActiveSubscription(...a),
}));
vi.mock("@/lib/synthex/client", () => ({
  generateAvatarVideo: (...a: unknown[]) => generateAvatarVideo(...a),
  getVideoStatus: (...a: unknown[]) => getVideoStatus(...a),
  generateVoice: (...a: unknown[]) => generateVoice(...a),
  streamVoice: (...a: unknown[]) => streamVoice(...a),
  listVoices: (...a: unknown[]) => listVoices(...a),
  withBrandVoice: (req: Record<string, unknown>) => ({
    ...req,
    voiceId: (req.voiceId as string) ?? "brand-voice",
  }),
}));
vi.mock("@/lib/elevenlabs/client", () => ({
  generateSFX: (...a: unknown[]) => generateSFX(...a),
}));

import { POST as heygenPost, GET as heygenGet } from "../route";
import { POST as voicePost } from "../../elevenlabs/voice/route";
import { POST as sfxPost } from "../../elevenlabs/sfx/route";

function makeReq(url: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest(
    `http://localhost${url}`,
    body
      ? {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }
      : undefined,
  );
}

const paymentRequired = () =>
  NextResponse.json(
    { error: "Active subscription required", upgradeRequired: true },
    { status: 402 },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  applyRateLimit.mockResolvedValue(null);
  requireActiveSubscription.mockResolvedValue(null);
});

describe("RA-6940 — paid proxy gates", () => {
  const cases: Array<{
    name: string;
    call: () => Promise<Response>;
  }> = [
    {
      name: "POST /api/heygen",
      call: () =>
        heygenPost(
          makeReq("/api/heygen", { script: "hello", avatar_id: "av1" }),
        ),
    },
    {
      name: "GET /api/heygen",
      call: () => heygenGet(makeReq("/api/heygen?video_id=v1")),
    },
    {
      name: "POST /api/elevenlabs/voice",
      call: () => voicePost(makeReq("/api/elevenlabs/voice", { text: "hi" })),
    },
    {
      name: "POST /api/elevenlabs/sfx",
      call: () =>
        sfxPost(makeReq("/api/elevenlabs/sfx", { description: "rain" })),
    },
  ];

  for (const { name, call } of cases) {
    it(`${name} returns 401 without a session`, async () => {
      getServerSession.mockResolvedValue(null);
      const res = await call();
      expect(res.status).toBe(401);
      expect(applyRateLimit).not.toHaveBeenCalled();
    });

    it(`${name} returns 402 without an active subscription`, async () => {
      requireActiveSubscription.mockResolvedValue(paymentRequired());
      const res = await call();
      expect(res.status).toBe(402);
      expect((await res.json()).upgradeRequired).toBe(true);
      // Gate must run before any provider spend.
      expect(generateAvatarVideo).not.toHaveBeenCalled();
      expect(generateVoice).not.toHaveBeenCalled();
      expect(generateSFX).not.toHaveBeenCalled();
      expect(getVideoStatus).not.toHaveBeenCalled();
    });

    it(`${name} returns 429 when the rate limiter blocks`, async () => {
      applyRateLimit.mockResolvedValue(
        NextResponse.json({ error: "Too many requests" }, { status: 429 }),
      );
      const res = await call();
      expect(res.status).toBe(429);
      expect(generateAvatarVideo).not.toHaveBeenCalled();
      expect(generateVoice).not.toHaveBeenCalled();
      expect(generateSFX).not.toHaveBeenCalled();
    });

    it(`${name} rate limits fail-closed, keyed per user`, async () => {
      await call();
      expect(applyRateLimit).toHaveBeenCalledTimes(1);
      const opts = applyRateLimit.mock.calls[0][1] as Record<string, unknown>;
      expect(opts.failClosedOnUpstashError).toBe(true);
      expect(opts.key).toBe("user-1");
    });
  }

  it("POST /api/heygen still proxies for an entitled user", async () => {
    generateAvatarVideo.mockResolvedValue({
      success: true,
      videoId: "v1",
      status: "pending",
      pollUrl: "/poll",
      pollInterval: 5,
    });
    const res = await heygenPost(
      makeReq("/api/heygen", { script: "hello", avatar_id: "av1" }),
    );
    expect(res.status).toBe(202);
    expect(generateAvatarVideo).toHaveBeenCalledTimes(1);
  });

  it("POST /api/elevenlabs/sfx still proxies for an entitled user", async () => {
    generateSFX.mockResolvedValue(Buffer.from("audio"));
    const res = await sfxPost(
      makeReq("/api/elevenlabs/sfx", { description: "rain" }),
    );
    expect(res.status).toBe(200);
    expect(generateSFX).toHaveBeenCalledTimes(1);
  });
});
