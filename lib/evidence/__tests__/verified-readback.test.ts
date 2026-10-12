import { describe, expect, it, vi } from "vitest";
import { verifyEvidenceReadback } from "../verified-readback";

describe("verifyEvidenceReadback", () => {
  it("accepts a stored media item linked to the requested job step", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ evidenceItems: [
      { id: "other", workflowStepId: "s1", fileUrl: "u" },
      { id: "e1", workflowStepId: "s1", fileUrl: "signed-url" },
    ] }) });
    await expect(verifyEvidenceReadback("job-1", "s1", "e1", fetcher)).resolves.toMatchObject({ id: "e1", fileUrl: "signed-url" });
    expect(fetcher).toHaveBeenCalledWith("/api/inspections/job-1/evidence", { cache: "no-store" });
  });

  it.each([
    [{ id: "e1", workflowStepId: "different", fileUrl: "u" }],
    [{ id: "e1", workflowStepId: "s1", fileUrl: null }],
    [],
  ])("rejects missing or mislinked stored media", async (items) => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ evidenceItems: items }) });
    await expect(verifyEvidenceReadback("job-1", "s1", "e1", fetcher)).rejects.toThrow(/could not be verified/);
  });
});
