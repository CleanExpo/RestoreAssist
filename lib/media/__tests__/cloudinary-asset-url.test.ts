import { afterEach, describe, expect, it, vi } from "vitest";
import {
  injectCloudinaryTransform,
  isAbsoluteMediaUrl,
  resolveMediaDeliveryUrl,
} from "../cloudinary-asset-url";

describe("cloudinary-asset-url", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects absolute URLs", () => {
    expect(isAbsoluteMediaUrl("https://res.cloudinary.com/x/image/upload/a.jpg")).toBe(
      true,
    );
    expect(isAbsoluteMediaUrl("inspection-photos/org/a")).toBe(false);
  });

  it("builds delivery URL from public_id when cloud name is set", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo-cloud");
    const url = resolveMediaDeliveryUrl("inspection-photos/org/job/photo", {
      width: 480,
    });
    expect(url).toContain("res.cloudinary.com/demo-cloud/image/upload/");
    expect(url).toContain("w_480");
    expect(url).toContain("inspection-photos/org/job/photo");
  });

  it("returns absolute URL as-is when no transform needed", () => {
    const abs = "https://cdn.example.com/photo.jpg";
    expect(resolveMediaDeliveryUrl(abs)).toBe(abs);
  });

  it("injects transforms into Cloudinary upload URLs", () => {
    const out = injectCloudinaryTransform(
      "https://res.cloudinary.com/demo/image/upload/v1/folder/pic.jpg",
      { width: 320, quality: "auto" },
    );
    expect(out).toBe(
      "https://res.cloudinary.com/demo/image/upload/w_320,q_auto,f_auto/v1/folder/pic.jpg",
    );
  });

  it("returns null for relative path when Cloudinary env missing", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "");
    vi.stubEnv("CLOUDINARY_URL", "");
    expect(resolveMediaDeliveryUrl("folder/pic")).toBeNull();
  });
});
