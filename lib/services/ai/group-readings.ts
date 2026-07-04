/**
 * Moisture-reading AI auto-grouper.
 *
 * Composes lib/services/ai/anthropic-gateway.ts with the S500:2021 §6
 * drying-chamber clustering prompt + tolerant JSON parser. The action layer
 * (app/api/inspections/[id]/group-readings/route.ts) resolves the workspace's
 * own BYOK Anthropic key (RA-6960) and passes it through as the gateway
 * override, maps result.reason to HTTP, and owns inspection-tenancy + the
 * readings fetch.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { callAnthropic } from "./anthropic-gateway";
import type { AnthropicReason } from "./anthropic-gateway";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

const SYSTEM_PROMPT = `You are a structural drying expert clustering moisture readings into affected areas (drying chambers) per IICRC S500:2021 §6.

Your job: given a list of moisture readings taken at various sub-locations, group them by the underlying room / zone / drying chamber they belong to.

Fuzzy-match rules:
- "Master Bed wall" and "Master Bedroom floor" -> same group "Master Bedroom"
- "Kitchen" and "kitchen cabinets" -> same group "Kitchen"
- "LR" and "Living Room" -> same group "Living Room"
- Different floors / wings stay separate ("Upstairs Bath" vs "Downstairs Bath")
- Hallways, entries, landings stay separate from adjoining rooms
- When ambiguous, prefer fewer, larger groups that would constitute one drying chamber under S500:2021 §6

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

// Moisture %MC threshold above which a reading is "elevated" for summary badge.
// 16%MC aligns with IICRC S500:2021 drying-goal guidance for gypsum/timber.
const ELEVATED_THRESHOLD = 16;

export type GroupReadingsReason = AnthropicReason | "PARSE_FAILED";

/**
 * Reading payload — Record<string, unknown> relaxation matches Task 2
 * precedent so the route can pass Prisma-shaped rows without a strict
 * service-side interface (id/location/moistureLevel are read at runtime).
 */
export interface GroupReadingsPayload {
  readings: Array<Record<string, unknown>>;
}

export interface GroupReadingsGroup {
  name: string;
  locations: string[];
  readingIds: string[];
  averageMoisture: number;
  elevatedCount: number;
}

export interface GroupReadingsResult {
  groups: GroupReadingsGroup[];
  unsortedReadingIds: string[];
}

interface NormalizedReading {
  id: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  depth: string;
}

function normalize(readings: Array<Record<string, unknown>>): NormalizedReading[] {
  const out: NormalizedReading[] = [];
  for (const r of readings) {
    if (!r || typeof r.id !== "string") continue;
    out.push({
      id: r.id,
      location: typeof r.location === "string" ? r.location : "",
      surfaceType: typeof r.surfaceType === "string" ? r.surfaceType : "",
      moistureLevel:
        typeof r.moistureLevel === "number" ? r.moistureLevel : 0,
      depth: typeof r.depth === "string" ? r.depth : "",
    });
  }
  return out;
}

export async function groupReadings(args: {
  userId: string;
  /**
   * RA-6960 (BYOK, P1) — the calling workspace's own Anthropic key, resolved by
   * the group-readings route via resolveWorkspaceAiKey and passed through as the
   * gateway override so this customer workload never spends the platform
   * ANTHROPIC_API_KEY.
   */
  apiKey: string;
  payload: GroupReadingsPayload;
}): Promise<ServiceResult<GroupReadingsResult, GroupReadingsReason>> {
  const readings = normalize(args.payload.readings);

  const userMessage = `Inspection readings (${readings.length}):

${readings
  .map(
    (r) =>
      `- id=${r.id}  location="${r.location}"  surface=${r.surfaceType}  level=${r.moistureLevel}%  depth=${r.depth}`,
  )
  .join("\n")}

Group these into affected areas per IICRC S500:2021 §6. Respond with the strict JSON schema only.`;

  const gatewayResult = await callAnthropic({
    userId: args.userId,
    apiKey: args.apiKey,
    request: {
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    },
  });

  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const textBlock = gatewayResult.data.content.find((b) => b.type === "text");
  const raw =
    textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

  // Tolerant parse: strip ```json fences and pick the first/last brace.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0) {
    return fail("PARSE_FAILED", {
      detail: `Model output was not valid JSON: ${raw.slice(0, 200)}`,
    });
  }

  let json: unknown;
  try {
    json = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  } catch (err) {
    return fail("PARSE_FAILED", {
      detail: `Model output was not valid JSON: ${raw.slice(0, 200)}`,
      cause: err,
    });
  }

  const root = json as { groups?: unknown };
  const rawGroups = Array.isArray(root.groups) ? root.groups : [];

  const validIds = new Set(readings.map((r) => r.id));
  const byId = new Map(readings.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const groups: GroupReadingsGroup[] = [];

  for (const g of rawGroups) {
    if (!g || typeof (g as { name?: unknown }).name !== "string") continue;
    const gObj = g as { name: string; readingIds?: unknown };
    const ids: string[] = Array.isArray(gObj.readingIds)
      ? (gObj.readingIds as unknown[]).filter(
          (id): id is string =>
            typeof id === "string" && validIds.has(id) && !seen.has(id),
        )
      : [];
    if (ids.length === 0) continue;
    ids.forEach((id) => seen.add(id));

    const groupReadingRows = ids
      .map((id) => byId.get(id))
      .filter((r): r is NormalizedReading => !!r);
    const locations = Array.from(
      new Set(groupReadingRows.map((r) => r.location)),
    );
    const avg =
      groupReadingRows.reduce((s, r) => s + r.moistureLevel, 0) /
      groupReadingRows.length;
    const elevated = groupReadingRows.filter(
      (r) => r.moistureLevel >= ELEVATED_THRESHOLD,
    ).length;

    groups.push({
      name: gObj.name.slice(0, 200),
      locations,
      readingIds: ids,
      averageMoisture: parseFloat(avg.toFixed(2)),
      elevatedCount: elevated,
    });
  }

  const unsorted = readings.map((r) => r.id).filter((id) => !seen.has(id));

  return ok({ groups, unsortedReadingIds: unsorted });
}
