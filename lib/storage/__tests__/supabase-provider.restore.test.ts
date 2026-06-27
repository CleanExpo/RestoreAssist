import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupabaseStorageProvider } from "@/lib/storage/supabase-provider";
import { BUCKET_ORIGINALS } from "@/lib/storage/types";

const { uploadMock, listMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    storage: {
      from: () => ({ upload: uploadMock, list: listMock }),
    },
  }),
}));

describe("SupabaseStorageProvider restore helpers", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    listMock.mockReset();
  });

  it("exists() returns true when list finds the file", async () => {
    listMock.mockResolvedValue({ data: [{ name: "photo.jpg" }], error: null });
    const p = new SupabaseStorageProvider();
    await expect(p.exists("org1/insp1/photo.jpg")).resolves.toBe(true);
  });

  it("exists() returns false when list is empty", async () => {
    listMock.mockResolvedValue({ data: [], error: null });
    const p = new SupabaseStorageProvider();
    await expect(p.exists("org1/insp1/photo.jpg")).resolves.toBe(false);
  });

  it("restoreToPath() uploads to the exact path with contentType", async () => {
    uploadMock.mockResolvedValue({ error: null });
    const p = new SupabaseStorageProvider();
    await p.restoreToPath("org1/insp1/photo.jpg", Buffer.from("x"), "image/jpeg", { upsert: false });
    expect(uploadMock).toHaveBeenCalledWith(
      "org1/insp1/photo.jpg",
      expect.any(Buffer),
      { contentType: "image/jpeg", upsert: false },
    );
  });

  it("restoreToPath() throws on supabase error", async () => {
    uploadMock.mockResolvedValue({ error: { message: "boom" } });
    const p = new SupabaseStorageProvider();
    await expect(
      p.restoreToPath("p", Buffer.from("x"), "image/jpeg"),
    ).rejects.toThrow(/boom/);
  });
});
