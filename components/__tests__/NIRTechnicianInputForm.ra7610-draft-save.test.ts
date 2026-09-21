/**
 * RA-7610: the NIR draft-save map must send sketchRoomId. The helper
 * alone is not enough — if this form reverts to the old inline map
 * (location / surfaceType / moistureLevel / depth / mapX / mapY only),
 * backfilled room links are wiped on every draft save.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../NIRTechnicianInputForm.tsx"),
  "utf8",
);

describe("NIRTechnicianInputForm draft save — RA-7610 room link", () => {
  it("sends sketchRoomId when mapping moisture readings for draft save", () => {
    const saveStart = formSource.indexOf("const saveDraftSnapshot");
    expect(saveStart).toBeGreaterThan(-1);
    const saveChunk = formSource.slice(saveStart, saveStart + 2_500);

    expect(saveChunk).toContain("buildMoistureReadingDraftPayload(reading");
    expect(saveChunk).not.toMatch(
      /return \{\s*location: reading\.location,\s*surfaceType: reading\.surfaceType/,
    );
  });
});
