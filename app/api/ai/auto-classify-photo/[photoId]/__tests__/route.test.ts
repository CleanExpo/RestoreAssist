import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const inspectionPhotoFindFirst = vi.fn();
const inspectionPhotoUpdate = vi.fn();
const autoClassifyPhoto = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspectionPhoto: {
      findFirst: (...args: unknown[]) => inspectionPhotoFindFirst(...args),
      update: (...args: unknown[]) => inspectionPhotoUpdate(...args),
    },
  },
}));
vi.mock("@/lib/services/ai/auto-classify-photo", () => ({
  autoClassifyPhoto: (...args: unknown[]) => autoClassifyPhoto(...args),
}));

import { POST } from "../route";

const ORIGINAL_ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  inspectionPhotoFindFirst.mockReset();
  inspectionPhotoUpdate.mockReset();
  autoClassifyPhoto.mockReset();

  process.env.ANTHROPIC_API_KEY = "anthropic-key";
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  inspectionPhotoFindFirst.mockResolvedValue({
    id: "photo_1",
    url: "https://example.com/photo.jpg",
    mimeType: "image/jpeg",
  });
});

afterAll(() => {
  process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC_API_KEY;
});

function postRequest() {
  return new NextRequest(
    "http://localhost/api/ai/auto-classify-photo/photo_1",
    { method: "POST" },
  );
}

describe("POST /api/ai/auto-classify-photo/[photoId]", () => {
  it("does not expose configured key details when the platform key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const response = await POST(postRequest(), {
      params: Promise.resolve({ photoId: "photo_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body).toEqual({ error: "KEY_MISSING" });
  });

  it("does not expose provider failure details", async () => {
    autoClassifyPhoto.mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "provider failed with key sk-secret and stack trace",
    });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ photoId: "photo_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "API_ERROR" });
  });
});
