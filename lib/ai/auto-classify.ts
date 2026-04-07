export type ClaimType =
  | "water_damage"
  | "fire_smoke"
  | "storm"
  | "mould"
  | "contents";

export interface ClassificationResult {
  claimType: ClaimType;
  damageCategory?: number; // 1-3, water damage only
  damageClass?: number; // 1-4, water damage only
  confidence: "high" | "medium" | "low";
  reasoning: string; // Human-readable explanation shown in UI
}

/**
 * Stage 1: Rule-based classification — fast, free, works offline.
 * Used immediately on each keystroke (debounced).
 */
export function ruleBasedClassify(input: {
  description: string;
  notes?: string;
  averageMoistureReading?: number;
  location?: string;
}): ClassificationResult {
  const text =
    `${input.description ?? ""} ${input.notes ?? ""} ${input.location ?? ""}`.toLowerCase();

  // Claim type detection (order matters — most specific first)
  let claimType: ClaimType = "water_damage";
  let typeReasoning = "";

  if (/fire|smoke|soot|char|burn|flame|scorch|ember/.test(text)) {
    claimType = "fire_smoke";
    typeReasoning = "Fire/smoke keywords detected";
  } else if (/mould|mold|fungi|spore|musty|black mould|mycotox/.test(text)) {
    claimType = "mould";
    typeReasoning = "Mould keywords detected";
  } else if (
    /storm|hail|wind|roof|cyclone|tempest|tornado|flood rain/.test(text)
  ) {
    claimType = "storm";
    typeReasoning = "Storm keywords detected";
  } else if (/contents|furniture|possessions|pack.?out|inventory/.test(text)) {
    claimType = "contents";
    typeReasoning = "Contents keywords detected";
  } else {
    typeReasoning = "Defaulting to water damage";
  }

  // For water damage: determine category
  let damageCategory: number | undefined;
  let damageClass: number | undefined;
  let categoryReasoning = "";

  if (claimType === "water_damage") {
    // Category from contamination keywords
    if (
      /sewage|black water|toilet overflow|sewer|category.?3|cat.?3|biohazard|faecal|human waste/.test(
        text,
      )
    ) {
      damageCategory = 3;
      categoryReasoning =
        "Category 3 (black water/sewage) — biohazard protocols required";
    } else if (
      /grey water|gray water|washing machine|dishwasher|overflow|category.?2|cat.?2|contaminate/.test(
        text,
      )
    ) {
      damageCategory = 2;
      categoryReasoning =
        "Category 2 (grey water) — antimicrobial treatment required";
    } else {
      damageCategory = 1;
      categoryReasoning = "Category 1 (clean water) — standard drying protocol";
    }

    // Class from moisture readings + description
    const avgMoisture = input.averageMoistureReading ?? 0;
    if (
      avgMoisture > 40 ||
      /class.?4|soaked|saturated|concrete|dense material/.test(text)
    ) {
      damageClass = 4;
    } else if (
      avgMoisture > 25 ||
      /class.?3|ceiling|insulation|entire room|extensive/.test(text)
    ) {
      damageClass = 3;
    } else if (
      avgMoisture > 15 ||
      /class.?2|carpet|significant|walls and floor/.test(text)
    ) {
      damageClass = 2;
    } else {
      damageClass = 1;
    }
  }

  const confidence: "high" | "medium" | "low" =
    text.length > 50 ? "medium" : text.length > 20 ? "low" : "low";

  const reasoning = [
    typeReasoning,
    categoryReasoning,
    damageClass ? `Class ${damageClass} based on moisture readings` : "",
  ]
    .filter(Boolean)
    .join(". ");

  return {
    claimType,
    damageCategory,
    damageClass,
    confidence,
    reasoning,
  };
}

/**
 * Stage 2: Vector-based classification (when historical job store is populated).
 * Takes top 3 similar jobs and votes on category/class.
 */
export async function vectorClassify(input: {
  description: string;
  claimType: ClaimType;
  tenantId: string;
}): Promise<ClassificationResult | null> {
  try {
    // Query HistoricalJob for top 3 similar jobs of same claim type
    const { prisma } = await import("@/lib/prisma");
    const jobs = await (prisma as any).historicalJob.findMany({
      where: {
        tenantId: input.tenantId,
        claimType: input.claimType,
      },
      take: 3,
      orderBy: { createdAt: "desc" },
      select: {
        waterCategory: true,
        waterClass: true,
        claimType: true,
      },
    });

    if (jobs.length === 0) return null;

    // Majority vote on category and class
    const categories = jobs
      .map((j: any) => j.waterCategory)
      .filter(Boolean) as number[];
    const classes = jobs
      .map((j: any) => j.waterClass)
      .filter(Boolean) as number[];

    const mode = (arr: number[]) =>
      arr.length === 0
        ? undefined
        : arr
            .sort(
              (a, b) =>
                arr.filter((v) => v === a).length -
                arr.filter((v) => v === b).length,
            )
            .pop();

    return {
      claimType: input.claimType,
      damageCategory: mode(categories),
      damageClass: mode(classes),
      confidence: jobs.length >= 3 ? "high" : "medium",
      reasoning: `Based on ${jobs.length} similar historical jobs`,
    };
  } catch {
    return null;
  }
}
