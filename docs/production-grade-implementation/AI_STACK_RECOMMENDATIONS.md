# AI Stack Recommendations

Date: 2026-05-24

## Recommendation

Adopt a task-routed AI gateway with explicit defaults, fallbacks, budget gates, evals, and audit logging. Do not standardize on one frontier model. RestoreAssist has too many task shapes: realtime voice, transcription, OCR, photo tagging, floorplan extraction, report drafting, RAG citation, claim QA, support triage, and batch backfills.

The AI stack should be:

- **Gateway-first:** one internal API for model selection, retries, budget checks, redaction, telemetry, and audit records.
- **Task-routed:** cheap/local models for simple work, premium models for compliance reports and disputed claims.
- **BYOK-compatible:** tenants can use OpenAI, Anthropic, Gemini, or approved custom providers, but platform defaults must work.
- **Offline-aware:** local/edge inference for capture assistance where connectivity is unreliable.
- **Eval-gated:** every model swap must pass restoration-specific evals.

## Current Repo Baseline

Existing strengths:

- `lib/services/ai/anthropic-gateway.ts` uses a structured `ServiceResult` pattern and centralizes Anthropic SDK access.
- `lib/ai/model-router.ts` already divides basic and premium tasks and expects 60-80 percent cost reduction through cheaper routing.
- `prisma/schema.prisma` includes `AiUsageLog` with provider, model, task type, tokens, estimated cost, latency, success, error type, and metadata.
- `pgvector` is enabled and `IicrcChunk` exists for standards RAG.
- `app/api/ai/voice-note-transcribe/route.ts` exists and uses OpenAI Whisper with restoration vocabulary hints.

Existing gaps:

- The mature gateway is Anthropic-specific.
- Voice realtime is not productionized.
- Sketch image import is single-provider Claude Vision.
- No unified task policy file declares allowed models, data residency rules, fallback chains, and max cost per task.
- No central redaction/PII classifier before provider calls.
- No model eval registry for S500/S520/S700 report accuracy, AU/NZ spelling, and false citation risk.

## Task Policy

| Task | Default | Fallback | Local/Edge Option | Notes |
|---|---|---|---|---|
| Short note structuring | OpenAI mini/nano or Gemini Flash | Qwen/DeepSeek via approved gateway | Small local LLM | Low risk; require JSON schema |
| Photo tagging and damage labels | Gemini Flash or OpenAI vision mini | Qwen-VL / PaddleOCR-VL for OCR-heavy images | Qwen2.5/3-VL small, PaddleOCR-VL | Store confidence and require user confirmation |
| OCR from invoices/forms | PaddleOCR-VL local/service | OpenAI/Gemini vision | PaddleOCR-VL | Prefer deterministic OCR pipeline before VLM reasoning |
| Sketch/floorplan import | Gemini/OpenAI vision for layout plus geometry post-processor | Claude vision | Qwen-VL if hosted | Output room graph, not raw prose |
| S500/S520/S700 report draft | Anthropic Sonnet/Opus or OpenAI large model | Gemini Pro | None | Must cite edition/section and surface draft for edit |
| Claim QA/completeness | OpenAI mini or Gemini Flash | Anthropic Haiku/Sonnet | Local LLM for checklist-only | Use deterministic checklist first, LLM second |
| RAG clause lookup | Embeddings + deterministic retrieval | Model summarizes retrieved chunks | Local embeddings optional | Never let model invent clause text |
| Voice transcription | Local STT where possible, OpenAI realtime/Whisper cloud fallback | Gemini/Deepgram if approved | Whisper.cpp / WhisperKit / Moonshine | Cache audio only per retention policy |
| Realtime field copilot | OpenAI Realtime via WebRTC | Chained STT + text model + TTS | Local STT plus text fallback | Use for active capture, not long report drafting |
| Batch report QA/backfills | Batch API or async queue | Flex/low-priority tier | Local batch for OCR | Use 24h jobs for cost savings |

## Provider Recommendations

### OpenAI

Use for:

- Realtime voice agents with WebRTC and ephemeral client tokens.
- Responses API for tool-using, structured, multimodal tasks.
- Batch API for async evals, photo classification backfills, embeddings, and nightly QA.
- Mini/nano models for low-cost classification and note structuring.

Why:

- Official docs describe the Realtime API as low-latency multimodal audio/image/text with WebRTC recommended for browser/mobile clients.
- Official Batch API docs state 50 percent lower cost with 24-hour turnaround, useful for non-urgent processing.
- Official pricing currently lists cheaper mini/nano tiers and realtime speech models, making OpenAI a strong candidate for voice and structured workflows.

Risks:

- Realtime audio can get expensive quickly.
- API pricing and model names change. Keep model strings in configuration, not scattered through routes.

### Anthropic Claude

Use for:

- High-stakes compliance report drafting.
- Complex expert analysis.
- Long-context report QA where citation discipline and reasoning quality matter.

Why:

- Current repo already has Anthropic service-layer patterns and tests.
- Existing S500 report and sketch services are Anthropic-oriented.

Risks:

- Cost blowouts on large reports.
- Provider-specific gateway lock-in if the Anthropic service layer is not generalized.

### Google Gemini

Use for:

- Cost-effective multimodal image/video/photo analysis.
- Vertex AI deployment where enterprise controls, Google storage, and regional controls matter.
- Long-context inspection/package review if pricing is favorable.

Why:

- Official Vertex AI pricing shows Gemini model tiers, multimodal input support, batch discounts, and cached-input pricing.

Risks:

- Billing surprises from grounding or media-heavy workloads. Quotas and budgets must be enforced per project.

### DeepSeek, Qwen, Moonshot/Kimi, MiniMax

Use for:

- Low-risk, non-PII, non-customer-sensitive internal tasks after security review.
- Cost comparison evals.
- Optional tenant-BYOK if the customer accepts data jurisdiction and provider risk.

Do not use by default for:

- Australian/NZ customer PII.
- Insurer claim records.
- Secrets, tokens, medical/biohazard-sensitive data, or evidence photos.

Why:

- DeepSeek, Qwen, Moonshot/Kimi, and MiniMax can be significantly cheaper for text/coding and some multimodal tasks.
- Qwen and Moonshot offer context caching and lower-cost model tiers in official pricing/help pages.

Risks:

- Data residency, support, auditability, and geopolitical/vendor-policy risk.
- Third-party proxy pricing is not acceptable for production.

### Open-Source and Edge/Local

Use for:

- Offline transcription.
- OCR/document parsing.
- First-pass photo labels.
- On-device confidence checks.

Candidates:

- Whisper.cpp, WhisperKit, Moonshine or platform speech for local transcription.
- PaddleOCR-VL for compact document OCR.
- Qwen2.5-VL/Qwen3-VL or InternVL for self-hosted vision experiments.
- Small local LLM for checklist guidance and structured note cleanup.

Risks:

- Mobile battery, memory, and model packaging.
- Accuracy variance on wet-site photos, low light, handwriting, and Australian accents.

## Gateway Architecture

Create `lib/ai-gateway/`:

```
lib/ai-gateway/
  task-policy.ts
  provider-registry.ts
  redact.ts
  budget.ts
  eval-tags.ts
  invoke.ts
  schemas/
    photo-tagging.ts
    sketch-import.ts
    report-draft.ts
    voice-command.ts
```

Gateway responsibilities:

- Resolve task policy by `workspaceId`, `taskType`, `dataClass`, and `latencyClass`.
- Check subscription and credits before paid calls.
- Apply per-workspace daily budgets and per-task caps.
- Redact where safe, block where unsafe.
- Enforce structured output schemas.
- Log `AiUsageLog` and audit events.
- Retry and fallback only for safe retryable failures.
- Store prompt/version/model metadata for reproducibility.

## Cost Controls

- Use deterministic rules first: evidence checklist, completeness, file validation, route ownership, progress guards.
- Use model caching for repeated IICRC system prompts and standards snippets.
- Use batch processing for nightly QA, embeddings, and non-urgent photo classification.
- Use low-cost models for photo tags, note cleanup, and checklist summaries.
- Use premium models only for report draft, disputed scope, large loss, and compliance-heavy reasoning.
- Add tenant budget UI: today spend, month spend, task spend, model breakdown, failed-call cost.
- Add a hard kill switch per workspace and per provider.

## Evals Required Before Model Changes

1. S500:2021 Category/Class accuracy.
2. False citation rate: zero invented IICRC sections.
3. AU/NZ spelling and GST/legal phrasing.
4. Photo evidence classification accuracy across source, affected area, meter, equipment, final, signoff.
5. Sketch import room count, adjacency, and area error.
6. Voice moisture reading extraction in noisy conditions.
7. Report completeness against insurer profile.
8. Cost per complete inspection.

## Sources

- OpenAI API pricing: https://openai.com/api/pricing/
- OpenAI Realtime API: https://platform.openai.com/docs/guides/realtime/overview%3A
- OpenAI voice agents: https://platform.openai.com/docs/guides/voice-agents
- OpenAI Realtime WebRTC: https://platform.openai.com/docs/guides/realtime-webrtc
- OpenAI Responses API reference: https://platform.openai.com/docs/api-reference/responses/retrieve
- OpenAI Batch API: https://platform.openai.com/docs/guides/batch/
- OpenAI Batch FAQ: https://help.openai.com/en/articles/9197833-batch-api-faq%3F.gz
- Anthropic pricing: https://docs.anthropic.com/en/docs/about-claude/pricing
- Google Vertex AI generative pricing: https://cloud.google.com/vertex-ai/generative-ai/pricing
- DeepSeek pricing: https://api-docs.deepseek.com/quick_start/pricing
- Alibaba Cloud Model Studio pricing: https://www.alibabacloud.com/help/en/model-studio/model-pricing
- Kimi API pricing: https://www.kimi.com/help/kimi-api/api-pricing
- MiniMax pricing: https://www.minimax.io/pricing
- PaddleOCR-VL docs: https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/PaddleOCR-VL.html
- PaddleOCR-VL Hugging Face: https://huggingface.co/PaddlePaddle/PaddleOCR-VL
- Qwen2.5-VL GitHub: https://github.com/QwenLM/Qwen2.5-VL

