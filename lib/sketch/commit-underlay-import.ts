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

import { dataUrlToBlob } from "@/lib/sketch/data-url-blob";
import type { UnderlayReferenceBinding } from "@/lib/sketch/reference-room-import";

export type CommitUnderlayResult =
  | { ok: true; imageUrl: string; reference?: UnderlayReferenceBinding }
  | { ok: false; error: string };

/** What the technician chose in the browser, before it became a raster. */
export interface UnderlayOriginalSource {
  mimeType: string;
  /** 1 for a PDF (page 1 is the only page read), null for an image. */
  page: number | null;
  pageCount: number | null;
}

export interface CommitUnderlayImportInput {
  selectedImage: string;
  inspectionId?: string;
  floorNumber?: number;
  holdsRights: boolean;
  compliesWithSourceTerms: boolean;
  source: UnderlaySource;
  sourcePageUrl?: string;
  original?: UnderlayOriginalSource;
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
      form.set("file", dataUrlToBlob(input.selectedImage), "floor-plan.png");
      if (input.original) {
        form.set("originalMimeType", input.original.mimeType);
        if (input.original.page != null) {
          form.set("originalPage", String(input.original.page));
        }
        if (input.original.pageCount != null) {
          form.set("originalPageCount", String(input.original.pageCount));
        }
      }
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
    const payload = (await res.json()) as {
      imageUrl?: unknown;
      referenceId?: unknown;
      contentSha256?: unknown;
    };
    if (typeof payload.imageUrl !== "string" || !payload.imageUrl) {
      return {
        ok: false,
        error: "The stored floor plan did not return a preview.",
      };
    }
    // No binding means no room suggestions; the reference itself still applies.
    const bound =
      typeof payload.referenceId === "string" &&
      typeof payload.contentSha256 === "string";
    return {
      ok: true,
      imageUrl: payload.imageUrl,
      ...(bound
        ? {
            reference: {
              referenceId: payload.referenceId as string,
              contentSha256: payload.contentSha256 as string,
              floorNumber: input.floorNumber ?? 0,
            },
          }
        : {}),
    };
  } catch {
    return {
      ok: false,
      error: "Couldn't save the floor plan — please try again.",
    };
  }
}
