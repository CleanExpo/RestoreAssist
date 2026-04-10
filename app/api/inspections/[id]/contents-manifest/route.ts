/**
 * Contents Manifest AI Draft
 *
 * POST /api/inspections/:id/contents-manifest
 *   Sends all AFFECTED_CONTENTS evidence images to the AI model router
 *   (Gemma-4-31B-IT for basic, BYOK for detailed) and returns a structured
 *   draft manifest of identified household items.
 *
 * GET /api/inspections/:id/contents-manifest
 *   Returns the stored manifest draft (if previously generated).
 *
 * RA-405: Sprint H — Contents manifest AI draft
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { workspaceRouteAiRequest } from "@/lib/ai/workspace-byok-dispatch";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, contentsManifestDraft: true },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    if (!inspection.contentsManifestDraft) {
      return NextResponse.json({ data: null });
    }

    const draft = JSON.parse(
      inspection.contentsManifestDraft as string,
    ) as ContentsManifestDraft;
    return NextResponse.json({ data: draft });
  } catch (error) {
    console.error("Error fetching contents manifest:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─── POST — generate draft manifest ─────────────────────────────────────────

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

    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      include: {
        evidenceItems: {
          where: { evidenceClass: "AFFECTED_CONTENTS" },
          select: {
            id: true,
            fileUrl: true,
            fileName: true,
            title: true,
            description: true,
            roomName: true,
          },
        },
      },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    if (!inspection.workspaceId) {
      return NextResponse.json(
        {
          error:
            "This inspection is not linked to a workspace. Configure AI Providers in Workspace Settings to use the contents manifest feature.",
        },
        { status: 422 },
      );
    }

    const contentItems = inspection.evidenceItems.filter((e) => e.fileUrl);

    if (contentItems.length === 0) {
      return NextResponse.json(
        {
          error:
            "No contents evidence photos found. Capture AFFECTED_CONTENTS photos in the evidence workflow first.",
        },
        { status: 422 },
      );
    }

    // Build image list for AI context
    const imageList = contentItems
      .map(
        (item, i) =>
          `${i + 1}. ${item.title ?? item.fileName ?? "Image"} — Room: ${item.roomName ?? "Unknown"}${item.description ? ` — ${item.description}` : ""}`,
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

    // Parse AI response
    let items: ContentsManifestItem[] = [];
    try {
      const parsed = JSON.parse(result.text);
      items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      console.error(
        "[contents-manifest] Failed to parse AI JSON:",
        result.text.substring(0, 200),
      );
      return NextResponse.json(
        { error: "AI returned an unexpected format. Please try again." },
        { status: 502 },
      );
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
      where: { id },
      data: { contentsManifestDraft: JSON.stringify(draft) },
    });

    return NextResponse.json({ data: draft }, { status: 201 });
  } catch (error: any) {
    console.error("Error generating contents manifest:", error);

    if (
      error.message?.includes("API key") ||
      error.message?.includes("Integrations")
    ) {
      return NextResponse.json(
        { error: "AI integration not configured. Check API key settings." },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
