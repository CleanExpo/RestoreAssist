/**
 * Guard: Margot voice is RestoreAssist staff only. Every self-registered
 * business owner is an ADMIN, so verifyAdminFromDb alone let any customer
 * spend the route. verifyPlatformSupportOperator must follow it, as on the
 * other Margot routes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());
const textToSpeech = vi.hoisted(() => vi.fn());
const resolveWorkspaceElevenLabsKey = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return {
    verifyAdminFromDb: (...a: unknown[]) => verifyAdminFromDb(...a),
    verifyPlatformSupportOperator: actual.verifyPlatformSupportOperator,
  };
});
vi.mock("@/lib/elevenlabs/client", () => ({
  textToSpeech: (...a: unknown[]) => textToSpeech(...a),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceElevenLabsKey: (...a: unknown[]) =>
    resolveWorkspaceElevenLabsKey(...a),
  NoWorkspaceKeyError: class extends Error {},
}));

import { POST } from "../route";

function req() {
  return new NextRequest("http://localhost/api/margot/voice", {
    method: "POST",
    body: JSON.stringify({ text: "hello" }),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PLATFORM_SUPPORT_USER_IDS = "staff-1";
  getServerSession.mockResolvedValue({ user: { id: "owner-1" } });
});

describe("POST /api/margot/voice operator gate", () => {
  it("returns 403 to a business-owner ADMIN who is not a platform operator", async () => {
    verifyAdminFromDb.mockResolvedValue({
      user: { id: "owner-1", role: "ADMIN", organizationId: "org-1" },
    });
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(resolveWorkspaceElevenLabsKey).not.toHaveBeenCalled();
    expect(textToSpeech).not.toHaveBeenCalled();
  });

  it("lets a platform operator through to synthesis", async () => {
    verifyAdminFromDb.mockResolvedValue({
      user: { id: "staff-1", role: "ADMIN", organizationId: "org-1" },
    });
    resolveWorkspaceElevenLabsKey.mockResolvedValue({
      apiKey: "k",
      voiceId: "v",
    });
    textToSpeech.mockResolvedValue(Buffer.from([1, 2, 3]));
    const res = await POST(req());
    expect(res.status).toBe(200);
  });
});
