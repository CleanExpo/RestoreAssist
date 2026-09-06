/**
 * Persist a prepared underlay and record content-bound rights custody.
 *
 * Shared by the start-studio overlay and the underlay panel so both paths
 * fail closed the same way: no apply without a recorded attestation.
 */

import {
  evaluateUnderlayAttestation,
  type UnderlaySource,
} from "@/lib/sketch/underlay-attestation";

export type CommitUnderlayResult =
  | { ok: true; imageUrl: string }
  | { ok: false; error: string };

export interface CommitUnderlayImportInput {
  selectedImage: string;
  inspectionId?: string;
  floorNumber?: number;
  holdsRights: boolean;
  compliesWithSourceTerms: boolean;
  source: UnderlaySource;
  sourcePageUrl?: string;
  submit?: (url: string, body: FormData) => Promise<Response>;
}

async function defaultSubmit(url: string, body: FormData): Promise<Response> {
  return fetch(url, {
    method: "POST",
    body,
  });
}

export async function commitUnderlayImport(
  input: CommitUnderlayImportInput,
): Promise<CommitUnderlayResult> {
  const attestation = evaluateUnderlayAttestation({
    holdsRights: input.holdsRights,
    compliesWithSourceTerms: input.compliesWithSourceTerms,
  });
  if (!attestation.ok) {
    return {
      ok: false,
      error: attestation.reason ?? "Confirm the rights attestation first.",
    };
  }
  if (!input.inspectionId) {
    return {
      ok: false,
      error: "Save the inspection before importing a floor plan.",
    };
  }

  try {
    const form = new FormData();
    form.set("source", input.source);
    form.set("floorNumber", String(input.floorNumber ?? 0));
    form.set("holdsRights", String(input.holdsRights));
    form.set("compliesWithSourceTerms", String(input.compliesWithSourceTerms));
    if (input.source === "url") {
      form.set("remoteImageUrl", input.selectedImage);
      form.set("sourcePageUrl", input.sourcePageUrl ?? "");
    } else {
      const { dataUrlToBlob } = await import("@/lib/sketch-storage");
      form.set("file", dataUrlToBlob(input.selectedImage), "floor-plan.png");
    }
    const submit = input.submit ?? defaultSubmit;
    const res = await submit(
      `/api/inspections/${input.inspectionId}/sketches/underlay`,
      form,
    );
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        error?: { message?: string } | string;
      } | null;
      const detail =
        typeof payload?.error === "string"
          ? payload.error
          : payload?.error?.message;
      return {
        ok: false,
        error:
          detail ??
          "Couldn't store the reference floor plan — please try again.",
      };
    }
    const payload = (await res.json()) as { imageUrl?: unknown };
    if (typeof payload.imageUrl !== "string" || !payload.imageUrl) {
      return {
        ok: false,
        error: "The stored floor plan did not return a preview.",
      };
    }
    return { ok: true, imageUrl: payload.imageUrl };
  } catch {
    return {
      ok: false,
      error: "Couldn't save the floor plan — please try again.",
    };
  }
}
