/**
 * RA-418: SEO/AEO/GEO Structured Data API
 * GET  /api/media/[id]/seo  — generate or return cached JSON-LD for a MediaAsset
 * POST /api/media/[id]/seo  — trigger alt-text generation (BYOK vision) + cache refresh
 *
 * GET response:
 *   {
 *     imageObject: ImageObjectJsonLd,
 *     localBusiness: LocalBusinessJsonLd,
 *     faqPage: FaqPageJsonLd,
 *     geoSnippet: string,
 *     embedCode: string,           // <script type="application/ld+json">...</script>
 *     socialMeta: SocialMetaOutput,
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPaymentGate } from "@/lib/workspace/payment-gate";
import {
  generateImageObjectJsonLd,
  generateLocalBusinessJsonLd,
  generateFaqJsonLd,
  generateGeoSnippet,
  type SeoAssetInput,
} from "@/lib/media/seo-output";

// ── GET — fetch SEO structured data ───────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // RA-426: Workspace payment gate
    const gate = await checkPaymentGate(session.user.id);
    if (!gate.allowed) return gate.response;

    const { id } = await params;

    // Load asset with workspace + inspection + tags
    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id,
        workspace: {
          members: {
            some: { userId: session.user.id, status: "ACTIVE" },
          },
        },
      },
      select: {
        id: true,
        storagePath: true,
        originalFilename: true,
        mimeType: true,
        altText: true,
        seoJsonLd: true,
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
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const { searchParams } = request.nextUrl;
    const baseUrl = searchParams.get("baseUrl") ?? `${request.nextUrl.origin}`;

    // Build public URL from storagePath
    const publicUrl = asset.storagePath.startsWith("http")
      ? asset.storagePath
      : `${baseUrl}/api/storage/file?path=${encodeURIComponent(asset.storagePath)}`;

    const seoInput: SeoAssetInput = {
      ...asset,
      inspection: asset.inspection
        ? { ...asset.inspection, propertySuburb: null }
        : null,
      workspace: asset.workspace ?? null,
    };

    // Generate ImageObject JSON-LD (use cache if available)
    const imageObject = asset.seoJsonLd
      ? (asset.seoJsonLd as unknown as ReturnType<typeof generateImageObjectJsonLd>)
      : generateImageObjectJsonLd(seoInput, publicUrl);

    // Collect workspace service postcodes from this inspection + others
    const servicePostcodes = await getWorkspaceServicePostcodes(
      asset.workspace?.id,
    );

    // LocalBusiness JSON-LD
    const localBusiness = generateLocalBusinessJsonLd({
      workspaceName: asset.workspace?.name ?? "Restoration Contractor",
      servicePostcodes,
      imageUrls: [publicUrl],
    });

    // AEO FAQ JSON-LD
    const suburb =
      deriveSuburbFromAddress(asset.inspection?.propertyAddress) ?? "";
    const damageTypes = asset.tags
      .filter((t) => t.category === "damage_type")
      .map((t) => t.value);
    const rooms = asset.tags
      .filter((t) => t.category === "room")
      .map((t) => t.value);

    const faqPage = generateFaqJsonLd({
      suburb,
      postcode: asset.inspection?.propertyPostcode ?? "",
      damageTypes,
      rooms,
      inspectionNumber: asset.inspection?.inspectionNumber ?? "",
    });

    // GEO snippet
    const assetCount = await prisma.mediaAsset.count({
      where: {
        workspaceId: asset.workspace?.id,
        inspection: {
          propertyPostcode: asset.inspection?.propertyPostcode ?? "",
        },
      },
    });

    const geoSnippet = generateGeoSnippet({
      workspaceName: asset.workspace?.name ?? "Restoration Contractor",
      suburb,
      postcode: asset.inspection?.propertyPostcode ?? "",
      damageTypes,
      assetCount,
    });

    // Social meta
    const socialMeta = buildSocialMeta({ asset: seoInput, publicUrl, suburb });

    // Embed code (ImageObject + LocalBusiness combined)
    const allSchemas = [imageObject, localBusiness, faqPage];
    const embedCode = allSchemas
      .map(
        (s) =>
          `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`,
      )
      .join("\n\n");

    return NextResponse.json({
      imageObject,
      localBusiness,
      faqPage,
      geoSnippet,
      embedCode,
      socialMeta,
    });
  } catch (error) {
    console.error("[GET /api/media/[id]/seo] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── POST — update alt text (BYOK vision) ──────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { altText } = body as { altText?: string };

    if (!altText || typeof altText !== "string" || !altText.trim()) {
      return NextResponse.json(
        { error: "altText is required" },
        { status: 400 },
      );
    }

    // Verify ownership
    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id,
        workspace: {
          members: { some: { userId: session.user.id, status: "ACTIVE" } },
        },
      },
      select: { id: true },
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Update alt text and invalidate cached JSON-LD so it regenerates
    const updated = await prisma.mediaAsset.update({
      where: { id },
      data: {
        altText: altText.trim(),
        seoJsonLd: null as any, // force regeneration on next GET
      },
      select: { id: true, altText: true },
    });

    return NextResponse.json({ asset: updated });
  } catch (error) {
    console.error("[POST /api/media/[id]/seo] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function deriveSuburbFromAddress(address?: string): string | undefined {
  if (!address) return undefined;
  const match = address.match(/,\s*([A-Za-z\s]+?)(?:\s+[A-Z]{2,3}\s+\d{4})?$/);
  return match?.[1]?.trim();
}

async function getWorkspaceServicePostcodes(
  workspaceId?: string,
): Promise<string[]> {
  if (!workspaceId) return [];
  const results = await prisma.inspection.findMany({
    where: {
      workspaceId,
      propertyPostcode: { not: "" },
    },
    select: { propertyPostcode: true },
    distinct: ["propertyPostcode"],
    take: 20,
  });
  return results.map((r) => r.propertyPostcode).filter(Boolean);
}

interface SocialMetaOutput {
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterCard: "summary_large_image";
  twitterTitle: string;
  twitterDescription: string;
  gbpReady: boolean; // True if dimensions satisfy Google Business Profile (≥ 720×720)
}

function buildSocialMeta(params: {
  asset: SeoAssetInput;
  publicUrl: string;
  suburb: string;
}): SocialMetaOutput {
  const { asset, publicUrl, suburb } = params;
  const damageType =
    asset.tags.find((t) => t.category === "damage_type")?.value ??
    "Restoration";
  const postcode = asset.inspection?.propertyPostcode ?? "";
  const location = suburb
    ? `${suburb}${postcode ? ` ${postcode}` : ""}`
    : postcode;

  const title = `${damageType} — ${location} Inspection`.trim();
  const description = asset.altText
    ? asset.altText
    : `Professional water damage restoration documentation${location ? ` in ${location}` : ""}. IICRC S500:2025 compliant inspection photos.`;

  return {
    ogTitle: title,
    ogDescription: description,
    ogImage: publicUrl,
    twitterCard: "summary_large_image",
    twitterTitle: title,
    twitterDescription: description,
    gbpReady: (asset.width ?? 0) >= 720 && (asset.height ?? 0) >= 720,
  };
}
