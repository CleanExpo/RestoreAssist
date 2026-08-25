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

  it("persists then records attestation before returning the hosted URL", async () => {
    const persist = vi.fn().mockResolvedValue("https://cdn.example/plan.png");
    const postAttestation = vi.fn().mockResolvedValue({ ok: true });

    const result = await commitUnderlayImport({
      selectedImage: "data:image/png;base64,xx",
      inspectionId: "insp-1",
      holdsRights: true,
      compliesWithSourceTerms: true,
      source: "upload",
      persist,
      postAttestation,
    });

    expect(result).toEqual({
      ok: true,
      imageUrl: "https://cdn.example/plan.png",
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(postAttestation).toHaveBeenCalledOnce();
  });

  it("does not claim success when attestation recording fails", async () => {
    const persist = vi.fn().mockResolvedValue("https://cdn.example/plan.png");
    const postAttestation = vi.fn().mockResolvedValue({ ok: false });

    const result = await commitUnderlayImport({
      selectedImage: "data:image/png;base64,xx",
      inspectionId: "insp-1",
      holdsRights: true,
      compliesWithSourceTerms: true,
      source: "upload",
      persist,
      postAttestation,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/attestation/i);
    }
  });
});
