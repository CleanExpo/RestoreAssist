import { describe, expect, it } from "vitest";
import {
  auditAiCallSite,
  auditAiCallSites,
  buildAiCallSiteGuardrailSummary,
  classifyAiTask,
  getAiAuditIgnoredFilePatterns,
  readPlatformKeyFallbackBaseline,
  type AiCallSiteFinding,
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

  it("does not treat non-AI BYOK storage providers as AI call sites", () => {
    const finding = auditAiCallSite(
      "lib/storage/google-drive-provider.ts",
      `
        export class GoogleDriveStorageProvider {
          readonly mode = "BYOK";
          async connect(providerConnectionId: string) {
            return this.oauthClient.getToken(providerConnectionId);
          }
        }
      `,
    );

    expect(finding).toBeNull();
  });

  it("reports policy-wrapped call sites explicitly", () => {
    const finding = auditAiCallSite(
      "lib/services/ai/suggest-next-interview-question.ts",
      `
        import { requireAiTaskPolicy } from "@/lib/ai/task-policy";
        import { buildAiUsageMetadata } from "@/lib/ai/usage-metadata";
        const policy = requireAiTaskPolicy("fast_classification");
        buildAiUsageMetadata({ taskClass: policy.taskClass });
        await callAnthropicWithFallback({
          request: { model: "claude-haiku-4-5", max_tokens: 250 },
        });
      `,
    );

    expect(finding).toEqual(
      expect.objectContaining({
        taskClass: "fast_classification",
        policyWrapped: true,
      }),
    );
    expect(finding?.evidence).toContain("policy-wrapper");
  });
});

describe("platform-key-fallback detection (RA-6921 P0)", () => {
  it("flags an app/ route that reads process.env.*_API_KEY with no BYOK resolution", () => {
    const finding = auditAiCallSite(
      "app/api/chatbot/route.ts",
      `
        import Anthropic from "@anthropic-ai/sdk";
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        await anthropic.messages.create({ model: "claude-haiku-4-5", max_tokens: 300 });
      `,
    );

    expect(finding?.platformKeyFallback).toBe(true);
  });

  it("does not flag a route that resolves the workspace BYOK key", () => {
    const finding = auditAiCallSite(
      "app/api/ai/voice-note-transcribe/route.ts",
      `
        import OpenAI from "openai";
        import { resolveWorkspaceAiKey } from "@/lib/ai/resolve-workspace-ai-key";
        const key = await resolveWorkspaceAiKey(session.user.id, "OPENAI");
        const openai = new OpenAI({ apiKey: key.apiKey });
        await openai.audio.transcriptions.create({ model: "whisper-1" });
      `,
    );

    expect(finding?.platformKeyFallback).toBe(false);
  });

  it("does not flag lib/ platform-ops call sites (out of scope by design)", () => {
    const finding = auditAiCallSite(
      "lib/rag/embed.ts",
      `
        import OpenAI from "openai";
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        await openai.embeddings.create({ model: "text-embedding-3-small" });
      `,
    );

    expect(finding?.platformKeyFallback).toBe(false);
  });

  it("flags a raw fetch() to api.anthropic.com as an AI surface even without the SDK", () => {
    // Regression test for the blind spot found in batch 3: a route that
    // calls the Anthropic HTTP API directly (bypassing @anthropic-ai/sdk)
    // was previously invisible to auditAiCallSite entirely (hasAiSurface
    // returned false), so it never reached the platformKeyFallback check.
    const finding = auditAiCallSite(
      "app/api/reports/[id]/download/route.ts",
      `
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY as string },
        });
      `,
    );

    expect(finding).not.toBeNull();
    expect(finding?.providerFamilies).toContain("anthropic");
    expect(finding?.platformKeyFallback).toBe(true);
  });

  it("flags a bare process.env.ANTHROPIC_API_KEY read as an AI surface with no recognised SDK call", () => {
    // Regression test for the same blind spot: a route that reads the key
    // and hands it to a lib/services/ai/* helper (rather than calling the
    // SDK inline) has no recognisable provider marker in the route file
    // itself, so hasAiSurface must treat the bare key read as the surface.
    const finding = auditAiCallSite(
      "app/api/vision/extract-reading/route.ts",
      `
        const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
        const result = await extractMeterReading({ apiKey, image });
      `,
    );

    expect(finding).not.toBeNull();
    expect(finding?.platformKeyFallback).toBe(true);
  });

  it("does not misclassify an unrelated *_API_KEY env var (e.g. RESEND_API_KEY) as an AI surface", () => {
    // Regression test: the fix must scope to named AI-provider keys only —
    // broadening to any *_API_KEY pattern previously false-positived on
    // email/CRM/OAuth integrations that have nothing to do with AI spend.
    const finding = auditAiCallSite(
      "app/api/notifications/email/route.ts",
      `
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({ to, subject, html });
      `,
    );

    expect(finding).toBeNull();
  });

  it("keeps the live audit's platform-key-fallback findings pinned to the ratchet baseline", () => {
    const report = auditAiCallSites();
    const baseline = readPlatformKeyFallbackBaseline();
    const netNew = report.guardrailSummary.platformKeyFallbackFiles.filter(
      (file) => !baseline.includes(file),
    );

    expect(netNew).toEqual([]);
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

  it("classifies support ticket analysis before incidental voice/report wording", () => {
    expect(
      classifyAiTask(
        "lib/services/ai/analyse-support-ticket.ts",
        "callAnthropic({ request: { model: 'claude-haiku-4-5', messages: supportTicketMessages } })",
      ),
    ).toBe("support_ticket_analysis");
  });

  it("classifies support reply drafting as the explicit policy-wrapped task", () => {
    expect(
      classifyAiTask(
        "lib/services/ai/draft-support-ticket.ts",
        "callAnthropic({ request: { model: 'claude-haiku-4-5', max_tokens: 1024 } })",
      ),
    ).toBe("support_response_draft");
  });

  it("classifies analytics narrative as workflow automation instead of unknown", () => {
    expect(
      classifyAiTask(
        "lib/services/ai/analytics-narrative.ts",
        "callAnthropic({ request: { model: 'claude-haiku-4-5', max_tokens: 300 } })",
      ),
    ).toBe("workflow_automation");
  });

  it("leaves unclassified AI surfaces unknown so the gate can fail closed", () => {
    expect(
      classifyAiTask(
        "lib/services/ai/new-provider-surface.ts",
        "new Anthropic({ apiKey }).messages.create({ model: 'claude-haiku-4-5' })",
      ),
    ).toBe("unknown");
  });
});

describe("AI guardrail gate summary", () => {
  it("fails closed when an AI surface has an unknown task class", () => {
    const unknownFinding: AiCallSiteFinding = {
      file: "lib/services/ai/new-provider-surface.ts",
      providerFamilies: ["anthropic"],
      taskClass: "unknown",
      modelHints: ["claude-haiku-4-5"],
      tenantAware: false,
      usageCostObservable: false,
      fallbackVisible: false,
      maxRequestGuardrail: false,
      executionMode: "synchronous",
      sendsSensitiveDataExternally: true,
      policyWrapped: false,
      platformKeyFallback: false,
      evidence: [],
      notes: "AI/provider surface detected but task class could not be inferred from filename/content.",
    };

    expect(buildAiCallSiteGuardrailSummary([unknownFinding])).toEqual(
      expect.objectContaining({
        unknownTaskClassCount: 1,
        policyWrappedCount: 0,
        sensitiveExternalProviderCount: 1,
        pass: false,
      }),
    );
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

  it("keeps the live audit gate passing with known task classes", () => {
    const report = auditAiCallSites();

    expect(report.guardrailSummary.pass).toBe(true);
    expect(report.guardrailSummary.unknownTaskClassCount).toBe(0);
  });

  it("reports policy-wrapped and sensitive external-provider counts", () => {
    const report = auditAiCallSites();

    expect(report.guardrailSummary.policyWrappedCount).toBeGreaterThanOrEqual(5);
    expect(report.guardrailSummary.sensitiveExternalProviderCount).toBeGreaterThan(0);
  });

  it("keeps JSON output parseable through the report shape", () => {
    const report = auditAiCallSites();
    const parsed = JSON.parse(JSON.stringify(report));

    expect(parsed.callSiteCount).toBe(report.callSiteCount);
    expect(parsed.guardrailSummary).toEqual(
      expect.objectContaining({
        unknownTaskClassCount: 0,
        policyWrappedCount: expect.any(Number),
        sensitiveExternalProviderCount: expect.any(Number),
        pass: true,
      }),
    );
  });

  it("makes false positive exclusions explicit", () => {
    expect(getAiAuditIgnoredFilePatterns()).toEqual(
      expect.arrayContaining([
        "/__tests__/",
        ".test.ts",
        "scripts/audit-ai-call-sites.ts",
      ]),
    );
  });
});
