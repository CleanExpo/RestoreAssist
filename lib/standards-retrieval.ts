/**
 * Standards Retrieval Composer - Google Drive Integration
 *
 * Coordinates two AI service modules (folder analysis + per-document section
 * extraction) plus Google Drive I/O to produce a StandardsContext for report
 * generation. Folder: IICRC Standards (1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1).
 *
 * Service-layer migration (RA-1797-tier):
 *  - AI call 1 (folder analysis) → lib/services/ai/standards/analyze-standards-folder.ts
 *  - AI call 2 (section extraction) → lib/services/ai/standards/extract-standards-sections.ts
 *  - Types + pure helpers → lib/standards-retrieval-types.ts
 *
 * Public API is unchanged: `retrieveRelevantStandards(query, anthropicApiKey?)`
 * and `buildStandardsContextPrompt(ctx)` continue to work as before. Callers
 * are not migrated by this PR — same imports, same shapes, same graceful-
 * fallback semantics.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import {
  listDriveItems,
  downloadDriveFile,
  searchDriveFiles,
  getStandardsFolderId,
  DriveFile,
} from "./google-drive";
import {
  extractTextFromPDF,
  extractTextFromDOCX,
  extractTextFromTXT,
} from "./file-extraction";
import {
  StandardsContext,
  RetrievalQuery,
  determineRelevantStandards,
} from "./standards-retrieval-types";
import { analyzeStandardsFolder } from "./services/ai/standards/analyze-standards-folder";
import { extractStandardsSections } from "./services/ai/standards/extract-standards-sections";

// Re-export public types so existing callers (`import { StandardsContext }
// from '@/lib/standards-retrieval'`) keep working.
export type { StandardsContext, RetrievalQuery };

/**
 * Resolve the Anthropic API key for the composer's downstream service calls.
 */
function resolveAnthropicApiKey(apiKey?: string): string | null {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  return key || null;
}

/**
 * Calculate relevance score for a file based on filename and query
 */
function calculateRelevanceScore(
  fileName: string,
  query: RetrievalQuery,
): number {
  let score = 0;
  const lowerFileName = fileName.toLowerCase();
  const relevantStandards = determineRelevantStandards(query);

  // Check for standard type matches
  relevantStandards.forEach((standard) => {
    if (lowerFileName.includes(standard.toLowerCase())) {
      score += 15;
    }
  });

  // Report type matching
  if (
    query.reportType === "water" &&
    (lowerFileName.includes("s500") || lowerFileName.includes("water"))
  ) {
    score += 20;
  }
  if (
    query.reportType === "mould" &&
    (lowerFileName.includes("s520") ||
      lowerFileName.includes("mould") ||
      lowerFileName.includes("mold"))
  ) {
    score += 20;
  }
  if (
    query.reportType === "commercial" &&
    (lowerFileName.includes("s400") || lowerFileName.includes("commercial"))
  ) {
    score += 20;
  }

  // Material matching
  if (query.materials) {
    query.materials.forEach((material) => {
      if (lowerFileName.includes(material.toLowerCase())) {
        score += 5;
      }
    });
  }

  // Keyword matching
  if (query.keywords) {
    query.keywords.forEach((keyword) => {
      if (lowerFileName.includes(keyword.toLowerCase())) {
        score += 3;
      }
    });
  }

  // Prefer files in specific standard folders
  if (
    lowerFileName.includes("s500") ||
    lowerFileName.includes("s520") ||
    lowerFileName.includes("s400")
  ) {
    score += 10;
  }

  return score;
}

/**
 * Extract standard type from filename
 */
function extractStandardType(fileName: string): string {
  const lower = fileName.toLowerCase();

  if (lower.includes("s500") || lower.includes("water")) return "S500";
  if (
    lower.includes("s520") ||
    lower.includes("mould") ||
    lower.includes("mold")
  )
    return "S520";
  if (lower.includes("s400") || lower.includes("commercial")) return "S400";
  if (lower.includes("s540") || lower.includes("trauma")) return "S540";
  if (lower.includes("s100")) return "S100";
  if (lower.includes("s220")) return "S220";
  if (lower.includes("s300")) return "S300";
  if (lower.includes("s410")) return "S410";
  if (lower.includes("s700")) return "S700";
  if (lower.includes("s800")) return "S800";
  if (lower.includes("s900")) return "S900";
  if (lower.includes("sop")) return "SOP";

  return "General";
}

/**
 * Retrieve relevant standards from Google Drive
 * Uses folder: IICRC Standards (1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1)
 *
 * Composer that coordinates:
 *  1. Drive folder listing
 *  2. AI-powered folder structure analysis (analyzeStandardsFolder service)
 *  3. Keyword-based Drive search as backup
 *  4. Filename relevance scoring + dedupe
 *  5. Per-document text extraction
 *  6. AI-powered section extraction (extractStandardsSections service)
 */
export async function retrieveRelevantStandards(
  query: RetrievalQuery,
  anthropicApiKey?: string,
): Promise<StandardsContext> {
  try {
    const standardsFolderId = getStandardsFolderId();

    const apiKey = resolveAnthropicApiKey(anthropicApiKey);
    if (!apiKey) {
      console.error(
        `[Standards Retrieval] No Anthropic API key available for composer`,
      );
      return {
        documents: [],
        summary:
          "Unable to initialize Anthropic API client. Report will be generated using general knowledge.",
      };
    }

    // Get all files from the standards folder
    let allFiles: DriveFile[] = [];

    try {
      const folderItems = await listDriveItems(standardsFolderId);
      allFiles = folderItems.files;

      // Use AI to analyze folder structure and identify relevant files
      const aiAnalysisResult = await analyzeStandardsFolder({
        apiKey,
        folderItems,
        query,
      });
      const aiAnalysis = aiAnalysisResult.ok
        ? aiAnalysisResult.data
        : { relevantFiles: folderItems.files.slice(0, 10), reasoning: "" };

      // Add AI-identified files to our list (prioritise them)
      const aiFileIds = new Set(aiAnalysis.relevantFiles.map((f) => f.id));
      const otherFiles = allFiles.filter((f) => !aiFileIds.has(f.id));
      allFiles = [...aiAnalysis.relevantFiles, ...otherFiles];

      // Also search for relevant files by keywords (as backup) - search within the standards folder
      const relevantStandards = determineRelevantStandards(query);
      for (const standard of relevantStandards.slice(0, 3)) {
        try {
          const searchResults = await searchDriveFiles(
            standard,
            [
              "application/pdf",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "text/plain",
            ],
            standardsFolderId, // Search within the standards folder
          );
          for (const file of searchResults) {
            if (!allFiles.find((f) => f.id === file.id)) {
              allFiles.push(file);
            }
          }
        } catch (error: any) {
          console.error(
            `[Standards Retrieval] Error searching for "${standard}":`,
            error.message,
          );
        }
      }
    } catch (error: any) {
      console.error(
        `[Standards Retrieval] Error accessing Google Drive:`,
        error.message,
      );
      return {
        documents: [],
        summary: `Unable to access Google Drive folder "IICRC Standards": ${error.message}. Please check your Google Drive credentials and ensure the service account has access to the folder.`,
      };
    }

    if (allFiles.length === 0) {
      return {
        documents: [],
        summary:
          'No standards files found in Google Drive folder "IICRC Standards". Please ensure the folder contains PDF, DOCX, or TXT files.',
      };
    }

    // Score and rank files by relevance
    const scoredFiles = allFiles.map((file) => ({
      file,
      score: calculateRelevanceScore(file.name, query),
    }));

    // Remove duplicates by file ID
    const uniqueFiles = new Map<string, (typeof scoredFiles)[0]>();
    for (const item of scoredFiles) {
      const existing = uniqueFiles.get(item.file.id);
      if (!existing || item.score > existing.score) {
        uniqueFiles.set(item.file.id, item);
      }
    }

    // Sort by score and take top 12 most relevant files (increased for better coverage)
    const topFiles = Array.from(uniqueFiles.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((item) => item.file);

    // Extract text and relevant sections from top files
    // Process files sequentially to avoid overwhelming the API
    const documentsWithSections = [];
    for (const file of topFiles) {
      try {
        const { buffer, mimeType } = await downloadDriveFile(file.id);

        // Extract text based on file type
        let extractedText = "";
        if (
          mimeType === "application/pdf" ||
          file.mimeType === "application/pdf"
        ) {
          extractedText = await extractTextFromPDF(buffer);
        } else if (
          mimeType ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          file.mimeType ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          extractedText = await extractTextFromDOCX(buffer);
        } else if (
          mimeType === "text/plain" ||
          file.mimeType === "text/plain"
        ) {
          extractedText = await extractTextFromTXT(buffer);
        } else {
          extractedText = buffer.toString("utf-8");
        }

        if (!extractedText || extractedText.trim().length < 100) {
          continue;
        }

        // Use the service module to extract relevant sections via AI.
        const sectionsResult = await extractStandardsSections({
          apiKey,
          documentText: extractedText,
          fileName: file.name,
          query,
        });
        // Service returns ok() with a single fallback sentence on gateway
        // failure — that preserves the legacy behaviour.
        const relevantSections = sectionsResult.ok
          ? sectionsResult.data.sections
          : [];

        if (relevantSections.length === 0) {
          continue;
        }

        const standardType = extractStandardType(file.name);

        documentsWithSections.push({
          name: file.name,
          fileId: file.id,
          relevantSections,
          standardType,
          extractedContent: extractedText.substring(0, 5000),
        });

        if (documentsWithSections.length >= 12) {
          break;
        }
      } catch (error: any) {
        console.error(
          `[Standards Retrieval] Error processing file ${file.name}:`,
          error.message,
        );
        continue;
      }
    }

    // Generate summary
    const standardTypes = [
      ...new Set(documentsWithSections.map((d) => d.standardType)),
    ];
    const summary =
      `Retrieved ${documentsWithSections.length} relevant standards documents from Google Drive folder "IICRC Standards" covering: ${standardTypes.join(", ")}. ` +
      `Documents include information relevant to ${query.reportType} damage restoration, ` +
      `including applicable IICRC standards, Australian building codes, and safety regulations.`;

    return {
      documents: documentsWithSections,
      summary,
    };
  } catch (error: any) {
    console.error(
      `[Standards Retrieval] Fatal error:`,
      error.message,
      error.stack,
    );
    return {
      documents: [],
      summary: `Unable to retrieve standards documents from Google Drive: ${error.message}. Report will be generated using general knowledge.`,
    };
  }
}

/**
 * Build context prompt for report generation
 * This formats the retrieved standards for inclusion in the generation prompt
 * Enhanced with professional formatting and actionable guidance
 */
export function buildStandardsContextPrompt(
  standardsContext: StandardsContext,
): string {
  if (standardsContext.documents.length === 0) {
    return "";
  }

  // Group documents by standard type for better organisation
  const documentsByType = new Map<string, typeof standardsContext.documents>();
  standardsContext.documents.forEach((doc) => {
    const type = doc.standardType || "General";
    if (!documentsByType.has(type)) {
      documentsByType.set(type, []);
    }
    documentsByType.get(type)!.push(doc);
  });

  let prompt =
    "\n\n═══════════════════════════════════════════════════════════════\n";
  prompt +=
    "📋 RELEVANT STANDARDS & REGULATIONS (GOOGLE DRIVE - IICRC STANDARDS)\n";
  prompt +=
    "═══════════════════════════════════════════════════════════════\n\n";

  prompt += `${standardsContext.summary}\n\n`;

  prompt +=
    'The following standards documents have been intelligently selected from the Google Drive folder "IICRC Standards" based on AI-powered analysis of folder structure and report context:\n\n';

  // Organise by standard type
  let docCounter = 1;
  for (const [standardType, docs] of documentsByType.entries()) {
    prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    prompt += `📄 ${standardType} Standards (${docs.length} document${docs.length > 1 ? "s" : ""})\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    docs.forEach((doc) => {
      prompt += `${docCounter}. **${doc.name}**\n`;
      prompt += `   └─ Standard Type: ${doc.standardType}\n`;
      prompt += `   └─ File ID: ${doc.fileId}\n\n`;

      if (doc.relevantSections.length > 0) {
        prompt += `   📌 CRITICAL SECTIONS EXTRACTED:\n\n`;
        doc.relevantSections.forEach((section, sectionIndex) => {
          prompt += `   ${sectionIndex + 1}. ${section}\n\n`;
        });
      }
      docCounter++;
    });
  }

  prompt +=
    "\n═══════════════════════════════════════════════════════════════\n";
  prompt += "⚠️  MANDATORY COMPLIANCE REQUIREMENTS\n";
  prompt +=
    "═══════════════════════════════════════════════════════════════\n\n";

  prompt += "You MUST adhere to the following when generating this report:\n\n";
  prompt += "1. **STANDARD CITATIONS**:\n";
  prompt +=
    '   - Reference EXACT section numbers from the extracted standards (e.g., "IICRC S500 Section 14.3.2", "ANSI/IICRC S500:2021 Section 12.4")\n';
  prompt +=
    "   - Include standard references in ALL procedural recommendations\n";
  prompt +=
    "   - Use the exact terminology and phrasing from the standards documents\n\n";

  prompt += "2. **PROCEDURAL COMPLIANCE**:\n";
  prompt +=
    "   - All remediation procedures MUST align with the requirements specified in the extracted sections\n";
  prompt +=
    "   - Follow the step-by-step protocols exactly as outlined in the standards\n";
  prompt +=
    "   - Include all mandatory steps, verification requirements, and documentation protocols\n\n";

  prompt += "3. **TECHNICAL SPECIFICATIONS**:\n";
  prompt +=
    "   - Use the exact measurements, tolerances, and specifications from the standards\n";
  prompt +=
    "   - Reference equipment requirements, material specifications, and performance criteria\n";
  prompt +=
    "   - Include all relevant Australian standards (AS/NZS) when applicable\n\n";

  prompt += "4. **SAFETY & COMPLIANCE**:\n";
  prompt +=
    "   - Include all OH&S requirements, PPE specifications, and safety protocols from the standards\n";
  prompt +=
    "   - Reference containment requirements, decontamination procedures, and verification protocols\n";
  prompt +=
    "   - Ensure all recommendations meet Australian Work Health and Safety (WHS) requirements\n\n";

  prompt += "5. **PROFESSIONAL FORMATTING**:\n";
  prompt +=
    "   - Structure the report to clearly show compliance with each referenced standard\n";
  prompt +=
    "   - Use professional terminology consistent with IICRC and Australian building codes\n";
  prompt +=
    '   - Include a "Standards Compliance" section that lists all referenced standards\n\n';

  prompt += "6. **VERIFICATION & DOCUMENTATION**:\n";
  prompt +=
    "   - Include all verification requirements and documentation protocols from the standards\n";
  prompt +=
    "   - Reference post-remediation verification procedures and acceptance criteria\n";
  prompt += "   - Ensure all recommendations are verifiable and auditable\n\n";

  prompt += "═══════════════════════════════════════════════════════════════\n";
  prompt += "💡 INTELLIGENT STANDARDS INTEGRATION\n";
  prompt +=
    "═══════════════════════════════════════════════════════════════\n\n";

  prompt += "These standards were selected using AI-powered analysis that:\n";
  prompt += "✓ Analysed the Google Drive folder structure and organisation\n";
  prompt +=
    "✓ Matched standards to the specific water category, class, and materials\n";
  prompt +=
    "✓ Extracted the most relevant sections for this specific report context\n";
  prompt += "✓ Prioritised Australian standards (AS/NZS) and IICRC standards\n";
  prompt +=
    "✓ Considered technician field notes and report-specific requirements\n\n";

  prompt +=
    "Use these standards to generate a PROFESSIONAL, COMPLIANT, and TECHNICALLY ACCURATE forensic restoration report.\n\n";

  return prompt;
}
