/**
 * ANZ materials & construction library (spec §5.1, §12 `materials`).
 *
 * Uses Australian / New Zealand vocabulary and assemblies — not US names — and
 * drives the annotation picker, the S500 drying logic (`dryStandardMc`), and the
 * WHS asbestos gate (`isPotentialAcm`).
 *
 * `dryStandardMc` values are sensible starting defaults expressed as a moisture
 * content (%). They are intended to be org-overridable and reconciled against the
 * ANSI/IICRC S500:2021 dry-standard tables — the drying *logic* (see `dry-standard.ts`)
 * is what is authoritative; these are seed defaults, not a published standard.
 */

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
  /** Default dry-standard moisture content (%) — at or below this counts as dry. */
  dryStandardMc: number;
  /**
   * Default suspected-ACM flag. Asbestos-cement ("fibro") sheeting and pre-2000
   * vinyl/lino tiles are the common ACM culprits in ANZ housing.
   */
  isPotentialAcm: boolean;
  category: MaterialCategory;
}

export const ANZ_MATERIALS: AnzMaterial[] = [
  {
    id: "gyprock",
    name: "Gyprock (plasterboard)",
    aliases: ["plasterboard", "gypsum board", "drywall", "sheetrock"],
    region: ["AU", "NZ"],
    dryStandardMc: 1,
    isPotentialAcm: false,
    category: "wall",
  },
  {
    id: "weatherboard",
    name: "Weatherboard (timber)",
    aliases: ["weatherboards", "timber cladding"],
    region: ["AU", "NZ"],
    dryStandardMc: 16,
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
    dryStandardMc: 1,
    isPotentialAcm: true,
    category: "cladding",
  },
  {
    id: "brick-veneer",
    name: "Brick veneer",
    region: ["AU", "NZ"],
    dryStandardMc: 4,
    isPotentialAcm: false,
    category: "wall",
  },
  {
    id: "double-brick",
    name: "Double brick",
    aliases: ["solid brick"],
    region: ["AU"],
    dryStandardMc: 4,
    isPotentialAcm: false,
    category: "wall",
  },
  {
    id: "colorbond",
    name: "Colorbond steel",
    aliases: ["colorbond roofing", "colorbond cladding", "steel roofing"],
    region: ["AU", "NZ"],
    dryStandardMc: 0,
    isPotentialAcm: false,
    category: "roof",
  },
  {
    id: "timber-framing",
    name: "Timber framing",
    aliases: ["timber frame", "stud frame"],
    region: ["AU", "NZ"],
    dryStandardMc: 16,
    isPotentialAcm: false,
    category: "framing",
  },
  {
    id: "particleboard-flooring",
    name: "Particleboard flooring",
    aliases: ["particle board", "chipboard flooring"],
    region: ["AU", "NZ"],
    dryStandardMc: 12,
    isPotentialAcm: false,
    category: "floor",
  },
  {
    id: "concrete-slab",
    name: "Concrete slab",
    aliases: ["concrete"],
    region: ["AU", "NZ"],
    dryStandardMc: 4,
    isPotentialAcm: false,
    category: "floor",
  },
  {
    id: "carpet",
    name: "Carpet & underlay",
    aliases: ["carpet"],
    region: ["AU", "NZ"],
    dryStandardMc: 5,
    isPotentialAcm: false,
    category: "floor",
  },
  {
    id: "vinyl-tiles",
    name: "Vinyl / lino tiles",
    aliases: ["vinyl tile", "lino", "linoleum"],
    region: ["AU", "NZ"],
    dryStandardMc: 1,
    isPotentialAcm: true,
    category: "floor",
  },
  {
    id: "ceramic-tile",
    name: "Ceramic tile",
    aliases: ["tile", "tiles"],
    region: ["AU", "NZ"],
    dryStandardMc: 1,
    isPotentialAcm: false,
    category: "floor",
  },
];

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
