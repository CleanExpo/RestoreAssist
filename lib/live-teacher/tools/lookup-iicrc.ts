import { z } from "zod";

import { standardCite } from "@/lib/nir-standards-mapping";
import { describeClause } from "@/lib/reports/clause-descriptions";
import { S500_SECTIONS } from "@/lib/standards/s500-sections";
import { S520_SECTIONS } from "@/lib/standards/s520-sections";

// COPYRIGHT: results are built from the verified section indexes (numbers +
// short titles — a table of contents) and our own paraphrased clause
// descriptions. Verbatim standard prose never enters this tool; the indexes
// themselves are enforced by scripts/check-no-verbatim-standards.ts.

export const lookupIicrcSchema = z.object({
  // Required by the dispatch-layer tenancy guard (dispatchTool), like every
  // Live-Teacher tool, even though this lookup reads no inspection data.
  inspectionId: z.string(),
  query: z.string().min(2),
  standard: z.enum(["S500", "S520"]).optional(),
});

export type LookupIicrcArgs = z.infer<typeof lookupIicrcSchema>;

export interface IicrcSectionMatch {
  standard: "S500" | "S520";
  section: string;
  title: string;
  /** Edition-qualified citation, e.g. "S500:2021 §10.4.1" (CLAUDE.md rule 12). */
  citation: string;
  /** Our paraphrased guidance for the clause, when we have one. */
  guidance: string | null;
}

const MAX_MATCHES = 5;

const INDEXES: Array<{ standard: "S500" | "S520"; sections: Readonly<Record<string, string>> }> = [
  { standard: "S500", sections: S500_SECTIONS },
  { standard: "S520", sections: S520_SECTIONS },
];

function toMatch(
  standard: "S500" | "S520",
  section: string,
  title: string,
): IicrcSectionMatch {
  const citation = standardCite(standard, section);
  const guidance = describeClause(citation);
  return {
    standard,
    section,
    title,
    citation,
    guidance: guidance === "Standards reference" ? null : guidance,
  };
}

export async function lookupIicrc(
  args: LookupIicrcArgs,
): Promise<{ matches: IicrcSectionMatch[] }> {
  const { query, standard } = lookupIicrcSchema.parse(args);
  const indexes = standard
    ? INDEXES.filter((i) => i.standard === standard)
    : INDEXES;

  const sectionRef = query.replace(/^§\s*/u, "").trim();
  const matches: IicrcSectionMatch[] = [];

  if (/^\d+(\.\d+)*$/u.test(sectionRef)) {
    // Direct section reference: exact hit first, then child subsections.
    for (const { standard: std, sections } of indexes) {
      const exact = sections[sectionRef];
      if (exact) matches.push(toMatch(std, sectionRef, exact));
      for (const [section, title] of Object.entries(sections)) {
        if (matches.length >= MAX_MATCHES) break;
        if (section.startsWith(`${sectionRef}.`)) {
          matches.push(toMatch(std, section, title));
        }
      }
    }
    return { matches: matches.slice(0, MAX_MATCHES) };
  }

  // Keyword search over section titles: rank by how many query words hit.
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return { matches: [] };

  const scored: Array<{ score: number; match: IicrcSectionMatch }> = [];
  for (const { standard: std, sections } of indexes) {
    for (const [section, title] of Object.entries(sections)) {
      const haystack = title.toLowerCase();
      const score = words.filter((w) => haystack.includes(w)).length;
      if (score > 0) scored.push({ score, match: toMatch(std, section, title) });
    }
  }
  scored.sort(
    (a, b) =>
      b.score - a.score || a.match.section.localeCompare(b.match.section),
  );
  return { matches: scored.slice(0, MAX_MATCHES).map((s) => s.match) };
}

export const lookupIicrcDefinition = {
  name: "lookup_iicrc",
  description:
    "Look up IICRC S500/S520 sections by section number (e.g. '10.4.1') or keywords (e.g. 'personal protective equipment'). Returns edition-qualified citations with section titles and paraphrased guidance. Read-only; never returns verbatim standard text.",
  input_schema: {
    type: "object" as const,
    properties: {
      inspectionId: { type: "string", description: "The inspection ID" },
      query: {
        type: "string",
        description: "Section number or keywords to search for",
      },
      standard: {
        type: "string",
        enum: ["S500", "S520"],
        description: "Restrict the lookup to one standard (optional)",
      },
    },
    required: ["inspectionId", "query"],
  },
};
