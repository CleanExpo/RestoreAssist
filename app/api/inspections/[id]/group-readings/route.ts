/**
 * POST /api/inspections/[id]/group-readings
 * PATCH /api/inspections/[id]/group-readings
 *
 * RA-1196 — AI auto-grouping of moisture readings into affected areas.
 *
 * POST: uses Claude Haiku to cluster this inspection's moisture readings
 *       into affected-area groups (fuzzy name match, e.g.
 *       "Master Bed wall" + "Master Bedroom floor" -> same group).
 *       Returns a preview payload. Writes NOTHING — user approves in UI.
 *
 * PATCH: bulk-applies reviewed groups to MoistureReading.affectedArea.
 *
 * Rules:
 *  - getServerSession required (CLAUDE.md rule 1)
 *  - Subscription gate allowlist: TRIAL / ACTIVE / LIFETIME (rule 8)
 *  - Rate limit: 10/min/user (ticket)
 *  - Anthropic key via getAnthropicApiKey(userId) — no env fallback
 *  - IICRC S500:2025 §6 (structural drying chambers) cited in prompt
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import Anthropic from "@anthropic-ai/sdk";

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];
const MODEL = "claude-haiku-4-5";

type ReadingInput = {
  id: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  depth: string;
};

type GroupOutput = {
  name: string;
  locations: string[];
  readingIds: string[];
  averageMoisture: number;
  elevatedCount: number;
};

type GroupResponse = {
  groups: GroupOutput[];
  unsortedReadingIds: string[];
};

const SYSTEM_PROMPT = `You are a structural drying expert clustering moisture readings into affected areas (drying chambers) per IICRC S500:2025 §6.

Your job: given a list of moisture readings taken at various sub-locations, group them by the underlying room / zone / drying chamber they belong to.

Fuzzy-match rules:
- "Master Bed wall" and "Master Bedroom floor" -> same group "Master Bedroom"
- "Kitchen" and "kitchen cabinets" -> same group "Kitchen"
- "LR" and "Living Room" -> same group "Living Room"
- Different floors / wings stay separate ("Upstairs Bath" vs "Downstairs Bath")
- Hallways, entries, landings stay separate from adjoining rooms
- When ambiguous, prefer fewer, larger groups that would constitute one drying chamber under S500:2025 §6

Output STRICT JSON only — no prose, no code fences:
{
  "groups": [
    {
      "name": "Canonical Room Name",
      "readingIds": ["cuid-1","cuid-2"]
    }
  ],
  "unsortedReadingIds": ["cuid-3"]
}

Every readingId from the input MUST appear exactly once across all "readingIds" arrays plus "unsortedReadingIds". Do NOT invent IDs.`;

// Haiku pricing (Anthropic listed rates)
const INPUT_UNIT_COST = 0.00000025; // $0.25 / M input tokens (Haiku 4.5)
const OUTPUT_UNIT_COST = 0.00000125; // $1.25 / M output tokens

// Moisture %MC threshold above which a reading is "elevated" for summary badge.
// 16%MC aligns with IICRC S500:2025 drying goal guidance for gypsum/timber.
const ELEVATED_THRESHOLD = 16;

function parseGroups(raw: string, readings: ReadingInput[]): GroupResponse {
  // Strip any accidental code fences / preamble
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0) {
    throw new Error("AI did not return JSON");
  }
  const json = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));

  const validIds = new Set(readings.map((r) => r.id));
  const byId = new Map(readings.map((r) => [r.id, r]));
  const seen = new Set<string>();

  const rawGroups = Array.isArray(json.groups) ? json.groups : [];
  const groups: GroupOutput[] = [];

  for (const g of rawGroups) {
    if (!g || typeof g.name !== "string") continue;
    const ids: string[] = Array.isArray(g.readingIds)
      ? g.readingIds.filter(
          (id: unknown): id is string =>
            typeof id === "string" && validIds.has(id) && !seen.has(id),
        )
      : [];
    if (ids.length === 0) continue;
    ids.forEach((id) => seen.add(id));

    const groupReadings = ids
      .map((id) => byId.get(id))
      .filter((r): r is ReadingInput => !!r);
    const locations = Array.from(new Set(groupReadings.map((r) => r.location)));
    const avg =
      groupReadings.reduce((s, r) => s + r.moistureLevel, 0) /
      groupReadings.length;
    const elevated = groupReadings.filter(
      (r) => r.moistureLevel >= ELEVATED_THRESHOLD,
    ).length;

    groups.push({
      name: g.name.slice(0, 200),
      locations,
      readingIds: ids,
      averageMoisture: parseFloat(avg.toFixed(2)),
      elevatedCount: elevated,
    });
  }

  const unsorted = readings.map((r) => r.id).filter((id) => !seen.has(id));

  return { groups, unsortedReadingIds: unsorted };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const rateLimited = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 10,
      prefix: "group-readings",
      key: userId,
    });
    if (rateLimited) return rateLimited;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionStatus: true },
    });
    if (
      !user ||
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")
    ) {
      return NextResponse.json(
        { error: "Active subscription required" },
        { status: 402 },
      );
    }

    const { id: inspectionId } = await context.params;

    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId },
      select: { id: true },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    const readings = await prisma.moistureReading.findMany({
      where: { inspectionId },
      select: {
        id: true,
        location: true,
        surfaceType: true,
        moistureLevel: true,
        depth: true,
      },
      orderBy: { recordedAt: "asc" },
      take: 500,
    });

    if (readings.length === 0) {
      return NextResponse.json({
        groups: [],
        unsortedReadingIds: [],
      } satisfies GroupResponse);
    }

    // Short-circuit trivially small sets — one group, no AI call needed.
    if (readings.length === 1) {
      const r = readings[0];
      return NextResponse.json({
        groups: [
          {
            name: r.location,
            locations: [r.location],
            readingIds: [r.id],
            averageMoisture: parseFloat(r.moistureLevel.toFixed(2)),
            elevatedCount: r.moistureLevel >= ELEVATED_THRESHOLD ? 1 : 0,
          },
        ],
        unsortedReadingIds: [],
      } satisfies GroupResponse);
    }

    let apiKey: string;
    try {
      apiKey = await getAnthropicApiKey(userId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Missing Anthropic API key";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    const userMessage = `Inspection readings (${readings.length}):

${readings
  .map(
    (r) =>
      `- id=${r.id}  location="${r.location}"  surface=${r.surfaceType}  level=${r.moistureLevel}%  depth=${r.depth}`,
  )
  .join("\n")}

Group these into affected areas per IICRC S500:2025 §6. Respond with the strict JSON schema only.`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const rawText =
      textBlock && textBlock.type === "text" ? textBlock.text : "";

    let parsed: GroupResponse;
    try {
      parsed = parseGroups(rawText, readings);
    } catch (parseErr) {
      console.error("[group-readings] parse failed:", parseErr, rawText);
      return NextResponse.json(
        { error: "AI response was not valid JSON" },
        { status: 502 },
      );
    }

    // Fire-and-forget usage logging (do not block the response)
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const totalCost =
      inputTokens * INPUT_UNIT_COST + outputTokens * OUTPUT_UNIT_COST;
    prisma.usageEvent
      .create({
        data: {
          userId,
          inspectionId,
          eventType: "AI_ASSISTANT_QUERY",
          eventData: JSON.stringify({
            feature: "group_moisture_readings",
            model: MODEL,
            inputTokens,
            outputTokens,
            readingCount: readings.length,
            groupCount: parsed.groups.length,
          }),
          unitCost: OUTPUT_UNIT_COST,
          units: outputTokens,
          totalCost,
          currency: "USD",
        },
      })
      .catch((e) => console.warn("[group-readings] usage log failed:", e));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[group-readings POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH — apply user-approved groups to MoistureReading.affectedArea.
 *
 * Body: {
 *   assignments: Array<{ name: string; readingIds: string[] }>,
 *   clearUnlisted?: boolean  // default false
 * }
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const rateLimited = await applyRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 10,
      prefix: "group-readings-patch",
      key: userId,
    });
    if (rateLimited) return rateLimited;

    const { id: inspectionId } = await context.params;

    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId },
      select: { id: true },
    });
    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    let body: {
      assignments?: Array<{ name?: string; readingIds?: string[] }>;
      clearUnlisted?: boolean;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const assignments = Array.isArray(body.assignments) ? body.assignments : [];
    if (assignments.length === 0) {
      return NextResponse.json(
        { error: "assignments array is required" },
        { status: 400 },
      );
    }

    const touchedIds = new Set<string>();
    type Op = { name: string; ids: string[] };
    const ops: Op[] = [];
    for (const a of assignments) {
      const name =
        typeof a.name === "string" ? a.name.trim().slice(0, 200) : "";
      const ids = Array.isArray(a.readingIds)
        ? a.readingIds.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          )
        : [];
      if (!name || ids.length === 0) continue;
      ids.forEach((id) => touchedIds.add(id));
      ops.push({ name, ids });
    }

    // updateMany with inspectionId guard prevents cross-inspection IDOR
    const result = await prisma.$transaction(async (tx) => {
      let updated = 0;
      for (const op of ops) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await (tx.moistureReading.updateMany as any)({
          where: { id: { in: op.ids }, inspectionId },
          data: { affectedArea: op.name },
        });
        updated += r.count;
      }
      let cleared = 0;
      if (body.clearUnlisted) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await (tx.moistureReading.updateMany as any)({
          where: {
            inspectionId,
            id: { notIn: Array.from(touchedIds) },
            NOT: { affectedArea: null },
          },
          data: { affectedArea: null },
        });
        cleared = r.count;
      }
      return { updated, cleared };
    });

    await prisma.auditLog
      .create({
        data: {
          inspectionId,
          action: "Moisture readings grouped",
          entityType: "MoistureReading",
          entityId: inspectionId,
          userId,
          changes: JSON.stringify({
            groupCount: ops.length,
            updated: result.updated,
            cleared: result.cleared,
          }),
        },
      })
      .catch((e) => console.warn("[group-readings] audit failed:", e));

    return NextResponse.json({
      updated: result.updated,
      cleared: result.cleared,
      groupCount: ops.length,
    });
  } catch (error) {
    console.error("[group-readings PATCH]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
