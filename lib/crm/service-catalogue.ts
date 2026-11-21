/**
 * RA-8220: the services a restoration business offers beyond the claim it was
 * called in for, so one restoration job can turn the client into a
 * full-service client.
 *
 * Stored on `ContractorProfile.servicesOffered` (a JSON string column that
 * already exists) as `{"v":1,"services":["carpet-cleaning", ...],"custom":[...]}`.
 * Earlier rows may hold free text, which `parseServicesOffered` keeps as
 * custom labels, so nothing a business typed is lost.
 */

export interface CatalogueService {
  id: string;
  label: string;
  group: "restoration" | "cleaning" | "specialty";
}

export const SERVICE_CATALOGUE: readonly CatalogueService[] = [
  { id: "water-damage", label: "Water damage restoration", group: "restoration" },
  { id: "storm-flood", label: "Storm and flood recovery", group: "restoration" },
  { id: "fire-smoke", label: "Fire and smoke restoration", group: "restoration" },
  { id: "mould-remediation", label: "Mould remediation", group: "restoration" },
  { id: "biohazard", label: "Biohazard and trauma cleaning", group: "restoration" },
  { id: "odour-control", label: "Odour control", group: "restoration" },
  { id: "carpet-cleaning", label: "Carpet cleaning", group: "cleaning" },
  { id: "upholstery-cleaning", label: "Upholstery cleaning", group: "cleaning" },
  { id: "tile-grout-cleaning", label: "Tile and grout cleaning", group: "cleaning" },
  { id: "hard-floor-care", label: "Hard floor care", group: "cleaning" },
  { id: "rug-cleaning", label: "Rug cleaning", group: "cleaning" },
  { id: "curtain-blind-cleaning", label: "Curtain and blind cleaning", group: "cleaning" },
  { id: "mattress-cleaning", label: "Mattress cleaning", group: "cleaning" },
  { id: "duct-cleaning", label: "Air duct cleaning", group: "specialty" },
  { id: "air-quality", label: "Indoor air quality testing", group: "specialty" },
  { id: "contents-restoration", label: "Contents cleaning and restoration", group: "specialty" },
] as const;

const BY_ID = new Map(SERVICE_CATALOGUE.map((s) => [s.id, s]));

export const MAX_CUSTOM_SERVICES = 12;
export const MAX_CUSTOM_LABEL_LENGTH = 60;

export interface ServicesOffered {
  services: string[];
  custom: string[];
}

function cleanCustom(labels: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of labels) {
    if (typeof l !== "string") continue;
    const t = l.replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_LABEL_LENGTH);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length === MAX_CUSTOM_SERVICES) break;
  }
  return out;
}

/** Keep catalogue ids in catalogue order, drop unknowns and duplicates. */
function cleanIds(ids: unknown[]): string[] {
  const want = new Set(ids.filter((i): i is string => typeof i === "string"));
  return SERVICE_CATALOGUE.filter((s) => want.has(s.id)).map((s) => s.id);
}

export function normaliseServicesOffered(input: Partial<ServicesOffered> | null | undefined): ServicesOffered {
  return {
    services: cleanIds(Array.isArray(input?.services) ? input!.services : []),
    custom: cleanCustom(Array.isArray(input?.custom) ? input!.custom : []),
  };
}

/** Read the column. Tolerates null, the v1 JSON, a bare JSON array, or legacy free text. */
export function parseServicesOffered(raw: string | null | undefined): ServicesOffered {
  const text = (raw ?? "").trim();
  if (!text) return { services: [], custom: [] };
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return splitLabels(parsed);
    if (parsed && typeof parsed === "object") {
      return normaliseServicesOffered(parsed as Partial<ServicesOffered>);
    }
  } catch {
    // legacy free text
  }
  return splitLabels(text.split(/[,\n;]/));
}

/** Labels typed by a person: match catalogue labels or ids, keep the rest as custom. */
function splitLabels(labels: unknown[]): ServicesOffered {
  const ids: string[] = [];
  const custom: unknown[] = [];
  for (const l of labels) {
    if (typeof l !== "string") continue;
    const key = l.trim().toLowerCase();
    const hit = SERVICE_CATALOGUE.find((s) => s.id === key || s.label.toLowerCase() === key);
    if (hit) ids.push(hit.id);
    else custom.push(l);
  }
  return { services: cleanIds(ids), custom: cleanCustom(custom) };
}

export function serialiseServicesOffered(value: Partial<ServicesOffered>): string | null {
  const v = normaliseServicesOffered(value);
  if (v.services.length === 0 && v.custom.length === 0) return null;
  return JSON.stringify({ v: 1, services: v.services, custom: v.custom });
}

/** Display labels: catalogue services first, then the business's own. */
export function serviceLabels(value: ServicesOffered): string[] {
  return [...value.services.map((id) => BY_ID.get(id)!.label), ...value.custom];
}

/**
 * The services a client is most likely to need next after a claim of this type.
 * Ordered by relevance; filtered to what the business actually offers.
 */
const NEXT_SERVICE_BY_CLAIM_TYPE: Record<string, string[]> = {
  WATER: ["carpet-cleaning", "upholstery-cleaning", "odour-control", "tile-grout-cleaning", "mattress-cleaning"],
  STORM: ["carpet-cleaning", "upholstery-cleaning", "odour-control", "duct-cleaning"],
  FIRE: ["upholstery-cleaning", "carpet-cleaning", "curtain-blind-cleaning", "duct-cleaning", "air-quality"],
  MOULD: ["duct-cleaning", "air-quality", "carpet-cleaning", "upholstery-cleaning"],
  ODOUR: ["carpet-cleaning", "upholstery-cleaning", "duct-cleaning"],
  BIOHAZARD: ["carpet-cleaning", "upholstery-cleaning", "odour-control"],
  CARPET: ["upholstery-cleaning", "tile-grout-cleaning", "rug-cleaning"],
  HVAC: ["air-quality", "carpet-cleaning"],
  CONTENTS: ["upholstery-cleaning", "curtain-blind-cleaning", "rug-cleaning"],
};

export function nextServicesFor(claimType: string | null | undefined, offered: ServicesOffered): CatalogueService[] {
  const has = new Set(offered.services);
  const ids = NEXT_SERVICE_BY_CLAIM_TYPE[(claimType ?? "").toUpperCase()] ?? [];
  return ids.filter((id) => has.has(id)).map((id) => BY_ID.get(id)!);
}

export interface FollowUpDraftInput {
  clientName: string | null | undefined;
  businessName: string;
  services: CatalogueService[];
  businessCardUrl?: string | null;
}

/**
 * A plain-text draft the technician reviews and sends themselves. Nothing is sent
 * from here. Returns null when there is nothing worth suggesting.
 */
export function draftNextServiceFollowUp(input: FollowUpDraftInput): { subject: string; body: string } | null {
  const picks = input.services.slice(0, 3);
  if (picks.length === 0) return null;
  const first = (input.clientName ?? "").trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hi,";
  const list = picks.map((s) => `- ${s.label}`).join("\n");
  const card = input.businessCardUrl ? `\n\nEverything we do is listed here: ${input.businessCardUrl}` : "";
  return {
    subject: `${input.businessName}: looking after your property from here`,
    body:
      `${greeting}\n\nNow that the restoration work is complete, we can also help keep your property in good shape. ` +
      `Clients often book these with us next:\n\n${list}${card}\n\n` +
      `Reply to this message if you'd like a quote.\n\n${input.businessName}`,
  };
}
