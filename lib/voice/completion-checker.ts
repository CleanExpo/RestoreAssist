/**
 * RA-396: S500:2025 inspection completion checker.
 *
 * Checks which required evidence items are missing from an inspection
 * and returns them ranked by priority (field-frequency of causing claim rejection).
 */

import type { S500CompletionItem, S500CompletionItemId, VoiceCopilotMode } from "./types";
import { prisma } from "@/lib/prisma";

// ─── Required items definition ────────────────────────────────────────────────

const REQUIRED_ITEMS: Omit<S500CompletionItem, "complete" | "completedAt">[] = [
  {
    id: "psychrometric_per_room",
    label: "Psychrometric data (temp + RH) in every affected room",
    s500Section: "§6",
    priority: 1,
    prompt: {
      guided: "You need to record temperature and relative humidity in every affected room. S500:2025 §6 requires this before equipment placement.",
      assisted: "Psychrometric data missing for some rooms — temp and RH needed.",
      dictation: "Psychrometric data incomplete.",
    },
  },
  {
    id: "moisture_baseline_structural",
    label: "Moisture readings at structural elements (studs, joists)",
    s500Section: "§8",
    priority: 1,
    prompt: {
      guided: "Take moisture readings at the structural elements — studs and joists if accessible. S500:2025 §8 requires baseline readings on all affected materials.",
      assisted: "Structural moisture readings needed — studs/joists.",
      dictation: "No structural readings logged.",
    },
  },
  {
    id: "water_source_photo",
    label: "Photo of water source / origin point",
    s500Section: "§9",
    priority: 1,
    prompt: {
      guided: "Get a photo of where the water came from — the source point. This is required for the insurance claim under S500:2025 §9.",
      assisted: "Water source photo missing.",
      dictation: "No source photo.",
    },
  },
  {
    id: "pre_drying_baseline",
    label: "Pre-drying moisture baseline for all affected materials",
    s500Section: "§8, §12",
    priority: 1,
    prompt: {
      guided: "Record baseline moisture readings for every affected material before you place any equipment. Once drying starts, the baseline is gone.",
      assisted: "Pre-drying baseline needed before equipment placement.",
      dictation: "No pre-drying baseline.",
    },
  },
  {
    id: "category_documented",
    label: "Water category documented with justification",
    s500Section: "§7.1",
    priority: 1,
    prompt: {
      guided: "Document the water category — Cat 1, 2, or 3 — and the reason. S500:2025 §7.1 requires this. What's the source?",
      assisted: "Category not documented — Cat 1, 2, or 3?",
      dictation: "Category missing.",
    },
  },
  {
    id: "class_with_area",
    label: "Damage class with square meterage estimate",
    s500Section: "§7.2",
    priority: 2,
    prompt: {
      guided: "What damage class is this — Class 1, 2, 3, or 4? And roughly how many square metres are affected? S500:2025 §7.2 needs both.",
      assisted: "Class and area estimate needed.",
      dictation: "Class/area not set.",
    },
  },
  {
    id: "equipment_serials",
    label: "Equipment serial numbers and placement positions",
    s500Section: "§14",
    priority: 2,
    prompt: {
      guided: "Log the serial number and position of every piece of equipment you're placing. S500:2025 §14 requires this for the equipment log.",
      assisted: "Equipment serials not logged — add serial numbers and positions.",
      dictation: "Equipment log incomplete.",
    },
  },
  {
    id: "affected_materials",
    label: "Affected material list with quantities",
    s500Section: "§9",
    priority: 2,
    prompt: {
      guided: "List out the affected materials with estimated quantities — square metres of plasterboard, carpet, etc. Insurers need specifics.",
      assisted: "Material list needs quantities.",
      dictation: "Affected materials list incomplete.",
    },
  },
  {
    id: "secondary_damage_indicators",
    label: "Secondary damage indicators checked and documented",
    s500Section: "§10.3",
    priority: 3,
    prompt: {
      guided: "Check for secondary damage — mould, efflorescence, staining, structural deformation. Document and photograph anything you find.",
      assisted: "Secondary damage indicators checked?",
      dictation: "Secondary damage not documented.",
    },
  },
  {
    id: "scope_boundary",
    label: "Scope boundary defined — affected vs. adjacent areas",
    s500Section: "§9",
    priority: 3,
    prompt: {
      guided: "Define the scope boundary clearly — what's affected, what's adjacent but not damaged. Ambiguous boundaries cause scope disputes.",
      assisted: "Scope boundary needs to be documented.",
      dictation: "Scope boundary undefined.",
    },
  },
];

// ─── Completion check ─────────────────────────────────────────────────────────

/**
 * Check which S500:2025 items are complete for a given inspection.
 * Reads from the DB to determine completion status.
 */
export async function checkCompletion(
  inspectionId: string,
): Promise<S500CompletionItem[]> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      moistureReadings: true,
      photos: { take: 50 },
      environmentalData: true,
      affectedAreas: true,
      scopeItems: { take: 20 },
      classifications: true,
    },
  });

  if (!inspection) return REQUIRED_ITEMS.map((i) => ({ ...i, complete: false }));

  const completionMap: Record<S500CompletionItemId, boolean> = {
    psychrometric_per_room:
      inspection.environmentalData !== null &&
      inspection.environmentalData !== undefined,

    moisture_baseline_structural:
      inspection.moistureReadings.some(
        (r) =>
          r.location?.toLowerCase().includes("stud") ||
          r.location?.toLowerCase().includes("joist") ||
          r.location?.toLowerCase().includes("frame") ||
          r.location?.toLowerCase().includes("structural"),
      ),

    water_source_photo:
      inspection.photos.some(
        (p) =>
          p.description?.toLowerCase().includes("source") ||
          p.description?.toLowerCase().includes("origin") ||
          p.description?.toLowerCase().includes("leak") ||
          (p as any).type?.toLowerCase().includes("source"),
      ),

    pre_drying_baseline:
      inspection.moistureReadings.length >= 3, // At least 3 baseline readings

    category_documented:
      inspection.classifications.some((c) => (c as any).waterCategory !== null),

    class_with_area:
      inspection.classifications.some(
        (c) => (c as any).damageClass !== null,
      ) && inspection.affectedAreas.some((a) => (a as any).area !== null && (a as any).area > 0),

    equipment_serials:
      inspection.scopeItems.some(
        (s) =>
          s.description?.toLowerCase().includes("serial") ||
          (s as any).itemCode?.toLowerCase().startsWith("eq"),
      ),

    affected_materials:
      inspection.affectedAreas.length >= 1 &&
      inspection.affectedAreas.some((a) => (a as any).area !== null && (a as any).area > 0),

    secondary_damage_indicators:
      inspection.photos.some(
        (p) =>
          p.description?.toLowerCase().includes("mould") ||
          p.description?.toLowerCase().includes("mold") ||
          p.description?.toLowerCase().includes("stain") ||
          p.description?.toLowerCase().includes("efflore"),
      ) ||
      inspection.classifications.some((c) =>
        (c as any).notes?.toLowerCase().includes("secondary"),
      ),

    scope_boundary:
      inspection.scopeItems.length >= 2,
  };

  return REQUIRED_ITEMS.map((item) => ({
    ...item,
    complete: completionMap[item.id] ?? false,
    completedAt: completionMap[item.id] ? new Date().toISOString() : undefined,
  }));
}

/**
 * Get the next prompt the copilot should say, based on mode and missing items.
 */
export function getNextPrompt(
  items: S500CompletionItem[],
  mode: VoiceCopilotMode,
): string | null {
  // Find highest-priority incomplete item
  const missing = items
    .filter((i) => !i.complete)
    .sort((a, b) => a.priority - b.priority);

  if (missing.length === 0) return null;

  const next = missing[0];
  return next.prompt[mode];
}

/**
 * Generate the session greeting based on what's missing.
 */
export function buildGreeting(
  items: S500CompletionItem[],
  mode: VoiceCopilotMode,
  inspectionAddress: string,
): string {
  const missing = items.filter((i) => !i.complete);
  const critical = missing.filter((i) => i.priority === 1);

  if (mode === "dictation") {
    return `Voice session started — ${inspectionAddress}. ${critical.length} critical items outstanding. Say your observations and I'll capture them.`;
  }

  if (missing.length === 0) {
    return `Voice session started — ${inspectionAddress}. All required items are complete. I'll listen for any additional observations.`;
  }

  const firstPrompt = getNextPrompt(items, mode) ?? "";
  return `Voice session started — ${inspectionAddress}. ${missing.length} items needed before you leave. ${firstPrompt}`;
}
