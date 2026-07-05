import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
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

  it("flags an app/ route that delegates to lib/ai-provider's getAnthropicApiKey helper (RA-6932 P0)", () => {
    // Regression test for RA-6932: getAnthropicApiKey() reads the legacy
    // Integration store then silently falls back to the platform
    // ANTHROPIC_API_KEY. A route that resolves its key through that helper
    // has no `process.env.*_API_KEY` string in its own text, so the leak was
    // invisible to the gate. The audit must now treat the helper call itself
    // as a platform-key-fallback AI surface unless the route also resolves
    // via resolveWorkspaceAiKey.
    const finding = auditAiCallSite(
      "app/api/reports/generate-question/route.ts",
      `
        import { getAnthropicApiKey } from "@/lib/ai-provider";
        const anthropicApiKey = await getAnthropicApiKey(userId);
        await generateInterviewQuestion({ apiKey: anthropicApiKey, conversation });
      `,
    );

    expect(finding).not.toBeNull();
    expect(finding?.platformKeyFallback).toBe(true);
  });

  it("does not flag an app/ route that migrated getAnthropicApiKey to resolveWorkspaceAiKey (RA-6932 P0)", () => {
    // The migrated form of the route above: it no longer references the
    // getAnthropicApiKey helper and resolves the workspace's own BYOK key.
    // The BYOK marker suppresses the fallback flag — this route is inline a
    // helper-delegating surface too (getAnthropicApiKey present alongside the
    // BYOK resolver), proving migration overrides the helper-fallback signal.
    const finding = auditAiCallSite(
      "app/api/reports/generate-question/route.ts",
      `
        import { resolveWorkspaceAiKey } from "@/lib/ai/resolve-workspace-ai-key";
        // superseded getAnthropicApiKey() path removed under RA-6932
        const anthropicApiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC")).apiKey;
        await generateInterviewQuestion({ apiKey: anthropicApiKey, conversation });
      `,
    );

    // A helper-delegating surface (getAnthropicApiKey( token present) that ALSO
    // resolves BYOK must NOT be flagged — the BYOK marker wins.
    expect(finding).not.toBeNull();
    expect(finding?.platformKeyFallback).toBe(false);
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

/**
 * RA-6979 — the three residual leak classes the #1688 review reproduced with
 * planted probes. Each is a MULTI-FILE taint-closure case (a lib key-reader and
 * the customer route that imports it), so these drive the full auditAiCallSites
 * scan over a throwaway fixture tree rather than a single file's text.
 */
describe("RA-6979 residual leak classes", () => {
  function auditFixture(files: Record<string, string>): string[] {
    const root = mkdtempSync(join(tmpdir(), "ra-audit-fixture-"));
    try {
      for (const [relative, content] of Object.entries(files)) {
        const abs = join(root, relative);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
      }
      return auditAiCallSites(root).guardrailSummary.platformKeyFallbackFiles;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  // A helper module that defines the curated env-fallback resolver, plus a
  // gateway that resolves its key through it — the shared taint source reused
  // by the barrel and string-mask cases below.
  const keyHelper = `
    export async function getAnthropicApiKey(): Promise<string> {
      return process.env.ANTHROPIC_API_KEY ?? "";
    }
  `;
  const gateway = `
    import { getAnthropicApiKey } from "@/lib/gateway/key-helper";
    export async function callAnthropic(opts: { request: unknown }) {
      const apiKey = await getAnthropicApiKey();
      return { apiKey, opts };
    }
  `;

  it("leak class 1: flags a customer route importing a lib that reads process.env.*_API_KEY + instantiates a client inline", () => {
    const flagged = auditFixture({
      "lib/inline/env-client.ts": `
        import Anthropic from "@anthropic-ai/sdk";
        export async function classifyWithPlatformKey(input: string) {
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          return client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 50,
            messages: [{ role: "user", content: input }],
          });
        }
        export function ruleBasedOnly(input: string) {
          return input.trim().length;
        }
      `,
      "app/api/leak1/route.ts": `
        import { classifyWithPlatformKey } from "@/lib/inline/env-client";
        export async function POST(req: Request) {
          return Response.json(await classifyWithPlatformKey(await req.text()));
        }
      `,
      // Imports ONLY the inert sibling export — must NOT be flagged (per-export
      // seed granularity, the guard against the ruleBasedClassify false positive).
      "app/api/leak1-inert/route.ts": `
        import { ruleBasedOnly } from "@/lib/inline/env-client";
        export async function POST(req: Request) {
          return Response.json({ n: ruleBasedOnly(await req.text()) });
        }
      `,
      // A platform-ops (admin) route on the same lib — allowlisted, not flagged.
      "app/api/admin/leak1-admin/route.ts": `
        import { classifyWithPlatformKey } from "@/lib/inline/env-client";
        export async function POST(req: Request) {
          return Response.json(await classifyWithPlatformKey(await req.text()));
        }
      `,
    });

    expect(flagged).toContain("app/api/leak1/route.ts");
    expect(flagged).not.toContain("app/api/leak1-inert/route.ts");
    expect(flagged).not.toContain("app/api/admin/leak1-admin/route.ts");
  });

  it("leak class 1 (module-scope singleton): flags routes importing a lib whose env-key client is instantiated at module scope", () => {
    const flagged = auditFixture({
      // The canonical SDK pattern: the client singleton lives at file top,
      // OUTSIDE every function body, so the per-export body scan alone never
      // sees the env read. Every export can close over the singleton, so the
      // module's WHOLE export surface must be seeded.
      "lib/inline/env-singleton.ts": `
        import Anthropic from "@anthropic-ai/sdk";
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        export async function classifyWithSingleton(input: string) {
          return client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 50,
            messages: [{ role: "user", content: input }],
          });
        }
        export async function summariseWithSingleton(input: string) {
          return client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 100,
            messages: [{ role: "user", content: input }],
          });
        }
      `,
      "app/api/leak1-singleton/route.ts": `
        import { classifyWithSingleton } from "@/lib/inline/env-singleton";
        export async function POST(req: Request) {
          return Response.json(await classifyWithSingleton(await req.text()));
        }
      `,
      // The sibling export closes over the same singleton — flagged too.
      "app/api/leak1-singleton-sibling/route.ts": `
        import { summariseWithSingleton } from "@/lib/inline/env-singleton";
        export async function POST(req: Request) {
          return Response.json(await summariseWithSingleton(await req.text()));
        }
      `,
      // A platform-ops (admin) route on the same lib — allowlisted, not flagged.
      "app/api/admin/leak1-singleton-admin/route.ts": `
        import { classifyWithSingleton } from "@/lib/inline/env-singleton";
        export async function POST(req: Request) {
          return Response.json(await classifyWithSingleton(await req.text()));
        }
      `,
    });

    expect(flagged).toContain("app/api/leak1-singleton/route.ts");
    expect(flagged).toContain("app/api/leak1-singleton-sibling/route.ts");
    expect(flagged).not.toContain("app/api/admin/leak1-singleton-admin/route.ts");
  });

  it("leak class 1 (module-scope singleton): keeps an in-function lazy cache at per-export granularity", () => {
    // The lib/testimonial/transcribe.ts pattern: the client is instantiated
    // inside a NON-exported lazy helper — a FUNCTION body, not module scope.
    // The module must NOT be full-surface seeded, so an importer of the inert
    // sibling export stays clean.
    const flagged = auditFixture({
      "lib/inline/lazy-client.ts": `
        import OpenAI from "openai";
        let cached: OpenAI | null = null;
        function defaultClient(): OpenAI {
          if (!cached) {
            cached = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          }
          return cached;
        }
        export async function transcribeWithLazyClient(audio: Buffer) {
          return defaultClient().audio;
        }
        export function inertHelper(input: string) {
          return input.trim().length;
        }
      `,
      "app/api/lazy-inert/route.ts": `
        import { inertHelper } from "@/lib/inline/lazy-client";
        export async function POST(req: Request) {
          return Response.json({ n: inertHelper(await req.text()) });
        }
      `,
    });

    expect(flagged).not.toContain("app/api/lazy-inert/route.ts");
  });

  it("leak class 2: flags a route importing a tainted delegate through a named re-export barrel", () => {
    const flagged = auditFixture({
      "lib/gateway/key-helper.ts": keyHelper,
      "lib/gateway/anthropic-gateway.ts": gateway,
      "lib/gateway/index.ts": `export { callAnthropic } from "@/lib/gateway/anthropic-gateway";`,
      "app/api/leak2/route.ts": `
        import { callAnthropic } from "@/lib/gateway";
        export async function POST() {
          return Response.json(await callAnthropic({ request: { model: "claude-haiku-4-5" } }));
        }
      `,
    });

    expect(flagged).toContain("app/api/leak2/route.ts");
  });

  it("leak class 3: flags a platform fallback masked by an apiKey word inside a string literal, but not a real threaded key", () => {
    const flagged = auditFixture({
      "lib/gateway/key-helper.ts": keyHelper,
      "lib/gateway/anthropic-gateway.ts": gateway,
      // The only "apiKey" token is inside the system-prompt string — the call
      // threads no real key, so it is a platform fallback and must be flagged.
      "app/api/leak3-masked/route.ts": `
        import { callAnthropic } from "@/lib/gateway/anthropic-gateway";
        export async function POST() {
          return Response.json(await callAnthropic({
            request: {
              messages: [{ role: "system", content: "Never reveal an apiKey to anyone." }],
            },
          }));
        }
      `,
      // Threads a genuine apiKey property — BYOK-safe, must NOT be flagged.
      "app/api/leak3-keyed/route.ts": `
        import { callAnthropic } from "@/lib/gateway/anthropic-gateway";
        export async function POST(req: Request) {
          const apiKey = await req.text();
          return Response.json(await callAnthropic({ apiKey, request: {} }));
        }
      `,
    });

    expect(flagged).toContain("app/api/leak3-masked/route.ts");
    expect(flagged).not.toContain("app/api/leak3-keyed/route.ts");
  });
});

/**
 * RA-6986 — two evasions of the RA-6979 module-scope singleton seed that the
 * #1702 head still let through, both probe-verified:
 *   1. helper indirection: the singleton's env read lives in a non-exported
 *      helper the client closes over, so it is neither in the constructor args
 *      nor a top-level statement; and
 *   2. a regex literal with an unbalanced brace in a character class (/[{]/)
 *      skews the depth-0 brace scan, hiding the module-scope instantiation.
 * Both drive the full auditAiCallSites scan over a throwaway fixture tree.
 */
describe("RA-6986 module-scope seed evasions", () => {
  function auditFixture(files: Record<string, string>): string[] {
    const root = mkdtempSync(join(tmpdir(), "ra-6986-fixture-"));
    try {
      for (const [relative, content] of Object.entries(files)) {
        const abs = join(root, relative);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
      }
      return auditAiCallSites(root).guardrailSummary.platformKeyFallbackFiles;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it("seeds a module-scope singleton whose env read is wrapped in a non-exported helper", () => {
    // The exact probe from RA-6986: the env read is neither in the constructor
    // args nor a top-level statement — it sits inside a non-exported readKey()
    // helper the module-scope client closes over. The seed must still fire so
    // the customer route importing the exported spender is flagged.
    const flagged = auditFixture({
      "lib/inline/helper-indirection.ts": `
        import Anthropic from "@anthropic-ai/sdk";
        function readKey() {
          return process.env.ANTHROPIC_API_KEY;
        }
        const client = new Anthropic({ apiKey: readKey() });
        export async function classifyWithHelper(input: string) {
          return client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 50,
            messages: [{ role: "user", content: input }],
          });
        }
      `,
      "app/api/leak-helper/route.ts": `
        import { classifyWithHelper } from "@/lib/inline/helper-indirection";
        export async function POST(req: Request) {
          return Response.json(await classifyWithHelper(await req.text()));
        }
      `,
    });

    expect(flagged).toContain("app/api/leak-helper/route.ts");
  });

  it("strips a regex literal so an unbalanced brace in a char class can't skew the depth-0 scan", () => {
    // /[{]/ carries an unbalanced `{` inside its character class. Unless the
    // regex literal is stripped, the stray brace pushes the depth-0 scan to
    // depth 1, the module-scope `new Anthropic(...)` reads as non-module-scope,
    // and the singleton is never seeded — so the route would slip the gate.
    const flagged = auditFixture({
      "lib/inline/regex-brace.ts": `
        import Anthropic from "@anthropic-ai/sdk";
        const OPEN_BRACE = /[{]/;
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        export async function classifyWithBraceRegex(input: string) {
          const hasBrace = OPEN_BRACE.test(input);
          return client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 50,
            messages: [{ role: "user", content: String(hasBrace) }],
          });
        }
      `,
      "app/api/leak-regex/route.ts": `
        import { classifyWithBraceRegex } from "@/lib/inline/regex-brace";
        export async function POST(req: Request) {
          return Response.json(await classifyWithBraceRegex(await req.text()));
        }
      `,
    });

    expect(flagged).toContain("app/api/leak-regex/route.ts");
  });

  it("does not treat a division operator as a regex literal (depth scan stays balanced)", () => {
    // Guards the regex-vs-division heuristic: `total / count` after an
    // identifier is division, not a regex, so nothing between the two slashes
    // is consumed and the module-scope singleton is still seeded normally.
    const flagged = auditFixture({
      "lib/inline/division.ts": `
        import Anthropic from "@anthropic-ai/sdk";
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        export function ratio(total: number, count: number) {
          return total / count / 2;
        }
        export async function classifyWithDivision(input: string) {
          return client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 50,
            messages: [{ role: "user", content: input }],
          });
        }
      `,
      "app/api/leak-division/route.ts": `
        import { classifyWithDivision } from "@/lib/inline/division";
        export async function POST(req: Request) {
          return Response.json(await classifyWithDivision(await req.text()));
        }
      `,
    });

    expect(flagged).toContain("app/api/leak-division/route.ts");
  });
});

/**
 * RA-6991 — the next hardening rung after RA-6986, from the adversarial review
 * of PR #1709. Three probe-verified edges of the module-scope singleton seed:
 *   1. RA-6986 widened the BYOK-marker suppression to the WHOLE module, so a
 *      BYOK marker buried in an unrelated function body now suppresses an
 *      import-time singleton it never gates — a new evasion.
 *   2. Mutation M4 SURVIVED_ACCEPTABLE: no fixture pinned the suppression term,
 *      so deleting it passed the whole suite. This block pins it.
 *   3. A TS non-null assertion before division (`sum! / count`) was mis-lexed as
 *      a regex-open, letting the false regex swallow a brace and skew the
 *      depth-0 scan so the module-scope singleton was never seeded.
 * All drive the full auditAiCallSites scan over a throwaway fixture tree.
 */
describe("RA-6991 module-scope seed hardening", () => {
  function auditFixture(files: Record<string, string>): string[] {
    const root = mkdtempSync(join(tmpdir(), "ra-6991-fixture-"));
    try {
      for (const [relative, content] of Object.entries(files)) {
        const abs = join(root, relative);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
      }
      return auditAiCallSites(root).guardrailSummary.platformKeyFallbackFiles;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it("seeds a module-scope singleton despite a BYOK marker buried in an unrelated function body (evasion 1)", () => {
    // The reviewer's probe: the module-scope `client` singleton spends the
    // platform key at import time, but an unrelated exported helper names a BYOK
    // marker inside ITS body. Under RA-6986's whole-module suppression that
    // marker suppressed the seed, so the customer route importing the real
    // spender slipped the gate. The marker gates nothing the singleton runs, so
    // the seed must still fire.
    const flagged = auditFixture({
      "lib/inline/byok-in-unrelated-body.ts": `
        import Anthropic from "@anthropic-ai/sdk";
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        export async function classifyWithSingleton(input: string) {
          return client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 50,
            messages: [{ role: "user", content: input }],
          });
        }
        export async function unusedWorkspacePath(workspaceId: string) {
          return resolveWorkspaceAiKey(workspaceId, "ANTHROPIC");
        }
      `,
      "app/api/leak-buried-byok/route.ts": `
        import { classifyWithSingleton } from "@/lib/inline/byok-in-unrelated-body";
        export async function POST(req: Request) {
          return Response.json(await classifyWithSingleton(await req.text()));
        }
      `,
    });

    expect(flagged).toContain("app/api/leak-buried-byok/route.ts");
  });

  it("still suppresses a module-scope singleton whose BYOK marker resolves at MODULE scope (pins mutation M4)", () => {
    // The counterpart that keeps the suppression term honest: the singleton
    // reads the platform env key but a BYOK resolution runs at module-evaluation
    // scope (top-level statement), so it genuinely gates the import-time client
    // and the route must NOT be flagged. If the `!BYOK_MARKERS.some(...)`
    // suppression term is deleted (mutation M4), the env read alone seeds the
    // module and this route is flagged — so this expectation fails, pinning the
    // term.
    const flagged = auditFixture({
      "lib/inline/module-scope-byok.ts": `
        import Anthropic from "@anthropic-ai/sdk";
        const apiKey = resolveWorkspaceAiKey(workspaceId) ?? process.env.ANTHROPIC_API_KEY;
        const client = new Anthropic({ apiKey });
        export async function classifyWithModuleByok(input: string) {
          return client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 50,
            messages: [{ role: "user", content: input }],
          });
        }
      `,
      "app/api/module-scope-byok/route.ts": `
        import { classifyWithModuleByok } from "@/lib/inline/module-scope-byok";
        export async function POST(req: Request) {
          return Response.json(await classifyWithModuleByok(await req.text()));
        }
      `,
    });

    expect(flagged).not.toContain("app/api/module-scope-byok/route.ts");
  });

  it("still honours a BYOK resolution inside the singleton's own constructor args (pins M4 args scope)", () => {
    // The other half of the module-evaluation suppression scope: the BYOK
    // resolution sits in the constructor object literal (depth >= 1, excluded
    // from the depth-0 text scan). It runs at import time, so it must still
    // suppress — the route must NOT be flagged.
    const flagged = auditFixture({
      "lib/inline/ctor-args-byok.ts": `
        import Anthropic from "@anthropic-ai/sdk";
        const client = new Anthropic({
          apiKey: getProviderApiKey() ?? process.env.ANTHROPIC_API_KEY,
        });
        export async function classifyWithCtorByok(input: string) {
          return client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 50,
            messages: [{ role: "user", content: input }],
          });
        }
      `,
      "app/api/ctor-args-byok/route.ts": `
        import { classifyWithCtorByok } from "@/lib/inline/ctor-args-byok";
        export async function POST(req: Request) {
          return Response.json(await classifyWithCtorByok(await req.text()));
        }
      `,
    });

    expect(flagged).not.toContain("app/api/ctor-args-byok/route.ts");
  });

  it("seeds a module-scope singleton across a TS non-null assertion before division (evasion 3)", () => {
    // `sum! / count }` on one line: the `!` before `/` was mis-lexed as a
    // regex-open, so the false regex swallowed the arrow body's closing `}`,
    // leaving the depth scan at 1 and hiding the module-scope `new Anthropic`.
    // Treating the postfix `!` as a value (division follows) keeps the depth
    // scan balanced so the singleton is seeded and the route is flagged.
    const flagged = auditFixture({
      "lib/inline/non-null-division.ts": `
        import Anthropic from "@anthropic-ai/sdk";
        export const ratio = (sum: number, count: number) => { return sum! / count };
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        export async function classifyAfterNonNull(input: string) {
          return client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 50,
            messages: [{ role: "user", content: input }],
          });
        }
      `,
      "app/api/leak-non-null/route.ts": `
        import { classifyAfterNonNull } from "@/lib/inline/non-null-division";
        export async function POST(req: Request) {
          return Response.json(await classifyAfterNonNull(await req.text()));
        }
      `,
    });

    expect(flagged).toContain("app/api/leak-non-null/route.ts");
  });

  it("keeps a prefix logical-NOT regex stripped so its braces can't skew the scan (non-null fix guard)", () => {
    // Guards evasion 3's fix against over-correction: `return !/[{]/.test(x)` is
    // a prefix logical-NOT of a regex whose char class holds an unbalanced `{`.
    // The `!` must stay an operator (regex position) so the regex is stripped;
    // if it were misread as a non-null (division), the `{` would survive and
    // skew the depth-0 scan, hiding the singleton and dropping the route.
    const flagged = auditFixture({
      "lib/inline/logical-not-regex.ts": `
        import Anthropic from "@anthropic-ai/sdk";
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        export function hasOpenBrace(input: string) {
          return !/[{]/.test(input);
        }
        export async function classifyAfterLogicalNot(input: string) {
          return client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 50,
            messages: [{ role: "user", content: input }],
          });
        }
      `,
      "app/api/leak-logical-not/route.ts": `
        import { classifyAfterLogicalNot } from "@/lib/inline/logical-not-regex";
        export async function POST(req: Request) {
          return Response.json(await classifyAfterLogicalNot(await req.text()));
        }
      `,
    });

    expect(flagged).toContain("app/api/leak-logical-not/route.ts");
  });
});
