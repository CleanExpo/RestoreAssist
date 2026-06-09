/**
 * NCC reference attachment for reinstatement scope items (spec §5.4, B4).
 *
 * Attaches the relevant current-edition National Construction Code reference to a
 * reinstatement scope topic. The NCC performance provisions pull in Australian
 * Standards (e.g. AS 3740 wet-area waterproofing) — where one applies it is the
 * stable, citable reference, so we surface it alongside the volume.
 *
 * This is a starter reference set; it is data-driven and intended to be extended /
 * org-overridable. The edition is configurable via `getNccEdition()` so it rolls
 * forward without a code change. Clause-level numbers are intentionally not
 * hardcoded here because they revise per edition — confirm against the live NCC.
 */

import { getNccEdition } from "./ncc-edition";

export type NccVolume = "Volume One" | "Volume Two" | "Volume Three";

export interface NccReference {
  edition: string;
  volume: NccVolume;
  topic: string;
  /** Linked Australian Standard, where the NCC references one. */
  australianStandard?: string;
  note?: string;
}

type NccReferenceEntry = Omit<NccReference, "edition">;

const REFERENCES: Record<string, NccReferenceEntry> = {
  "wet-area-waterproofing": {
    volume: "Volume Two",
    topic: "Wet area waterproofing",
    australianStandard: "AS 3740",
  },
  "external-wall-cladding": {
    volume: "Volume Two",
    topic: "External wall cladding & weatherproofing",
  },
  "structural-timber": {
    volume: "Volume Two",
    topic: "Structural provisions (timber framing)",
    australianStandard: "AS 1684",
  },
  "fire-separation": {
    volume: "Volume One",
    topic: "Fire resistance & separation",
  },
  glazing: {
    volume: "Volume Two",
    topic: "Glazing",
    australianStandard: "AS 1288",
  },
};

export function getNccReference(
  topic: string,
  edition: string = getNccEdition(),
): NccReference | null {
  const entry = REFERENCES[topic];
  if (!entry) return null;
  return { edition, ...entry };
}

export function listNccTopics(): string[] {
  return Object.keys(REFERENCES);
}
