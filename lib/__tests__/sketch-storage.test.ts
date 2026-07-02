import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase client so we can assert the storage path without network.
const upload = vi.fn();
const getPublicUrl = vi.fn();
vi.mock("../supabase", () => ({
  supabase: {
    storage: {
      from: () => ({ upload, getPublicUrl }),
    },
  },
}));

import { uploadRenderedSketch } from "../sketch-storage";

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ error: null });
  getPublicUrl
    .mockReset()
    .mockReturnValue({ data: { publicUrl: "https://cdn/floor.png" } });
});

const png = () =>
  new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });

describe("uploadRenderedSketch", () => {
  it("uploads to a stable per-floor path so re-saves overwrite (no churn)", async () => {
    const r1 = await uploadRenderedSketch(png(), "insp1", 0);
    await uploadRenderedSketch(png(), "insp1", 0);

    expect(upload.mock.calls[0][0]).toBe("inspections/insp1/exports/floor-0.png");
    expect(upload.mock.calls[1][0]).toBe("inspections/insp1/exports/floor-0.png");
    expect(upload.mock.calls[0][2]).toMatchObject({ upsert: true });
    expect(r1.publicUrl).toBe("https://cdn/floor.png");
  });

  it("namespaces by floor number", async () => {
    await uploadRenderedSketch(png(), "insp1", 2);
    expect(upload.mock.calls[0][0]).toBe("inspections/insp1/exports/floor-2.png");
  });
});
