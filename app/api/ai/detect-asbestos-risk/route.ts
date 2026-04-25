/**
 * POST /api/ai/detect-asbestos-risk
 *
 * Claude Vision analysis of inspection photos to flag potential ACM (Asbestos
 * Containing Materials). Pre-2004 AU / pre-2000 NZ properties are high-risk.
 * Triggers AS/NZS 4849.1 workflow on positive detection.
 *
 * Body:
 * {
 *   inspectionId: string
 *   photoUrls?: string[]  // if omitted, uses all InspectionPhoto.url for the inspection
 * }
 *
 * P1-WHS3 — RA-1130
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";

const MODEL = "claude-opus-4-7";

// AU/NZ asbestos cutoff years
const AU_ASBESTOS_CUTOFF = 2004;
const NZ_ASBESTOS_CUTOFF = 2000;

interface AsbestosRiskResult {
  inspectionId: string;
  riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  triggerAsNzs4849: boolean;
  findings: string[];
  recommendedActions: string[];
  analysedPhotoCount: number;
  yearBuiltFlag: boolean;
  jurisdiction: "AU" | "NZ" | "UNKNOWN";
}

function detectJurisdiction(postcode: string): "AU" | "NZ" | "UNKNOWN" {
  if (/^\d{4}$/.test(postcode)) return "AU";
  if (/^\d{4}$/.test(postcode) && parseInt(postcode) >= 1000 && parseInt(postcode) <= 9999) return "AU";
  if (/^\d{4}$/.test(postcode)) return "AU"; // AU 4-digit
  return "UNKNOWN";
}

async function analysePhotoForAsbestos(
  photoUrl: string,
  building: { yearBuilt?: number | null; jurisdiction: "AU" | "NZ" | "UNKNOWN" },
): Promise<{ risk: "NONE" | "LOW" | "MEDIUM" | "HIGH"; finding: string }> {
  try {
    const contextNote =
      building.yearBuilt
        ? `The building was constructed in ${building.yearBuilt}, which is ${
            (building.jurisdiction === "AU" && building.yearBuilt < AU_ASBESTOS_CUTOFF) ||
            (building.jurisdiction === "NZ" && building.yearBuilt < NZ_ASBESTOS_CUTOFF)
              ? "BEFORE the asbestos ban — HIGH RISK background"
              : "after the asbestos ban — lower background risk"
          }.`
        : "Building construction year is unknown.";

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: photoUrl },
            },
            {
              type: "text",
              text: `You are a licensed asbestos assessor reviewing a building photo for potential Asbestos Containing Materials (ACM).

${contextNote}

Look for visual indicators of ACM:
- Corrugated cement sheeting (Super Six / fibrolite roofing)
- Flat compressed cement sheet (eaves, wall cladding, soffits)
- Textured ceilings (popcorn/stipple finish)
- Vinyl floor tiles with black mastic adhesive
- Pipe lagging or duct insulation
- Rope gaskets around boilers/furnaces

Respond ONLY with valid JSON:
{
  "risk": "NONE" | "LOW" | "MEDIUM" | "HIGH",
  "finding": "<one sentence, max 30 words>"
}`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim()) as {
      risk: "NONE" | "LOW" | "MEDIUM" | "HIGH";
      finding: string;
    };
    return { risk: parsed.risk, finding: parsed.finding };
  } catch {
    return { risk: "LOW", finding: "Analysis incomplete — manual inspection recommended" };
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { inspectionId?: string; photoUrls?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { inspectionId } = body;
  if (!inspectionId) {
    return NextResponse.json({ error: "inspectionId is required" }, { status: 400 });
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      userId: true,
      propertyPostcode: true,
      propertyYearBuilt: true,
      photos: { select: { url: true }, take: 20 },
    },
  });

  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jurisdiction = detectJurisdiction(inspection.propertyPostcode);
  const yearBuilt = inspection.propertyYearBuilt;
  const yearBuiltFlag =
    !!yearBuilt &&
    ((jurisdiction === "AU" && yearBuilt < AU_ASBESTOS_CUTOFF) ||
      (jurisdiction === "NZ" && yearBuilt < NZ_ASBESTOS_CUTOFF) ||
      (jurisdiction === "UNKNOWN" && yearBuilt < 2004));

  const photoUrls = body.photoUrls?.length
    ? body.photoUrls
    : inspection.photos.map((p) => p.url);

  const findings: string[] = [];
  let overallRisk: "NONE" | "LOW" | "MEDIUM" | "HIGH" = yearBuiltFlag ? "LOW" : "NONE";
  const riskOrder = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

  const building = { yearBuilt, jurisdiction };
  let analysedCount = 0;

  for (const url of photoUrls.slice(0, 10)) {
    const { risk, finding } = await analysePhotoForAsbestos(url, building);
    analysedCount++;
    if (risk !== "NONE") {
      findings.push(finding);
    }
    if (riskOrder[risk] > riskOrder[overallRisk]) {
      overallRisk = risk;
    }
  }

  const triggerAsNzs4849 = overallRisk === "HIGH" || (overallRisk === "MEDIUM" && yearBuiltFlag);

  const recommendedActions: string[] = [];
  if (triggerAsNzs4849) {
    recommendedActions.push(
      "Engage a licensed asbestos assessor before any demolition or disturbance work",
      "Follow AS/NZS 4849.1 sampling and assessment procedure",
      "Obtain clearance certificate before proceeding with restoration",
    );
  }
  if (yearBuiltFlag) {
    recommendedActions.push(
      `Property built before asbestos ban (${jurisdiction === "NZ" ? NZ_ASBESTOS_CUTOFF : AU_ASBESTOS_CUTOFF}) — treat all cement sheeting as suspected ACM until tested`,
    );
  }
  if (overallRisk === "NONE" && !yearBuiltFlag) {
    recommendedActions.push("No visual ACM indicators detected — standard precautions apply");
  }

  const result: AsbestosRiskResult = {
    inspectionId,
    riskLevel: overallRisk,
    triggerAsNzs4849,
    findings,
    recommendedActions,
    analysedPhotoCount: analysedCount,
    yearBuiltFlag,
    jurisdiction,
  };

  return NextResponse.json(result);
}
