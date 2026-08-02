/**
 * Contents Manifest AI Draft
 *
 * POST /api/inspections/:id/contents-manifest
 *   Sends contents evidence (AFFECTED_CONTENTS first, else inspection photos)
 *   to the AI model router and returns a structured draft manifest.
 *
 * GET /api/inspections/:id/contents-manifest
 *   Returns the stored manifest draft (if previously generated) plus photo meta.
 *
 * PATCH /api/inspections/:id/contents-manifest
 *   Persists technician edits to the stored draft.
 *
 * RA-405: Sprint H — Contents manifest AI draft
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { workspaceRouteAiRequest } from "@/lib/ai/workspace-byok-dispatch";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ContentsManifestItem {
  id: string; // client-generated UUID for table row key
  category: string; // e.g. "Furniture", "Electronics", "Clothing"
  description: string; // e.g. "3-seater fabric sofa"
  count: number;
  condition: "good" | "fair" | "poor" | "destroyed";
  restorableStatus: "restorable" | "replace" | "uncertain";
  estimatedValue?: number; // AUD, optional
  confidence: number; // 0–100
  roomLocation?: string;
  flagForReview: boolean; // true if confidence < 70 or high-value
  aiNote?: string; // clarification from AI
}

export interface ContentsManifestDraft {
  inspectionId: string;
  generatedAt: string;
  model: string;
  provider: "gemma" | "byok";
  imageCount: number;
  items: ContentsManifestItem[];
  lowConfidenceCount: number;
  flaggedForReviewCount: number;
  disclaimer: string;
}

// ─── GET — return stored manifest ───────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        inspectionNumber: true,
        propertyAddress: true,
        contentsManifestDraft: true,
        _count: {
          select: {
            photos: true,
            evidenceItems: {
              where: { evidenceClass: "AFFECTED_CONTENTS" },
            },
          },
        },
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const meta = {
      inspectionNumber: inspection.inspectionNumber,
      propertyAddress: inspection.propertyAddress,
      affectedContentsCount: inspection._count.evidenceItems,
      photoCount: inspection._count.photos,
    };

    if (!inspection.contentsManifestDraft) {
      return NextResponse.json({ data: null, meta });
    }

    const draft = JSON.parse(
      inspection.contentsManifestDraft as string,
    ) as ContentsManifestDraft;
    return NextResponse.json({ data: draft, meta });
  } catch (error) {
    return fromException(request, error, { stage: "contents-manifest:get" });
  }
}

// ─── PATCH — persist technician edits ───────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const items = body?.items;

    if (!Array.isArray(items)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "items array is required",
        status: 422,
      });
    }

    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, contentsManifestDraft: true },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const existing = inspection.contentsManifestDraft
      ? (JSON.parse(
          inspection.contentsManifestDraft as string,
        ) as ContentsManifestDraft)
      : null;

    const normalised: ContentsManifestItem[] = items.map(
      (raw: Partial<ContentsManifestItem>, index: number) => {
        const confidence = Math.max(
          0,
          Math.min(100, Number(raw.confidence) || 0),
        );
        const estimatedValue =
          raw.estimatedValue === null || raw.estimatedValue === undefined
            ? undefined
            : Number(raw.estimatedValue);
        const condition = (
          ["good", "fair", "poor", "destroyed"] as const
        ).includes(raw.condition as ContentsManifestItem["condition"])
          ? (raw.condition as ContentsManifestItem["condition"])
          : "fair";
        const restorableStatus = (
          ["restorable", "replace", "uncertain"] as const
        ).includes(raw.restorableStatus as ContentsManifestItem["restorableStatus"])
          ? (raw.restorableStatus as ContentsManifestItem["restorableStatus"])
          : "uncertain";
        const flagForReview =
          typeof raw.flagForReview === "boolean"
            ? raw.flagForReview
            : confidence < 70 ||
              (typeof estimatedValue === "number" && estimatedValue > 500);

        return {
          id: typeof raw.id === "string" && raw.id ? raw.id : `item-${index + 1}`,
          category: String(raw.category ?? "Uncategorised").trim() || "Uncategorised",
          description:
            String(raw.description ?? "Untitled item").trim() || "Untitled item",
          count: Math.max(1, Number(raw.count) || 1),
          condition,
          restorableStatus,
          estimatedValue: Number.isFinite(estimatedValue as number)
            ? (estimatedValue as number)
            : undefined,
          confidence,
          roomLocation: raw.roomLocation
            ? String(raw.roomLocation).trim()
            : undefined,
          flagForReview,
          aiNote: raw.aiNote ? String(raw.aiNote) : undefined,
        };
      },
    );

    const draft: ContentsManifestDraft = {
      inspectionId: id,
      generatedAt: existing?.generatedAt ?? new Date().toISOString(),
      model: existing?.model ?? "manual",
      provider: existing?.provider ?? "gemma",
      imageCount: existing?.imageCount ?? 0,
      items: normalised,
      lowConfidenceCount: normalised.filter((i) => i.confidence < 70).length,
      flaggedForReviewCount: normalised.filter((i) => i.flagForReview).length,
      disclaimer:
        existing?.disclaimer ??
        "This manifest is AI-assisted and requires review before use in claims. All values are estimates only. Items flagged for review require manual confirmation.",
    };

    await prisma.inspection.update({
      where: { id, userId: session.user.id },
      data: { contentsManifestDraft: JSON.stringify(draft) },
    });

    return NextResponse.json({ data: draft });
  } catch (error) {
    return fromException(request, error, { stage: "contents-manifest:patch" });
  }
}

// ─── POST — generate draft manifest ─────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: contents-manifest generation hits AI provider (BYOK) —
  // retry doubles AI spend on identical evidence set.
  return withIdempotency(request, userId, async () => {
    try {
      const inspection = await prisma.inspection.findFirst({
        where: { id, userId },
        include: {
          evidenceItems: {
            where: {
              evidenceClass: {
                in: [
                  "AFFECTED_CONTENTS",
                  "PHOTO_DAMAGE",
                  "PHOTO_EQUIPMENT",
                  "PHOTO_PROGRESS",
                  "PHOTO_COMPLETION",
                ],
              },
            },
            select: {
              id: true,
              evidenceClass: true,
              fileUrl: true,
              fileName: true,
              title: true,
              description: true,
              roomName: true,
            },
          },
          photos: {
            select: {
              id: true,
              url: true,
              description: true,
              location: true,
              roomType: true,
            },
            take: 40,
            orderBy: { uploadedAt: "desc" },
          },
        },
      });

      if (!inspection) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Inspection not found",
          status: 404,
        });
      }

      if (!inspection.workspaceId) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "This inspection is not linked to a workspace. Configure AI Providers in Workspace Settings to use the contents manifest feature.",
          status: 422,
        });
      }

      const affectedEvidence = inspection.evidenceItems.filter(
        (e) => e.evidenceClass === "AFFECTED_CONTENTS" && e.fileUrl,
      );
      const photoEvidence = inspection.evidenceItems.filter(
        (e) => e.evidenceClass !== "AFFECTED_CONTENTS" && e.fileUrl,
      );

      type SourceImage = {
        label: string;
        room: string;
        note?: string | null;
      };

      const contentItems: SourceImage[] =
        affectedEvidence.length > 0
          ? affectedEvidence.map((item) => ({
              label: item.title ?? item.fileName ?? "Image",
              room: item.roomName ?? "Unknown",
              note: item.description,
            }))
          : photoEvidence.length > 0
            ? photoEvidence.map((item) => ({
                label: item.title ?? item.fileName ?? "Image",
                room: item.roomName ?? "Unknown",
                note: item.description,
              }))
            : inspection.photos
                .filter((p) => p.url)
                .map((p) => ({
                  label: p.description ?? "Inspection photo",
                  room: p.location ?? p.roomType ?? "Unknown",
                  note: p.description,
                }));

      if (contentItems.length === 0) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "No photos found. Upload inspection photos or capture AFFECTED_CONTENTS evidence first.",
          status: 422,
        });
      }

      // Build image list for AI context
      const imageList = contentItems
        .map(
          (item, i) =>
            `${i + 1}. ${item.label} — Room: ${item.room}${item.note ? ` — ${item.note}` : ""}`,
        )
        .join("\n");

      const systemPrompt =
        "You are an AI assistant for Australian water damage restoration. You analyse evidence photos and identify contents items for insurance claims. Always return valid JSON.";

      const userPrompt = `You are analysing ${contentItems.length} photo(s) of household/commercial contents from a water damage restoration inspection in Australia.

Images captured:
${imageList}

For each identifiable item, return structured JSON with this shape:
{
  "items": [
    {
      "id": "<uuid>",
      "category": "string",
      "description": "string",
      "count": number,
      "condition": "good|fair|poor|destroyed",
      "restorableStatus": "restorable|replace|uncertain",
      "estimatedValue": number|null,
      "confidence": 0-100,
      "roomLocation": "string|null",
      "flagForReview": boolean,
      "aiNote": "string|null"
    }
  ]
}

Rules:
- Set flagForReview=true when confidence < 70 OR when item appears high-value (>$500 estimated).
- Leave estimatedValue as null if you cannot estimate with reasonable confidence.
- Use Australian dollar estimates based on typical replacement cost.
- Be conservative — better to flag for review than to guess.
- Return ONLY valid JSON, no markdown, no explanation.`;

      // Use standard tier for basic manifest, premium for detailed
      const body = await request.json().catch(() => ({}));
      const detailed = body?.detailed === true;

      const result = await workspaceRouteAiRequest(
        inspection.workspaceId,
        {
          taskType: "contents_manifest",
          systemPrompt,
          userPrompt,
          maxTokens: detailed ? 8192 : 4096,
          temperature: 0.2,
        },
        { memberId: session.user.id },
      );

      // Parse AI response (strip markdown fences if the model wraps JSON)
      let items: ContentsManifestItem[] = [];
      try {
        const rawText = result.text
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        const parsed = JSON.parse(rawText);
        const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
        items = rawItems.map(
          (raw: Partial<ContentsManifestItem>, index: number) => ({
            id:
              typeof raw.id === "string" && raw.id
                ? raw.id
                : `ai-${Date.now()}-${index + 1}`,
            category: String(raw.category ?? "Uncategorised"),
            description: String(raw.description ?? "Untitled item"),
            count: Math.max(1, Number(raw.count) || 1),
            condition: (
              ["good", "fair", "poor", "destroyed"] as const
            ).includes(raw.condition as ContentsManifestItem["condition"])
              ? (raw.condition as ContentsManifestItem["condition"])
              : "fair",
            restorableStatus: (
              ["restorable", "replace", "uncertain"] as const
            ).includes(
              raw.restorableStatus as ContentsManifestItem["restorableStatus"],
            )
              ? (raw.restorableStatus as ContentsManifestItem["restorableStatus"])
              : "uncertain",
            estimatedValue:
              typeof raw.estimatedValue === "number"
                ? raw.estimatedValue
                : undefined,
            confidence: Math.max(
              0,
              Math.min(100, Number(raw.confidence) || 50),
            ),
            roomLocation: raw.roomLocation
              ? String(raw.roomLocation)
              : undefined,
            flagForReview:
              typeof raw.flagForReview === "boolean"
                ? raw.flagForReview
                : Number(raw.confidence) < 70,
            aiNote: raw.aiNote ? String(raw.aiNote) : undefined,
          }),
        );
      } catch {
        return apiError(request, {
          code: "UPSTREAM_FAILED",
          message: "AI returned an unexpected format. Please try again.",
          status: 502,
        });
      }

      const draft: ContentsManifestDraft = {
        inspectionId: id,
        generatedAt: new Date().toISOString(),
        model: result.model,
        provider: result.tier === "basic" ? "gemma" : "byok",
        imageCount: contentItems.length,
        items,
        lowConfidenceCount: items.filter((i) => i.confidence < 70).length,
        flaggedForReviewCount: items.filter((i) => i.flagForReview).length,
        disclaimer:
          "This manifest is AI-assisted and requires review before use in claims. All values are estimates only. Items flagged for review require manual confirmation.",
      };

      // Persist draft to inspection record
      await prisma.inspection.update({
        where: { id, userId },
        data: { contentsManifestDraft: JSON.stringify(draft) },
      });

      return NextResponse.json({ data: draft }, { status: 201 });
    } catch (error: any) {
      if (
        error.message?.includes("API key") ||
        error.message?.includes("Integrations")
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "AI integration not configured. Check API key settings.",
          status: 422,
        });
      }

      return fromException(request, error, {
        stage: "contents-manifest:generate",
      });
    }
  });
}
