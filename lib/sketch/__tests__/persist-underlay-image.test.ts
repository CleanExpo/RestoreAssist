import { describe, it, expect, vi } from "vitest";
import { persistUnderlayImage } from "../persist-underlay-image";

describe("persistUnderlayImage", () => {
  it("uploads a base64 data-URL underlay and returns the hosted public URL", async () => {
    const fakeBlob = { type: "image/png", size: 10 } as Blob;
    const toBlob = vi.fn(() => fakeBlob);
    const upload = vi.fn(async () => ({
      publicUrl: "https://cdn.example.com/inspections/abc/underlays/1.png",
    }));

    const result = await persistUnderlayImage(
      "data:image/png;base64,AAAA",
      "abc",
      { toBlob, upload },
    );

    expect(toBlob).toHaveBeenCalledWith("data:image/png;base64,AAAA");
    expect(upload).toHaveBeenCalledWith(fakeBlob, "abc");
    expect(result).toBe("https://cdn.example.com/inspections/abc/underlays/1.png");
  });

  it("passes an already-hosted https URL through unchanged without uploading", async () => {
    const toBlob = vi.fn();
    const upload = vi.fn();

    const url = "https://listings.example.com/floorplan.jpg";
    const result = await persistUnderlayImage(url, "abc", { toBlob, upload });

    expect(result).toBe(url);
    expect(toBlob).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("passes a data-URL through unchanged when there is no inspectionId to upload under", async () => {
    const toBlob = vi.fn();
    const upload = vi.fn();
    const dataUrl = "data:image/png;base64,AAAA";

    const result = await persistUnderlayImage(dataUrl, undefined, {
      toBlob,
      upload,
    });

    expect(result).toBe(dataUrl);
    expect(toBlob).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("propagates upload failures so the caller can surface an error", async () => {
    const upload = vi.fn(async () => {
      throw new Error("Storage upload failed: boom");
    });

    await expect(
      persistUnderlayImage("data:image/png;base64,AAAA", "abc", {
        toBlob: () => ({ type: "image/png", size: 10 } as Blob),
        upload,
      }),
    ).rejects.toThrow(/Storage upload failed/);
  });
});
