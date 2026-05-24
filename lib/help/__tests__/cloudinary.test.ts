import { describe, it, expect } from "vitest";
import { cloudinaryUrl } from "../cloudinary";

describe("cloudinaryUrl", () => {
  it("builds a basic URL from public id + cloud name", () => {
    const url = cloudinaryUrl("ra-help/getting-started/hero", {
      cloudName: "test-cloud",
    });
    expect(url).toBe(
      "https://res.cloudinary.com/test-cloud/image/upload/ra-help/getting-started/hero",
    );
  });

  it("applies width transform", () => {
    const url = cloudinaryUrl("ra-help/hero", { cloudName: "c", width: 1200 });
    expect(url).toBe(
      "https://res.cloudinary.com/c/image/upload/w_1200/ra-help/hero",
    );
  });

  it("applies multiple transforms", () => {
    const url = cloudinaryUrl("ra-help/hero", {
      cloudName: "c",
      width: 1200,
      quality: "auto",
      format: "auto",
    });
    expect(url).toBe(
      "https://res.cloudinary.com/c/image/upload/w_1200,q_auto,f_auto/ra-help/hero",
    );
  });
});
