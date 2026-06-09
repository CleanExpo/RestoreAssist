/**
 * Compliance annex builder for the PDF scope export (spec §11, §5.1/§5.4).
 *
 * Pure transform from the Fabric blob + ANZ materials library into the
 * structured content for the PDF's compliance annex: material per element,
 * suspected-ACM flags, and the applicable current-edition NCC references.
 */
import { getNccReference, type NccReference } from "@/lib/anz/ncc";
import { getNccEdition } from "@/lib/anz/ncc-edition";
import { pinDryingStatus } from "./pin-drying";
import { getMaterialType, type MaterialTypeId } from "./iicrc-utils";
import {
  classifyCover,
  buildingClaim,
  NHC_BUILDING_CAP_NZD,
  NHC_FLAT_EXCESS_NZD,
  type CoverResult,
  type BuildingClaimCalc,
  type DamageCause,
} from "@/lib/nz/nhcover";

export interface ScopeMaterialInfo {
  slug: string;
  name: string;
  isPotentialAcm: boolean;
}

export interface ScopeRow {
  roomLabel: string;
  elementType: string;
  materialName: string | null;
  isPotentialAcm: boolean;
}

export interface MoisturePinInput {
  wme: number;
  material: string;
  note?: string;
}

export interface DryingLogRow {
  materialLabel: string;
  wme: number;
  targetMc: number;
  dryStandardMet: boolean;
  note?: string;
}

export interface NhcoverBlock {
  buildingCapNzd: number;
  flatExcessNzd: number;
  routing?: { cause: DamageCause; building: CoverResult; land: CoverResult };
  claim?: BuildingClaimCalc;
}

export interface ComplianceAnnex {
  edition: string;
  rows: ScopeRow[];
  /** Element labels flagged as suspected ACM. */
  acmElements: string[];
  nccReferences: NccReference[];
  dryingLog: DryingLogRow[];
  /** Jurisdiction: AU uses NCC references; NZ uses the NHCover block. */
  country: "AU" | "NZ";
  nhcover: NhcoverBlock | null;
}

/** S500 drying log from moisture pins (spec §5.2). */
export function buildDryingLog(pins: MoisturePinInput[]): DryingLogRow[] {
  return pins.map((p) => {
    const ds = pinDryingStatus({
      wme: p.wme,
      material: p.material as MaterialTypeId,
    });
    return {
      materialLabel:
        getMaterialType(p.material as MaterialTypeId)?.label ?? p.material,
      wme: p.wme,
      targetMc: ds.targetMc,
      dryStandardMet: ds.dryStandardMet,
      note: p.note,
    };
  });
}

const CANONICAL_TYPES = new Set(["room", "wall", "opening", "fixture"]);

// Maps an ANZ material to the NCC reinstatement topic it most implicates.
const MATERIAL_TO_NCC_TOPIC: Record<string, string> = {
  "timber-framing": "structural-timber",
  weatherboard: "structural-timber",
  fibro: "external-wall-cladding",
  "brick-veneer": "external-wall-cladding",
  "double-brick": "external-wall-cladding",
  colorbond: "external-wall-cladding",
};

export function buildComplianceAnnex(
  fabricJson: Record<string, unknown> | null | undefined,
  materials: ScopeMaterialInfo[],
  opts: {
    edition?: string;
    pins?: MoisturePinInput[];
    country?: "AU" | "NZ";
    nhCause?: DamageCause;
    estimatedRepairNzd?: number;
  } = {},
): ComplianceAnnex {
  const edition = opts.edition ?? getNccEdition();
  const bySlug = new Map(materials.map((m) => [m.slug, m]));
  const objects =
    (fabricJson?.objects as Array<Record<string, unknown>> | undefined) ?? [];

  const rows: ScopeRow[] = [];
  const acmElements: string[] = [];
  const topics = new Set<string>();

  for (const obj of objects) {
    const data = obj?.data as Record<string, unknown> | undefined;
    const type = data?.type as string | undefined;
    if (!type || !CANONICAL_TYPES.has(type)) continue;

    const slug = data?.material as string | undefined;
    const mat = slug ? bySlug.get(slug) : undefined;
    const label = (data?.label as string | undefined) ?? type;

    rows.push({
      roomLabel: label,
      elementType: type,
      materialName: mat?.name ?? null,
      isPotentialAcm: mat?.isPotentialAcm ?? false,
    });
    if (mat?.isPotentialAcm) acmElements.push(label);
    if (slug && MATERIAL_TO_NCC_TOPIC[slug])
      topics.add(MATERIAL_TO_NCC_TOPIC[slug]);
  }

  const nccReferences = [...topics]
    .map((t) => getNccReference(t, edition))
    .filter((r): r is NccReference => r !== null);

  const country = opts.country ?? "AU";
  let nhcover: NhcoverBlock | null = null;
  let refs = nccReferences;
  if (country === "NZ") {
    // NHCover replaces the NCC references for the NZ pathway (spec §5.5).
    refs = [];
    nhcover = {
      buildingCapNzd: NHC_BUILDING_CAP_NZD,
      flatExcessNzd: NHC_FLAT_EXCESS_NZD,
      routing: opts.nhCause
        ? {
            cause: opts.nhCause,
            building: classifyCover(opts.nhCause, "building"),
            land: classifyCover(opts.nhCause, "land"),
          }
        : undefined,
      claim:
        opts.nhCause && typeof opts.estimatedRepairNzd === "number"
          ? buildingClaim(opts.nhCause, opts.estimatedRepairNzd)
          : undefined,
    };
  }

  return {
    edition,
    rows,
    acmElements,
    nccReferences: refs,
    dryingLog: buildDryingLog(opts.pins ?? []),
    country,
    nhcover,
  };
}
