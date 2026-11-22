/**
 * RA-7687 slice 1 - compare extracted facts with what the job already holds.
 *
 * Pure function. Each fact is judged on its own field against its own job
 * value, so a citation that supports one field can never qualify another
 * (RA-7687, 20 Nov per-hazard provenance note). The report is never treated as
 * evidence that anything is cleared or safe: a gap is only "this report does
 * not state it".
 *
 * IICRC references go through standardCite() (rule 14). No standard text is
 * quoted: the standards library has no human-written clause entries yet, so a
 * gap says "check manually" instead of guessing a clause.
 */

import { standardCite } from "@/lib/nir-standards-mapping";
import type { ExtractedFact, LabField } from "./schema";

export type FactStatus = "agrees" | "conflicts" | "new";

export interface JobLabValues {
  labName?: string | null;
  labReportReference?: string | null;
  samplingDate?: Date | string | null;
  sporeType?: string | null;
  sporeCountPreRemediation?: number | null;
  outdoorBaselineCount?: number | null;
  sporeCountPostRemediation?: number | null;
}

export interface ComparedFact extends ExtractedFact {
  status: FactStatus;
  /** The job's current value as text, or null when the job holds none. */
  jobValue: string | null;
}

export interface ReportGap {
  code: "NO_OUTDOOR_BASELINE" | "NO_SAMPLING_DATE" | "NO_LAB_IDENTITY";
  message: string;
}

export interface Comparison {
  facts: ComparedFact[];
  gaps: ReportGap[];
}

const NOT_COVERED = "Not covered by the standards library. Check manually.";

function jobValueText(field: LabField, job: JobLabValues | null): string | null {
  const raw = job?.[field];
  if (raw === null || raw === undefined || raw === "") return null;
  if (field === "samplingDate") {
    const d = raw instanceof Date ? raw : new Date(raw as string);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return String(raw);
}

function sameValue(field: LabField, a: string | number, b: string): boolean {
  if (typeof a === "number") return Number(b) === a;
  if (field === "samplingDate") return a === b;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function compareFacts(
  facts: ExtractedFact[],
  job: JobLabValues | null,
): Comparison {
  const compared = facts.map((fact): ComparedFact => {
    const jobValue = jobValueText(fact.field, job);
    const status: FactStatus =
      jobValue === null
        ? "new"
        : sameValue(fact.field, fact.value, jobValue)
          ? "agrees"
          : "conflicts";
    return { ...fact, status, jobValue };
  });

  const has = (field: LabField) => facts.some((f) => f.field === field);
  const gaps: ReportGap[] = [];
  const hasIndoorCount =
    has("sporeCountPreRemediation") || has("sporeCountPostRemediation");
  if (hasIndoorCount && !has("outdoorBaselineCount")) {
    gaps.push({
      code: "NO_OUTDOOR_BASELINE",
      message: `This report gives an indoor spore count but no outdoor baseline sample. See ${standardCite("S520")} for the sampling context. ${NOT_COVERED}`,
    });
  }
  if (!has("samplingDate")) {
    gaps.push({
      code: "NO_SAMPLING_DATE",
      message: "This report does not state a sampling date.",
    });
  }
  if (!has("labName") && !has("labReportReference")) {
    gaps.push({
      code: "NO_LAB_IDENTITY",
      message:
        "This report does not name the laboratory or give a report reference.",
    });
  }
  return { facts: compared, gaps };
}
