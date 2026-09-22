/**
 * Fabric 7 StaticCanvas.toJSON() takes no arguments and returns
 * this.toObject() with an empty include list (fabric
 * src/canvas/StaticCanvas.ts). canvas.toJSON(["data"]) therefore drops
 * each object's custom `data` — room id, type, label, material,
 * water category, size, provenance and the voice asbestos latch.
 *
 * toObject still honours propertiesToInclude. Save, undo history and
 * export all go through this function so they cannot drift.
 */

export interface SerialisedSketchObject {
  type?: string;
  data?: {
    id?: string;
    type?: string;
    label?: string;
    voiceRaisedAcm?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface SerialisedSketchCanvas {
  objects?: SerialisedSketchObject[];
  [key: string]: unknown;
}

export interface SketchSerialisableCanvas {
  toObject: (propertiesToInclude?: string[]) => SerialisedSketchCanvas;
}

/** Custom property every sketch object carries. One list, every path. */
export const SKETCH_OBJECT_PROPERTIES = ["data"] as const;

export function serialiseSketchCanvas(
  canvas: SketchSerialisableCanvas,
): SerialisedSketchCanvas {
  return canvas.toObject([...SKETCH_OBJECT_PROPERTIES]);
}
