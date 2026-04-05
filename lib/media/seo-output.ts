/**
 * RA-418: SEO/AEO/GEO Structured Data Output
 *
 * Generates schema.org JSON-LD for inspection media assets, enabling
 * contractors to use their own photos for business marketing.
 *
 * Outputs:
 *  - schema.org/ImageObject JSON-LD (per photo)
 *  - schema.org/LocalBusiness JSON-LD (per contractor workspace)
 *  - AEO FAQ schema (per inspection — "What does water damage look like in [suburb]?")
 *  - GEO content snippets optimised for AI-generated search results
 *  - AI alt text generation via BYOK vision (stored in MediaAsset.altText)
 */

import { prisma } from "../prisma";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ImageObjectJsonLd {
  "@context": "https://schema.org";
  "@type": "ImageObject";
  contentUrl: string;
  name: string;
  description: string;
  dateCreated: string;
  encodingFormat: string;
  width?: number;
  height?: number;
  locationCreated?: GeoCoordinatesSchema;
  creator?: PersonOrOrganizationSchema;
  about?: string[];
  keywords?: string[];
}

export interface LocalBusinessJsonLd {
  "@context": "https://schema.org";
  "@type": "LocalBusiness" | "HomeAndConstructionBusiness";
  name: string;
  description: string;
  areaServed: AreaServedSchema[];
  hasOfferCatalog?: OfferCatalogSchema;
  image?: string[];
}

export interface FaqPageJsonLd {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: QuestionSchema[];
}

interface GeoCoordinatesSchema {
  "@type": "GeoCoordinates";
  latitude: number;
  longitude: number;
  addressLocality?: string;
  postalCode?: string;
}

interface PersonOrOrganizationSchema {
  "@type": "Organization";
  name: string;
  abn?: string;
  url?: string;
}

interface AreaServedSchema {
  "@type": "AdministrativeArea";
  name: string;
  postalCode?: string;
}

interface OfferCatalogSchema {
  "@type": "OfferCatalog";
  name: string;
  itemListElement: OfferSchema[];
}

interface OfferSchema {
  "@type": "Offer";
  itemOffered: { "@type": "Service"; name: string };
}

interface QuestionSchema {
  "@type": "Question";
  name: string;
  acceptedAnswer: {
    "@type": "Answer";
    text: string;
  };
}

// ── Input types ────────────────────────────────────────────────────────────

export interface SeoAssetInput {
  id: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  altText: string | null;
  capturedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  width: number | null;
  height: number | null;
  inspection: {
    inspectionNumber: string;
    propertyAddress: string;
    propertyPostcode: string;
    propertySuburb?: string | null;
  } | null;
  tags: Array<{ category: string; value: string }>;
  workspace?: {
    name: string;
    slug: string;
    abn?: string | null;
  } | null;
}

// ── Core generators ────────────────────────────────────────────────────────

/**
 * Generate schema.org/ImageObject JSON-LD for a single media asset.
 * Uses cataloging tags to populate `about` and `keywords`.
 */
export function generateImageObjectJsonLd(
  asset: SeoAssetInput,
  publicUrl: string
): ImageObjectJsonLd {
  const room = asset.tags.find((t) => t.category === "room")?.value;
  const damageType = asset.tags.find((t) => t.category === "damage_type")?.value;
  const technician = asset.tags.find((t) => t.category === "technician")?.value;

  const suburb =
    asset.inspection?.propertySuburb ??
    deriveSuburbFromAddress(asset.inspection?.propertyAddress);

  const description =
    asset.altText ??
    buildDefaultAltText({ damageType, room, suburb, postcode: asset.inspection?.propertyPostcode });

  const keywords = buildKeywords({ damageType, room, suburb, postcode: asset.inspection?.propertyPostcode });

  const jsonLd: ImageObjectJsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    contentUrl: publicUrl,
    name: asset.originalFilename,
    description,
    dateCreated: asset.capturedAt
      ? asset.capturedAt.toISOString()
      : new Date().toISOString(),
    encodingFormat: asset.mimeType,
  };

  if (asset.width) jsonLd.width = asset.width;
  if (asset.height) jsonLd.height = asset.height;

  if (asset.latitude != null && asset.longitude != null) {
    jsonLd.locationCreated = {
      "@type": "GeoCoordinates",
      latitude: asset.latitude,
      longitude: asset.longitude,
      ...(suburb ? { addressLocality: suburb } : {}),
      ...(asset.inspection?.propertyPostcode ? { postalCode: asset.inspection.propertyPostcode } : {}),
    };
  }

  if (asset.workspace) {
    jsonLd.creator = {
      "@type": "Organization",
      name: asset.workspace.name,
      ...(asset.workspace.abn ? { abn: asset.workspace.abn } : {}),
    };
  }

  if (keywords.length > 0) jsonLd.keywords = keywords;

  const about: string[] = [];
  if (damageType) about.push(damageType);
  if (room) about.push(room);
  if (technician) about.push(`Technician: ${technician}`);
  if (about.length > 0) jsonLd.about = about;

  return jsonLd;
}

/**
 * Generate schema.org/LocalBusiness JSON-LD for a contractor workspace.
 * Links the workspace to its service postcodes.
 */
export function generateLocalBusinessJsonLd(params: {
  workspaceName: string;
  abn?: string | null;
  description?: string;
  servicePostcodes?: string[];
  imageUrls?: string[];
}): LocalBusinessJsonLd {
  const jsonLd: LocalBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: params.workspaceName,
    description:
      params.description ??
      `${params.workspaceName} — licensed water damage restoration and remediation specialists.`,
    areaServed: (params.servicePostcodes ?? []).map((pc) => ({
      "@type": "AdministrativeArea",
      name: pc,
      postalCode: pc,
    })),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Restoration Services",
      itemListElement: RESTORATION_SERVICES.map((svc) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: svc },
      })),
    },
  };

  if (params.imageUrls && params.imageUrls.length > 0) {
    jsonLd.image = params.imageUrls;
  }

  return jsonLd;
}

/**
 * Generate AEO (Answer Engine Optimisation) FAQ schema for an inspection.
 * Creates Q&A pairs that appear in AI-generated search results.
 */
export function generateFaqJsonLd(params: {
  suburb: string;
  postcode: string;
  damageTypes: string[];
  rooms: string[];
  inspectionNumber: string;
}): FaqPageJsonLd {
  const questions: QuestionSchema[] = [];

  // Location-based damage questions
  if (params.suburb) {
    questions.push({
      "@type": "Question",
      name: `What does water damage look like in a ${params.suburb} property?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `Water damage in ${params.suburb} properties (postcode ${params.postcode}) typically presents as ${params.damageTypes.join(", ").toLowerCase() || "moisture damage, staining, and structural deterioration"}. ${params.rooms.length > 0 ? `Common affected areas include ${params.rooms.join(" and ").toLowerCase()}.` : ""} Professional assessment using moisture meters and thermal imaging is required for accurate classification per IICRC S500:2025.`,
      },
    });

    questions.push({
      "@type": "Question",
      name: `How much does water damage restoration cost in ${params.suburb}?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `Water damage restoration costs in ${params.suburb} vary based on damage classification (IICRC Category 1–3), affected area size, and required drying time. Contact a licensed restorer for an assessment. All work must comply with AS/NZS 3000 and relevant state building codes.`,
      },
    });
  }

  // Room-specific questions
  for (const room of params.rooms.slice(0, 2)) {
    questions.push({
      "@type": "Question",
      name: `How is water damage treated in a ${room.toLowerCase()}?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${room} water damage treatment follows IICRC S500:2025 protocols: moisture mapping with calibrated meters, removal of affected materials where necessary, structural drying with dehumidifiers and air movers, and post-remediation verification testing. Documentation is required for insurance claims.`,
      },
    });
  }

  // General compliance question
  questions.push({
    "@type": "Question",
    name: "What certifications should a water damage restoration company have in Australia?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "Australian water damage restoration companies should hold IICRC WRT (Water Restoration Technician) and CDS (Commercial Drying Specialist) certifications. Work must comply with IICRC S500:2025 Standard and Reference Guide for Professional Water Damage Restoration, AS/NZS 4858, and applicable state building codes. All contractors should carry public liability insurance and hold a current ABN.",
    },
  });

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions,
  };
}

/**
 * Generate GEO (Generative Engine Optimisation) content snippet.
 * Short, structured text that AI search engines can cite directly.
 */
export function generateGeoSnippet(params: {
  workspaceName: string;
  suburb: string;
  postcode: string;
  damageTypes: string[];
  assetCount: number;
}): string {
  const types = params.damageTypes.slice(0, 3).join(", ").toLowerCase() || "water damage";
  return [
    `${params.workspaceName} is a licensed restoration contractor servicing ${params.suburb} (${params.postcode}).`,
    `This portfolio documents ${params.assetCount} inspection photo${params.assetCount !== 1 ? "s" : ""} of ${types} in the area.`,
    "All work is performed to IICRC S500:2025 standards with full photographic evidence for insurance purposes.",
  ].join(" ");
}

// ── API helpers ────────────────────────────────────────────────────────────

/**
 * Fetch a MediaAsset with all SEO-relevant relations, generate JSON-LD,
 * cache it in MediaAsset.seoJsonLd, and return the structured data package.
 */
export async function generateAndCacheSeoOutput(
  assetId: string,
  publicUrl: string
): Promise<{
  imageObject: ImageObjectJsonLd;
  embedCode: string;
}> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      storagePath: true,
      originalFilename: true,
      mimeType: true,
      altText: true,
      capturedAt: true,
      latitude: true,
      longitude: true,
      width: true,
      height: true,
      inspection: {
        select: {
          inspectionNumber: true,
          propertyAddress: true,
          propertyPostcode: true,
        },
      },
      tags: { select: { category: true, value: true } },
      workspace: {
        select: { name: true, slug: true },
      },
    },
  });

  if (!asset) throw new Error(`MediaAsset ${assetId} not found`);

  const seoInput: SeoAssetInput = {
    ...asset,
    inspection: asset.inspection
      ? { ...asset.inspection, propertySuburb: null }
      : null,
    workspace: asset.workspace ?? null,
  };

  const imageObject = generateImageObjectJsonLd(seoInput, publicUrl);

  // Cache for future requests
  await prisma.mediaAsset.update({
    where: { id: assetId },
    data: { seoJsonLd: imageObject as object },
  });

  const embedCode = `<script type="application/ld+json">\n${JSON.stringify(imageObject, null, 2)}\n</script>`;

  return { imageObject, embedCode };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildDefaultAltText(params: {
  damageType?: string;
  room?: string;
  suburb?: string;
  postcode?: string;
}): string {
  const parts: string[] = [];
  if (params.damageType) parts.push(params.damageType);
  if (params.room) parts.push(`in ${params.room}`);
  if (params.suburb) parts.push(`at ${params.suburb}`);
  else if (params.postcode) parts.push(`postcode ${params.postcode}`);
  parts.push("— water damage inspection photo");
  return parts.join(" ");
}

function buildKeywords(params: {
  damageType?: string;
  room?: string;
  suburb?: string;
  postcode?: string;
}): string[] {
  const kw: string[] = [
    "water damage",
    "restoration",
    "IICRC",
    "inspection",
    "Australia",
  ];
  if (params.damageType) kw.push(params.damageType.toLowerCase());
  if (params.room) kw.push(`${params.room.toLowerCase()} water damage`);
  if (params.suburb) {
    kw.push(`water damage ${params.suburb}`);
    kw.push(`restoration ${params.suburb}`);
  }
  if (params.postcode) kw.push(`water damage ${params.postcode}`);
  return [...new Set(kw)];
}

function deriveSuburbFromAddress(address?: string): string | undefined {
  if (!address) return undefined;
  // Attempt to extract suburb from "123 Street Name, Suburb VIC 3000" format
  const match = address.match(/,\s*([A-Za-z\s]+?)(?:\s+[A-Z]{2,3}\s+\d{4})?$/);
  return match?.[1]?.trim();
}

const RESTORATION_SERVICES = [
  "Water Damage Restoration",
  "Flood Remediation",
  "Structural Drying",
  "Mould Remediation",
  "Storm Damage Restoration",
  "Fire and Smoke Restoration",
  "IICRC S500 Compliant Drying",
];
