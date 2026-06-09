import { describe, expect, it } from "vitest";
import { ANZ_MATERIAL_OPTIONS } from "../material-options";
import { ANZ_MATERIALS } from "../materials";

describe("ANZ_MATERIAL_OPTIONS (offline-bundled picker fallback)", () => {
  it("mirrors the full ANZ materials library", () => {
    expect(ANZ_MATERIAL_OPTIONS).toHaveLength(ANZ_MATERIALS.length);
  });

  it("maps each material to the picker shape (slug/name/isPotentialAcm)", () => {
    const fibro = ANZ_MATERIAL_OPTIONS.find((m) => m.slug === "fibro");
    expect(fibro).toEqual({
      slug: "fibro",
      name: "Fibro (fibrous-cement / AC sheet)",
      isPotentialAcm: true,
    });
  });

  it("carries the ACM flags so the WHS gate works offline", () => {
    const acm = ANZ_MATERIAL_OPTIONS.filter((m) => m.isPotentialAcm).map(
      (m) => m.slug,
    );
    expect(acm).toContain("fibro");
    expect(acm).toContain("vinyl-tiles");
  });

  it("uses ANZ vocabulary, not US", () => {
    const names = ANZ_MATERIAL_OPTIONS.map((m) => m.name.toLowerCase()).join(
      " ",
    );
    expect(names).toContain("gyprock");
    expect(names).not.toContain("drywall");
  });
});
