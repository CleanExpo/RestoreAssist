import { describe, expect, it } from "vitest";
import {
  auditAiCallSite,
  auditAiCallSites,
  classifyAiTask,
} from "../audit-ai-call-sites";
import { getAiTaskPolicy } from "../../lib/ai/task-policy";

describe("auditAiCallSite", () => {
  it("detects direct Anthropic report call guardrails", () => {
    const finding = auditAiCallSite(
      "lib/services/ai/generate-enhanced-report.ts",
      `
        import Anthropic from "@anthropic-ai/sdk";
        import { logAiUsage } from "@/lib/usage/log-usage";
        const anthropic = new Anthropic({ apiKey });
        await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 4000,
          messages: [{ role: "user", content: reportText }],
        });
        logAiUsage({ workspaceId, provider: "ANTHROPIC" });
      `,
    );

    expect(finding).toEqual(
      expect.objectContaining({
        taskClass: "report_drafting",
        tenantAware: true,
        usageCostObservable: true,
        maxRequestGuardrail: true,
      }),
    );
    expect(finding?.providerFamilies).toContain("anthropic");
    expect(finding?.modelHints).toContain("claude-sonnet-4-5");
  });

  it("detects OpenAI embedding/RAG calls", () => {
    const finding = auditAiCallSite(
      "lib/rag/embed.ts",
      `
        import OpenAI from "openai";
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: chunkText,
        });
      `,
    );

    expect(finding?.taskClass).toBe("embeddings");
    expect(finding?.providerFamilies).toContain("openai");
    expect(finding?.modelHints).toContain("text-embedding-3-small");
  });

  it("detects BYOK vision surfaces as external sensitive-data calls", () => {
    const finding = auditAiCallSite(
      "lib/ai/byok-vision-client.ts",
      `
        import { GoogleGenerativeAI } from "@google/generative-ai";
        import Anthropic from "@anthropic-ai/sdk";
        import OpenAI from "openai";
        const model = "gemini-3.1-flash";
        await byokDispatch({ workspaceId, visionInputs, maxTokens: 1024 });
      `,
    );

    expect(finding?.taskClass).toBe("ocr_image_understanding");
    expect(finding?.providerFamilies).toEqual(
      expect.arrayContaining(["anthropic", "openai", "gemini", "byok"]),
    );
    expect(finding?.sendsSensitiveDataExternally).toBe(true);
  });
});

describe("classifyAiTask", () => {
  it("classifies voice paths before generic report wording", () => {
    expect(
      classifyAiTask(
        "app/api/ai/voice-note-transcribe/route.ts",
        "new OpenAI().audio.transcriptions.create({ model: 'whisper-1' })",
      ),
    ).toBe("voice_realtime");
  });
});

describe("AI task policies", () => {
  it("requires cost observability for paid task classes", () => {
    expect(getAiTaskPolicy("report_drafting")).toEqual(
      expect.objectContaining({
        requiresUsageLogging: true,
        requiresBudgetCheck: true,
        allowsFallback: false,
      }),
    );
  });

  it("has policies for every non-unknown task class used by the audit", () => {
    const report = auditAiCallSites();
    const taskClasses = new Set(report.findings.map((finding) => finding.taskClass));
    taskClasses.delete("unknown");

    for (const taskClass of taskClasses) {
      expect(getAiTaskPolicy(taskClass)).not.toBeNull();
    }
  });
});

