/**
 * Per-document AI section extraction for the standards-retrieval subsystem.
 *
 * Migrated from `extractRelevantSectionsWithAI` in lib/standards-retrieval.ts.
 * Wraps lib/services/ai/anthropic-gateway.ts via callAnthropic with a cached
 * system prompt (90% input-token savings on cache hits).
 *
 * Graceful-fallback semantic preserved: a gateway failure or empty model
 * output still returns ok() with a single fallback sentence so the composer
 * keeps building a context even when one document's extraction misfires
 * (matches legacy try/catch behaviour in the original function).
 *
 * Gateway-mapped reasons are NOT propagated as ServiceResult failures here —
 * the composer wraps many documents and a partial failure shouldn't abort
 * the whole batch. If you need strict propagation, call this in a wrapper
 * that inspects the raw model response instead.
 *
 * @see lib/standards-retrieval.ts (composer)
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";
import type { AnthropicReason } from "@/lib/services/ai/anthropic-gateway";
import {
  createCachedSystemPrompt,
  extractCacheMetrics,
  logCacheMetrics,
} from "@/lib/anthropic/features/prompt-cache";
import { ok, type ServiceResult } from "@/lib/services/_shared/result";
import type { RetrievalQuery } from "@/lib/standards-retrieval-types";
import { determineRelevantStandards } from "@/lib/standards-retrieval-types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4000;
const MAX_DOC_CHARS = 150_000;
const MAX_SECTIONS = 5;
const MIN_SECTION_CHARS = 50;

export type ExtractSectionsReason = AnthropicReason | "PARSE_FAILED";

export interface ExtractStandardsSectionsArgs {
  apiKey: string;
  documentText: string;
  fileName: string;
  query: RetrievalQuery;
}

const SYSTEM_PROMPT = `You are a senior IICRC-certified water damage restoration specialist and standards expert with 30+ years of experience. Your task is to extract the MOST CRITICAL and RELEVANT sections from a standards document for generating a professional forensic restoration report.

Your extraction must:
1. Focus on PROCEDURAL REQUIREMENTS - step-by-step protocols that must be followed
2. Identify COMPLIANCE MANDATES - legal and regulatory requirements
3. Extract TECHNICAL SPECIFICATIONS - equipment, materials, measurements, tolerances
4. Capture STANDARD REFERENCES - exact citations (e.g., "IICRC S500 Section 14.3.2")
5. Highlight SAFETY PROTOCOLS - OH&S, PPE, containment requirements
6. Note MATERIAL-SPECIFIC GUIDELINES - if materials are mentioned in the query

For each relevant section, provide:
- Section Title (descriptive, specific)
- Exact Text Content (preserve all standard references, numbers, measurements)
- Standard Reference (e.g., "IICRC S500 Sec 14.2", "AS/NZS 3000:2018")
- Application to Report (how this applies to the specific query context)

Prioritise sections that:
- Are directly applicable to the water category/class
- Address the specific materials mentioned
- Contain mandatory compliance requirements
- Include verifiable procedures and protocols
- Reference Australian standards (AS/NZS) when applicable

Format as a numbered list with clear structure.`;

function fallbackSection(query: RetrievalQuery): string[] {
  return [
    `Document contains relevant information about ${query.reportType} damage restoration`,
  ];
}

function buildUserPrompt(args: ExtractStandardsSectionsArgs): string {
  const truncatedText =
    args.documentText.length > MAX_DOC_CHARS
      ? args.documentText.substring(0, MAX_DOC_CHARS) +
        "\n\n[Document truncated...]"
      : args.documentText;

  const relevantStandards = determineRelevantStandards(args.query);
  const keywords = [
    ...relevantStandards,
    ...(args.query.keywords || []),
    ...(args.query.materials || []),
    ...(args.query.affectedAreas || []),
  ];

  return `Document: ${args.fileName}

REPORT CONTEXT (Use this to determine relevance):
- Report Type: ${args.query.reportType} damage restoration
- Water Category: ${args.query.waterCategory ? `Category ${args.query.waterCategory}` : "Not specified"}
- Materials Affected: ${args.query.materials?.join(", ") || "Not specified"}
- Affected Areas: ${args.query.affectedAreas?.join(", ") || "Not specified"}
- Keywords: ${keywords.filter((k) => k).join(", ") || "None"}
${args.query.technicianNotes ? `- Technician Field Notes Summary: ${args.query.technicianNotes.substring(0, 800)}` : ""}

DOCUMENT CONTENT:
${truncatedText}

TASK:
Extract 4-7 of the MOST CRITICAL sections from this standards document that are directly applicable to generating a professional forensic ${args.query.reportType} damage restoration report.

For each section, extract:
1. The exact text (preserve all standard references, section numbers, measurements)
2. The standard reference/citation (e.g., "IICRC S500 Section 14.3.2")
3. Why it's critical for this specific report context

Focus on extracting:
- Mandatory procedures that MUST be followed
- Compliance requirements with specific citations
- Technical specifications (equipment, materials, measurements)
- Safety and OH&S protocols
- Material-specific remediation guidelines
- Verification and documentation requirements
- Australian standards (AS/NZS) when present

Be thorough but precise. Each extracted section should be directly usable in the report generation.`;
}

export async function extractStandardsSections(
  args: ExtractStandardsSectionsArgs,
): Promise<ServiceResult<{ sections: string[] }, ExtractSectionsReason>> {
  const userPrompt = buildUserPrompt(args);

  const gatewayResult = await callAnthropic({
    userId: "system",
    apiKey: args.apiKey,
    request: {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [createCachedSystemPrompt(SYSTEM_PROMPT)],
      messages: [{ role: "user", content: userPrompt }],
    },
  });

  // Legacy fallback semantic: ANY failure (rate limit, overload, API error)
  // returns a single fallback section so the composer keeps the document in
  // its output. The route layer can't observe partial failures here.
  if (!gatewayResult.ok) {
    return ok({ sections: fallbackSection(args.query) });
  }

  const metrics = extractCacheMetrics(gatewayResult.data);
  logCacheMetrics("StandardsRetrieval", metrics, gatewayResult.data.id);

  const first = gatewayResult.data.content[0];
  if (!first || first.type !== "text") {
    return ok({ sections: fallbackSection(args.query) });
  }

  const extractedText = first.text;
  const sections = extractedText
    .split(/\d+\./)
    .filter((s) => s.trim().length > MIN_SECTION_CHARS)
    .map((s) => s.trim())
    .slice(0, MAX_SECTIONS);

  return ok({
    sections:
      sections.length > 0 ? sections : [extractedText.substring(0, 2000)],
  });
}
