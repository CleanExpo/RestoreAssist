import { describe, expect, it, vi, beforeEach } from "vitest";

const uploadToCloudinary = vi.fn();
const deleteImage = vi.fn();

vi.mock("@/lib/cloudinary", () => ({
  uploadToCloudinary: (...a: unknown[]) => uploadToCloudinary(...a),
  deleteImage: (...a: unknown[]) => deleteImage(...a),
}));

import { CloudinaryStorageProvider } from "../cloudinary-provider";

beforeEach(() => {
  uploadToCloudinary.mockReset();
  deleteImage.mockReset();
});

describe("CloudinaryStorageProvider.upload", () => {
  it("uploads to Cloudinary and maps URLs into UploadOutput", async () => {
    uploadToCloudinary.mockResolvedValue({
      url: "https://res.cloudinary.com/demo/image/upload/v1/inspection-photos/org/insp/a.jpg",
      thumbnailUrl:
        "https://res.cloudinary.com/demo/image/upload/c_limit,w_300/inspection-photos/org/insp/a.jpg",
      publicId: "inspection-photos/org/insp/a",
      width: 800,
      height: 600,
      format: "jpg",
    });

    const out = await new CloudinaryStorageProvider().upload({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      filename: "site.jpg",
      mimeType: "image/jpeg",
      folder: "inspections/insp_1",
      orgId: "org_1",
      inspectionId: "insp_1",
    });

    expect(uploadToCloudinary).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        folder: "inspection-photos/org_1/insp_1",
        resource_type: "image",
      }),
    );
    expect(out.compressedUrl).toContain("res.cloudinary.com");
    expect(out.thumbnailUrl).toContain("res.cloudinary.com");
    expect(out.storagePath).toBe("inspection-photos/org/insp/a");
    expect(out.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
