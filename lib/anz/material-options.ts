/**
 * Offline-bundled materials picker options (spec §4.1 — no connectivity on site).
 *
 * The SketchSelectionPanel picker normally loads /api/materials, but field use
 * assumes no connectivity. This is the bundled fallback derived from the same
 * ANZ_MATERIALS source the DB is seeded from, so the picker (and the WHS asbestos
 * gate, which reads isPotentialAcm) always work offline.
 */
import { ANZ_MATERIALS } from "./materials";
import type { MaterialOption } from "@/components/sketch/SketchSelectionPanel";

export const ANZ_MATERIAL_OPTIONS: MaterialOption[] = ANZ_MATERIALS.map(
  (m) => ({
    slug: m.id,
    name: m.name,
    isPotentialAcm: m.isPotentialAcm,
  }),
);
