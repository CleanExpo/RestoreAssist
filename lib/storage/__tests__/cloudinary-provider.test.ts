import { describe, expect, it, vi, beforeEach } from "vitest";

const uploadToCloudinary = vi.fn();
const uploadFileToCloudinary = vi.fn();
const deleteImage = vi.fn();

vi.mock("@/lib/cloudinary", () => ({
  uploadToCloudinary: (...a: unknown[]) => uploadToCloudinary(...a),
  uploadFileToCloudinary: (...a: unknown[]) => uploadFileToCloudinary(...a),
  deleteImage: (...a: unknown[]) => deleteImage(...a),
}));

import { CloudinaryStorageProvider } from "../cloudinary-provider";

beforeEach(() => {
  uploadToCloudinary.mockReset();
  uploadFileToCloudinary.mockReset();
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

  it("routes originalsOnly uploads into the client-evidence quarantine folder", async () => {
    uploadToCloudinary.mockResolvedValue({
      url: "https://res.cloudinary.com/demo/image/upload/v1/q.jpg",
      thumbnailUrl: "https://res.cloudinary.com/demo/image/upload/v1/q.jpg",
      publicId: "client-evidence-quarantine/org/insp/q",
      width: 100,
      height: 100,
      format: "jpg",
    });

    await new CloudinaryStorageProvider().upload({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      filename: "client.jpg",
      mimeType: "image/jpeg",
      folder: "evidence",
      orgId: "org_1",
      inspectionId: "insp_1",
      originalsOnly: true,
    });

    expect(uploadToCloudinary).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        folder: "client-evidence-quarantine/org_1/insp_1",
      }),
    );
  });

  it("uploads non-image evidence via uploadFileToCloudinary", async () => {
    uploadFileToCloudinary.mockResolvedValue({
      url: "https://res.cloudinary.com/demo/raw/upload/v1/doc.pdf",
      publicId: "inspection-photos/org/insp/doc",
      format: "pdf",
    });

    const out = await new CloudinaryStorageProvider().upload({
      buffer: Buffer.from("%PDF-1.4"),
      filename: "scope.pdf",
      mimeType: "application/pdf",
      folder: "evidence",
      orgId: "org_1",
      inspectionId: "insp_1",
    });

    expect(uploadToCloudinary).not.toHaveBeenCalled();
    expect(uploadFileToCloudinary).toHaveBeenCalled();
    expect(out.compressedUrl).toContain("doc.pdf");
  });
});
