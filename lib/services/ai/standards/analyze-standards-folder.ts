/**
 * Folder-structure AI analysis for the standards-retrieval subsystem.
 *
 * Migrated from `analyzeFolderStructureWithAI` in lib/standards-retrieval.ts.
 * Wraps lib/services/ai/anthropic-gateway.ts via callAnthropic with a cached
 * system prompt. Given a Google Drive folder listing, asks the model to pick
 * the most relevant standards files for the report context.
 *
 * Graceful-fallback semantic preserved: a gateway failure or non-text output
 * still returns ok() with the first 10 files unchanged (legacy behaviour).
 * If the model returns JSON, we parse + match. If the JSON parse fails, we
 * scan the model text for filename substrings (legacy text-fallback).
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
import type { DriveFile, DriveFolder } from "@/lib/google-drive";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4000;
const MAX_FILES_TO_SEND = 100;
const DEFAULT_FALLBACK_FILES = 10;

export type AnalyzeFolderReason = AnthropicReason | "PARSE_FAILED";

export interface AnalyzeStandardsFolderArgs {
  apiKey: string;
  folderItems: { files: DriveFile[]; folders: DriveFolder[] };
  query: RetrievalQuery;
}

export interface AnalyzeStandardsFolderResult {
  relevantFiles: DriveFile[];
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an expert in IICRC standards and Australian building codes. Your task is to analyze a Google Drive folder structure and identify the most relevant standards documents for a specific water damage restoration report.

Analyze the folder structure and file names to:
1. Understand how standards are organised (by standard number, category, type, etc.)
2. Identify which files are most relevant to the report query
3. Consider file naming patterns, folder organisation, and document types
4. Prioritise official IICRC standards (S500, S520, S400, etc.) and Australian standards (AS/NZS, NCC, etc.)

Return a JSON object with:
- relevantFileNames: Array of file names that should be prioritised
- reasoning: Brief explanation of why these files were selected
- standardTypes: Array of standard types identified (e.g., ["S500", "S520", "AS/NZS 3000"])
- priority: High/Medium/Low for each file

Be intelligent about matching - consider:
- Water category and class requirements
- Material-specific standards
- Safety and compliance requirements
- Regional standards (Australian vs. international)`;

function buildUserPrompt(args: AnalyzeStandardsFolderArgs): string {
  const fileList = args.folderItems.files
    .map((f) => ({ name: f.name, mimeType: f.mimeType, id: f.id }))
    .slice(0, MAX_FILES_TO_SEND);

  const folderList = (args.folderItems.folders || []).map((f) => ({
    name: f.name,
    id: f.id,
  }));

  return `Report Query Context:
- Report Type: ${args.query.reportType}
- Water Category: ${args.query.waterCategory || "Not specified"}
- Materials Affected: ${args.query.materials?.join(", ") || "Not specified"}
- Affected Areas: ${args.query.affectedAreas?.join(", ") || "Not specified"}
- Keywords: ${args.query.keywords?.join(", ") || "None"}
${args.query.technicianNotes ? `- Technician Notes Summary: ${args.query.technicianNotes.substring(0, 500)}` : ""}

Folder Structure:
- Total Files: ${fileList.length}
- Subfolders: ${folderList.length}

Files in Folder:
${JSON.stringify(fileList, null, 2)}

${folderList.length > 0 ? `Subfolders:\n${JSON.stringify(folderList, null, 2)}` : ""}

Analyse this folder structure and identify the most relevant standards documents for generating a professional ${args.query.reportType} damage restoration report. Consider the report context and prioritise files that contain:
1. Specific procedures for the water category/class
2. Material-specific remediation guidelines
3. Safety and compliance requirements
4. Australian building codes and regulations
5. IICRC standard references and citations`;
}

function defaultFallback(
  files: DriveFile[],
): AnalyzeStandardsFolderResult {
  return {
    relevantFiles: files.slice(0, DEFAULT_FALLBACK_FILES),
    reasoning: "Using default file selection",
  };
}

export async function analyzeStandardsFolder(
  args: AnalyzeStandardsFolderArgs,
): Promise<
  ServiceResult<AnalyzeStandardsFolderResult, AnalyzeFolderReason>
> {
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

  if (!gatewayResult.ok) {
    // Legacy fallback: composer keeps working with first 10 files unchanged.
    return ok(defaultFallback(args.folderItems.files));
  }

  const metrics = extractCacheMetrics(gatewayResult.data);
  logCacheMetrics("StandardsFolder Analysis", metrics, gatewayResult.data.id);

  const first = gatewayResult.data.content[0];
  if (!first || first.type !== "text") {
    return ok({
      relevantFiles: args.folderItems.files.slice(0, DEFAULT_FALLBACK_FILES),
      reasoning: "AI analysis completed",
    });
  }

  const analysisText = first.text;

  // First try: structured JSON output.
  const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const analysis = JSON.parse(jsonMatch[0]) as {
        relevantFileNames?: string[];
        reasoning?: string;
      };
      const relevantFileNames = analysis.relevantFileNames || [];

      const relevantFiles = args.folderItems.files.filter((file) =>
        relevantFileNames.some(
          (name: string) =>
            file.name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(file.name.toLowerCase()),
        ),
      );

      return ok({
        relevantFiles:
          relevantFiles.length > 0
            ? relevantFiles
            : args.folderItems.files.slice(0, DEFAULT_FALLBACK_FILES),
        reasoning: analysis.reasoning || "AI analysis completed",
      });
    } catch {
      // Fall through to text scan
    }
  }

  // Second try: scan model text for filename substrings.
  const mentionedFiles: DriveFile[] = [];
  for (const file of args.folderItems.files) {
    if (
      analysisText
        .toLowerCase()
        .includes(file.name.toLowerCase().substring(0, 20))
    ) {
      mentionedFiles.push(file);
    }
  }

  return ok({
    relevantFiles:
      mentionedFiles.length > 0
        ? mentionedFiles
        : args.folderItems.files.slice(0, DEFAULT_FALLBACK_FILES),
    reasoning: analysisText.substring(0, 500),
  });
}
