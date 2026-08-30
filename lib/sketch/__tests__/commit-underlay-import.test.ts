import { describe, expect, it, vi } from "vitest";
import { commitUnderlayImport } from "../commit-underlay-import";

describe("commitUnderlayImport", () => {
  it("fails closed when attestation is incomplete", async () => {
    const result = await commitUnderlayImport({
      selectedImage: "data:image/png;base64,xx",
      holdsRights: false,
      compliesWithSourceTerms: true,
      source: "upload",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/holds the rights/i);
    }
  });

  it("submits one inspection-scoped custody transaction and returns its preview", async () => {
    const submit = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ imageUrl: "https://cdn.example/plan.png" }),
        {
          status: 201,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const result = await commitUnderlayImport({
      selectedImage: "https://images.example/plan.png",
      inspectionId: "insp-1",
      floorNumber: 2,
      holdsRights: true,
      compliesWithSourceTerms: true,
      source: "url",
      sourcePageUrl: "https://www.domain.com.au/listing",
      submit,
    });

    expect(result).toEqual({
      ok: true,
      imageUrl: "https://cdn.example/plan.png",
    });
    expect(submit).toHaveBeenCalledOnce();
    const [url, form] = submit.mock.calls[0];
    expect(url).toBe("/api/inspections/insp-1/sketches/underlay");
    expect(form.get("floorNumber")).toBe("2");
    expect(form.get("remoteImageUrl")).toBe("https://images.example/plan.png");
  });

  it("does not claim success when durable custody fails", async () => {
    const submit = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "Attestation not stored" } }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const result = await commitUnderlayImport({
      selectedImage: "https://images.example/plan.png",
      inspectionId: "insp-1",
      holdsRights: true,
      compliesWithSourceTerms: true,
      source: "url",
      sourcePageUrl: "https://www.domain.com.au/listing",
      submit,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/attestation/i);
    }
  });
});
