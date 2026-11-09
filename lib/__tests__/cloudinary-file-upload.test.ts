import { describe, it, expect, vi, beforeEach } from "vitest";

const upload = vi.fn();
vi.mock("cloudinary", () => ({
  v2: { config: vi.fn(), uploader: { upload: (...a: unknown[]) => upload(...a) } },
}));

import { uploadFileToCloudinary } from "../cloudinary";

beforeEach(() => {
  upload.mockReset();
  upload.mockResolvedValue({ secure_url: "https://x/y", public_id: "p", format: "mp4" });
  process.env.CLOUDINARY_CLOUD_NAME = "demo";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
});

describe("uploadFileToCloudinary", () => {
  it("never overwrites an existing asset", async () => {
    await uploadFileToCloudinary(Buffer.from("a"), "clip.mov", "video/quicktime", "f");
    expect(upload.mock.calls[0][1]).toMatchObject({ overwrite: false });
  });

  it("uses the caller's immutable public id instead of the filename", async () => {
    await uploadFileToCloudinary(Buffer.from("a"), "clip.mov", "video/quicktime", "f", {
      publicId: "abc123",
    });
    expect(upload.mock.calls[0][1]).toMatchObject({ public_id: "abc123" });
  });
});
