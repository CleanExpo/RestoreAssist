/**
 * ANZ materials & construction library (spec §5.1, §12 `materials`).
 *
 * Uses Australian / New Zealand vocabulary and assemblies — not US names — and
 * drives the annotation picker, the drying check (`dryStandardMc`), and the
 * WHS asbestos gate (`isPotentialAcm`).
 *
 * Moisture values (RA-8510): this file holds none of its own. Each material
 * names the row of the guide table in `lib/iicrc-dry-standards.ts` it maps to
 * (`guideMaterial`), and `dryStandardMc` is that row's dry value. The guide
 * values have no cited source and are not a published standard; the job's
 * reference reading (RA-8508) is the drying goal wherever one is recorded.
 * A material with no matching guide row carries `null` rather than a number
 * invented here.
 */

import { getDryStandard } from "@/lib/iicrc-dry-standards";

export type Region = "AU" | "NZ";

export type MaterialCategory =
  | "wall"
  | "ceiling"
  | "floor"
  | "roof"
  | "cladding"
  | "framing";

export interface AnzMaterial {
  /** Stable slug used as the foreign key from sketch elements. */
  id: string;
  /** Display name in ANZ vocabulary. */
  name: string;
  /** Alternate names the picker / lookup should resolve (case-insensitive). */
  aliases?: string[];
  /** Regions this material is in common use. */
  region: Region[];
  /**
   * The `material` key of the guide row in `lib/iicrc-dry-standards.ts` this
   * material takes its moisture value from, or null when no row fits.
   */
  guideMaterial: string | null;
  /**
   * Guide dry value, moisture content (%), derived from `guideMaterial`. Null
   * when there is no guide row: use a reference reading instead.
   */
  dryStandardMc: number | null;
  /**
   * Default suspected-ACM flag. Asbestos-cement ("fibro") sheeting and pre-2000
   * vinyl/lino tiles are the common ACM culprits in ANZ housing.
   */
  isPotentialAcm: boolean;
  category: MaterialCategory;
}

type AnzMaterialEntry = Omit<AnzMaterial, "dryStandardMc">;

const ENTRIES: AnzMaterialEntry[] = [
  {
    id: "gyprock",
    name: "Gyprock (plasterboard)",
    aliases: ["plasterboard", "gypsum board", "drywall", "sheetrock"],
    region: ["AU", "NZ"],
    guideMaterial: "plasterboard",
    isPotentialAcm: false,
    category: "wall",
  },
  {
    id: "weatherboard",
    name: "Weatherboard (timber)",
    aliases: ["weatherboards", "timber cladding"],
    region: ["AU", "NZ"],
    guideMaterial: "softwood",
    isPotentialAcm: false,
    category: "cladding",
  },
  {
    id: "fibro",
    name: "Fibro (fibrous-cement / AC sheet)",
    aliases: [
      "fibrous cement",
      "fibrous-cement sheet",
      "ac sheet",
      "asbestos cement",
    ],
    region: ["AU", "NZ"],
    guideMaterial: null,
    isPotentialAcm: true,
    category: "cladding",
  },
  {
    id: "brick-veneer",
    name: "Brick veneer",
    region: ["AU", "NZ"],
    guideMaterial: "brick",
    isPotentialAcm: false,
    category: "wall",
  },
  {
    id: "double-brick",
    name: "Double brick",
    aliases: ["solid brick"],
    region: ["AU"],
    guideMaterial: "brick",
    isPotentialAcm: false,
    category: "wall",
  },
  {
    id: "colorbond",
    name: "Colorbond steel",
    aliases: ["colorbond roofing", "colorbond cladding", "steel roofing"],
    region: ["AU", "NZ"],
    guideMaterial: null,
    isPotentialAcm: false,
    category: "roof",
  },
  {
    id: "timber-framing",
    name: "Timber framing",
    aliases: ["timber frame", "stud frame"],
    region: ["AU", "NZ"],
    guideMaterial: "softwood",
    isPotentialAcm: false,
    category: "framing",
  },
  {
    id: "particleboard-flooring",
    name: "Particleboard flooring",
    aliases: ["particle board", "chipboard flooring"],
    region: ["AU", "NZ"],
    guideMaterial: "particleboard",
    isPotentialAcm: false,
    category: "floor",
  },
  {
    id: "concrete-slab",
    name: "Concrete slab",
    aliases: ["concrete"],
    region: ["AU", "NZ"],
    guideMaterial: "concrete",
    isPotentialAcm: false,
    category: "floor",
  },
  {
    id: "carpet",
    name: "Carpet & underlay",
    aliases: ["carpet"],
    region: ["AU", "NZ"],
    guideMaterial: "carpet",
    isPotentialAcm: false,
    category: "floor",
  },
  {
    id: "vinyl-tiles",
    name: "Vinyl / lino tiles",
    aliases: ["vinyl tile", "lino", "linoleum"],
    region: ["AU", "NZ"],
    guideMaterial: "vinyl",
    isPotentialAcm: true,
    category: "floor",
  },
  {
    id: "ceramic-tile",
    name: "Ceramic tile",
    aliases: ["tile", "tiles"],
    region: ["AU", "NZ"],
    guideMaterial: null,
    isPotentialAcm: false,
    category: "floor",
  },
];

/** The guide row's dry value, or null when the key names no real row. */
function guideDryValue(key: string | null): number | null {
  if (key === null) return null;
  const row = getDryStandard(key);
  // getDryStandard falls back to "other"; never borrow the catch-all value.
  return row.material === key ? row.dryThreshold : null;
}

export const ANZ_MATERIALS: AnzMaterial[] = ENTRIES.map((m) => ({
  ...m,
  dryStandardMc: guideDryValue(m.guideMaterial),
}));

const BY_ID = new Map(ANZ_MATERIALS.map((m) => [m.id, m]));

export function getMaterial(id: string): AnzMaterial | undefined {
  return BY_ID.get(id);
}

/** Resolve by display name or alias, case-insensitive. */
export function findMaterialByName(name: string): AnzMaterial | undefined {
  const needle = name.trim().toLowerCase();
  return ANZ_MATERIALS.find(
    (m) =>
      m.id === needle ||
      m.name.toLowerCase() === needle ||
      m.name.toLowerCase().includes(needle) ||
      (m.aliases ?? []).some((a) => a.toLowerCase() === needle),
  );
}

export function materialsForRegion(region: Region): AnzMaterial[] {
  return ANZ_MATERIALS.filter((m) => m.region.includes(region));
}
