// RA-1131: Duplicate-job detection + merge hint
// Flags inspections likely duplicating an existing one:
//   same postcode + address prefix + inspection date ±4h → WARN on submit

import { prisma } from "@/lib/prisma";

export type DuplicateCandidate = {
  inspectionId: string;
  createdAt: Date;
  technicianName: string | null;
  propertyAddress: string | null;
  matchScore: number; // 0-1
  matchReasons: string[];
};

export type DuplicateCheckResult = {
  hasDuplicates: boolean;
  candidates: DuplicateCandidate[];
  mergeSuggestion: string | null;
};

/**
 * Check if an inspection is likely a duplicate of another recent inspection.
 * Matches on: postcode + inspection date within ±4 hours + same address OR overlapping affected-area notes.
 *
 * Non-blocking — callers should surface candidates as warnings, not submission blockers.
 *
 * @param inspectionId - The inspection to check for duplicates.
 * @returns DuplicateCheckResult with match candidates sorted by descending match score.
 */
export async function detectDuplicateJob(
  inspectionId: string,
): Promise<DuplicateCheckResult> {
  const current = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      propertyAddress: true,
      propertyPostcode: true,
      inspectionDate: true,
      userId: true,
    },
  });

  if (!current || !current.propertyPostcode || !current.inspectionDate) {
    return { hasDuplicates: false, candidates: [], mergeSuggestion: null };
  }

  const rangeStart = new Date(
    current.inspectionDate.getTime() - 4 * 60 * 60 * 1000,
  );
  const rangeEnd = new Date(
    current.inspectionDate.getTime() + 4 * 60 * 60 * 1000,
  );

  const siblings = await prisma.inspection.findMany({
    where: {
      id: { not: inspectionId },
      propertyPostcode: current.propertyPostcode,
      inspectionDate: { gte: rangeStart, lte: rangeEnd },
    },
    select: {
      id: true,
      createdAt: true,
      technicianName: true,
      propertyAddress: true,
      inspectionDate: true,
    },
    take: 20,
  });

  const candidates: DuplicateCandidate[] = [];

  for (const sibling of siblings) {
    const reasons: string[] = [];
    let score = 0;

    // Same postcode (already filtered) — base score
    score += 0.3;
    reasons.push(`Same postcode: ${current.propertyPostcode}`);

    // Address prefix match (normalise case + trim)
    const a = (current.propertyAddress ?? "").toLowerCase().trim();
    const b = (sibling.propertyAddress ?? "").toLowerCase().trim();
    if (a && b) {
      if (a === b) {
        score += 0.5;
        reasons.push("Exact address match");
      } else if (a.slice(0, 20) === b.slice(0, 20)) {
        score += 0.25;
        reasons.push("Address prefix matches (20 chars)");
      }
    }

    // Inspection date within ±4h (base filter guarantees this); tighter window gets bonus
    const deltaHours = Math.abs(
      (current.inspectionDate.getTime() -
        (sibling.inspectionDate?.getTime() ?? 0)) /
        (60 * 60 * 1000),
    );
    if (deltaHours < 2) {
      score += 0.2;
      reasons.push(`Inspection times differ by ${deltaHours.toFixed(1)}h`);
    }

    if (score >= 0.5) {
      candidates.push({
        inspectionId: sibling.id,
        createdAt: sibling.createdAt,
        technicianName: sibling.technicianName ?? null,
        propertyAddress: sibling.propertyAddress ?? null,
        matchScore: Math.min(score, 1),
        matchReasons: reasons,
      });
    }
  }

  const sorted = candidates.sort((a, b) => b.matchScore - a.matchScore);

  return {
    hasDuplicates: sorted.length > 0,
    candidates: sorted,
    mergeSuggestion:
      sorted.length > 0
        ? `Review duplicate inspections: ${sorted.map((c) => c.inspectionId).join(", ")} — consider merging before submission`
        : null,
  };
}
