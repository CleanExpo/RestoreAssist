// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const compressImageForUpload = vi.fn();
vi.mock("../image-compression", () => ({
  compressImageForUpload: (...args: unknown[]) => compressImageForUpload(...args),
}));

import { prepareInspectionPhoto, uploadInspectionPhoto } from "../inspection-photo-upload";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("prepareInspectionPhoto", () => {
  it("preserves a normal JPEG without transcoding", async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "room.jpg", { type: "image/jpeg" });
    expect(await prepareInspectionPhoto(file)).toBe(file);
    expect(compressImageForUpload).not.toHaveBeenCalled();
  });

  it("converts an iPhone HEIC selection into supported WebP bytes and extension", async () => {
    const file = new File(["synthetic HEIC"], "room.heic", { type: "image/heic" });
    const webp = new Blob(["synthetic WebP"], { type: "image/webp" });
    compressImageForUpload.mockResolvedValue({ blob: webp, format: "image/webp", skipped: false });
    const result = await prepareInspectionPhoto(file);
    expect(result.name).toBe("room.webp");
    expect(result.type).toBe("image/webp");
    expect(await result.text()).toBe("synthetic WebP");
  });

  it("uses PNG bytes and extension when an iPhone browser cannot encode WebP", async () => {
    const file = new File(["synthetic HEIC"], "room.heic", { type: "image/heic" });
    const png = new Blob(["synthetic PNG"], { type: "image/png" });
    compressImageForUpload.mockResolvedValue({ blob: png, format: "image/png", skipped: false });
    const result = await prepareInspectionPhoto(file);
    expect(result.name).toBe("room.png");
    expect(result.type).toBe("image/png");
    expect(await result.text()).toBe("synthetic PNG");
  });

  it.each(["", "application/octet-stream"])("sends a HEIC selection with MIME %s to the image decoder", async (type) => {
    const file = new File(["synthetic HEIC"], "room.heic", { type });
    const webp = new Blob(["synthetic WebP"], { type: "image/webp" });
    compressImageForUpload.mockResolvedValue({ blob: webp, format: "image/webp", skipped: false });
    const result = await prepareInspectionPhoto(file);
    expect(compressImageForUpload).toHaveBeenCalledWith(expect.objectContaining({ type: "image/heic" }));
    expect(result.name).toBe("room.webp");
    expect(result.type).toBe("image/webp");
  });

  it("stops before POST when the browser cannot decode HEIC", async () => {
    const file = new File(["synthetic HEIC"], "room.heif", { type: "image/heif" });
    compressImageForUpload.mockResolvedValue({ blob: file, format: "image/heif", skipped: true });
    await expect(prepareInspectionPhoto(file)).rejects.toThrow(/could not convert/i);
  });
});

describe("uploadInspectionPhoto", () => {
  it("requires durable same-inspection readback before reporting a saved photo", async () => {
    const file = new File(["synthetic"], "room.jpg", { type: "image/jpeg" });
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ photo: { id: "p1" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ photos: [{ id: "p1", url: "signed" }] }) });
    const result = await uploadInspectionPhoto("inspection-1", file, "selection-1", fetcher);
    expect(result).toMatchObject({ id: "p1", url: "signed" });
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/inspections/inspection-1/photos", expect.objectContaining({
      method: "POST", headers: { "Idempotency-Key": "selection-1" },
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/inspections/inspection-1/photos", expect.objectContaining({ cache: "no-store" }));
  });

  it("does not claim success when persistence readback fails", async () => {
    const file = new File(["synthetic"], "room.jpg", { type: "image/jpeg" });
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ photo: { id: "p1" } }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(uploadInspectionPhoto("inspection-1", file, "selection-1", fetcher)).rejects.toThrow(/verify/i);
  });

  it("keeps a selected photo pending when readback has no usable media URL", async () => {
    const file = new File(["synthetic"], "room.jpg", { type: "image/jpeg" });
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ photo: { id: "p1" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ photos: [{ id: "p1", url: " " }] }) });
    await expect(uploadInspectionPhoto("inspection-1", file, "selection-1", fetcher)).rejects.toThrow(/verify/i);
  });

  it("reports the server rejection without a false success", async () => {
    const file = new File(["synthetic"], "room.jpg", { type: "image/jpeg" });
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: "Unsupported image" } }) });
    await expect(uploadInspectionPhoto("inspection-1", file, "selection-1", fetcher)).rejects.toThrow(/Unsupported image/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
