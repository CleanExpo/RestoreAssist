"use client";

/** A successful signed POST is not presented as attached until the same job's
 * evidence listing returns that item with its stored media URL and step link. */
export async function verifyEvidenceReadback(
  inspectionId: string,
  stepId: string,
  evidenceId: string,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const response = await fetcher(`/api/inspections/${encodeURIComponent(inspectionId)}/evidence`, { cache: "no-store" });
  if (!response.ok) throw new Error("Evidence may have saved, but its job attachment could not be verified. Retry with the pending capture.");
  const body = await response.json().catch(() => null);
  const item = Array.isArray(body?.evidenceItems)
    ? body.evidenceItems.find((row: { id?: string }) => row.id === evidenceId)
    : null;
  if (!item || item.workflowStepId !== stepId || typeof item.fileUrl !== "string" || !item.fileUrl.trim()) {
    throw new Error("Evidence may have saved, but its job attachment could not be verified. Retry with the pending capture.");
  }
  return item;
}
