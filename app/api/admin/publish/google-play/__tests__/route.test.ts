import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());
const verifyStorePublishingOperator = vi.hoisted(() => vi.fn());
const androidpublisher = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
  verifyStorePublishingOperator: (...args: unknown[]) =>
    verifyStorePublishingOperator(...args),
}));
vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: class GoogleAuth {} },
    androidpublisher: (...args: unknown[]) => androidpublisher(...args),
  },
}));

import { GET, POST } from "../route";

const insert = vi.fn();
const trackGet = vi.fn();
const trackUpdate = vi.fn();
const commit = vi.fn();
const deleteEdit = vi.fn();

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  verifyStorePublishingOperator.mockReset();
  androidpublisher.mockReset();
  insert.mockReset();
  trackGet.mockReset();
  trackUpdate.mockReset();
  commit.mockReset();
  deleteEdit.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "operator_1" } });
  verifyAdminFromDb.mockResolvedValue({
    user: { id: "operator_1", role: "ADMIN", organizationId: "org_1" },
  });
  verifyStorePublishingOperator.mockImplementation((auth) => auth);
  vi.stubEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "{}");
  androidpublisher.mockReturnValue({
    edits: {
      insert,
      tracks: { get: trackGet, update: trackUpdate },
      commit,
      delete: deleteEdit,
    },
  });
});

describe("Google Play publishing authorization", () => {
  it("returns the operator guard response before touching Google Play", async () => {
    verifyStorePublishingOperator.mockReturnValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/admin/publish/google-play"),
    );

    expect(response.status).toBe(403);
    expect(verifyAdminFromDb).toHaveBeenCalledTimes(1);
    expect(androidpublisher).not.toHaveBeenCalled();
  });

  it("rejects an unknown track before opening an edit", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/admin/publish/google-play?track=canary",
      ),
    );

    expect(response.status).toBe(400);
    expect(androidpublisher).not.toHaveBeenCalled();
  });

  it("promotes only between allowlisted tracks", async () => {
    insert.mockResolvedValueOnce({ data: { id: "edit_1" } });
    trackGet.mockResolvedValueOnce({
      data: { releases: [{ versionCodes: ["101"] }] },
    });
    trackUpdate.mockResolvedValueOnce({ data: {} });
    commit.mockResolvedValueOnce({ data: { expiryTimeSeconds: "123" } });

    const response = await POST(
      new NextRequest("http://localhost/api/admin/publish/google-play", {
        method: "POST",
        body: JSON.stringify({ fromTrack: "internal", toTrack: "beta" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(trackGet).toHaveBeenCalledWith({
      packageName: "com.restoreassist.app",
      editId: "edit_1",
      track: "internal",
    });
    expect(trackUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        packageName: "com.restoreassist.app",
        editId: "edit_1",
        track: "beta",
      }),
    );
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
