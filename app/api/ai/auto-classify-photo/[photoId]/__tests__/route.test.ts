import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const inspectionPhotoFindFirst = vi.fn();
const inspectionPhotoUpdate = vi.fn();
const autoClassifyPhoto = vi.fn();
const resolveWorkspaceAiKey = vi.fn();

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
vi.mock("@/lib/ai/resolve-workspace-ai-key", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/ai/resolve-workspace-ai-key")
  >("@/lib/ai/resolve-workspace-ai-key");
  return {
    ...actual,
    resolveWorkspaceAiKey: (...args: unknown[]) =>
      resolveWorkspaceAiKey(...args),
  };
});

import { POST } from "../route";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  inspectionPhotoFindFirst.mockReset();
  inspectionPhotoUpdate.mockReset();
  autoClassifyPhoto.mockReset();
  resolveWorkspaceAiKey.mockReset();

  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "anthropic-key",
  });
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  inspectionPhotoFindFirst.mockResolvedValue({
    id: "photo_1",
    url: "https://example.com/photo.jpg",
    mimeType: "image/jpeg",
  });
});

function postRequest() {
  return new NextRequest(
    "http://localhost/api/ai/auto-classify-photo/photo_1",
    { method: "POST" },
  );
}

describe("POST /api/ai/auto-classify-photo/[photoId]", () => {
  it("does not expose configured key details when no workspace key is configured", async () => {
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC"),
    );

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
