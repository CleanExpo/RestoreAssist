/**
 * Persist a prepared underlay and record the rights attestation.
 *
 * Shared by the start-studio overlay and the underlay panel so both paths
 * fail closed the same way: no apply without a recorded attestation.
 */

import { persistUnderlayImage } from "@/lib/sketch/persist-underlay-image";
import {
  buildUnderlayAttestationRecord,
  evaluateUnderlayAttestation,
  type UnderlaySource,
} from "@/lib/sketch/underlay-attestation";

export type CommitUnderlayResult =
  | { ok: true; imageUrl: string }
  | { ok: false; error: string };

export interface CommitUnderlayImportInput {
  selectedImage: string;
  inspectionId?: string;
  holdsRights: boolean;
  compliesWithSourceTerms: boolean;
  source: UnderlaySource;
  persist?: (
    selectedImage: string,
    inspectionId: string | undefined,
  ) => Promise<string>;
  postAttestation?: (
    body: Record<string, unknown>,
  ) => Promise<{ ok: boolean }>;
}

async function defaultPersist(
  selectedImage: string,
  inspectionId: string | undefined,
): Promise<string> {
  const { dataUrlToBlob, uploadFloorPlanUnderlay } = await import(
    "@/lib/sketch-storage"
  );
  return persistUnderlayImage(selectedImage, inspectionId, {
    toBlob: dataUrlToBlob,
    upload: uploadFloorPlanUnderlay,
  });
}

async function defaultPostAttestation(
  body: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  const res = await fetch("/api/sketch/underlay-attestation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok };
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

  try {
    const persist = input.persist ?? defaultPersist;
    const imageUrl = await persist(input.selectedImage, input.inspectionId);

    const record = buildUnderlayAttestationRecord(
      {
        holdsRights: input.holdsRights,
        compliesWithSourceTerms: input.compliesWithSourceTerms,
      },
      input.source,
    );
    const post = input.postAttestation ?? defaultPostAttestation;
    const res = await post({
      ...record,
      inspectionId: input.inspectionId ?? null,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: "Couldn't record the rights attestation — please try again.",
      };
    }
    return { ok: true, imageUrl };
  } catch {
    return {
      ok: false,
      error: "Couldn't save the floor plan — please try again.",
    };
  }
}
