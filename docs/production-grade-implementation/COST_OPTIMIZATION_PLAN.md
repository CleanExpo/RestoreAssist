# Cost Optimization Plan

Date: 2026-05-24

## Cost Thesis

RestoreAssist cost will be driven by AI, media storage/transforms, database load, report generation, integrations, and support. The biggest avoidable cost is using frontier AI for tasks that deterministic rules, local models, OCR, or batch jobs can handle.

## Target Cost Model

Initial target per complete inspection:

- AI: USD $0.05-$0.30 for normal water loss.
- Media/storage: USD $0.02-$0.15 depending on photo count and retention.
- Database/app hosting: low cents at pilot scale.
- Report generation: low cents unless large PDF/image processing.
- Support: should decrease with guided capture and setup agent.

Large/disputed losses may exceed this and should be billed or budgeted separately.

## AI Cost Controls

### 1. Deterministic First

Use code before models for:

- Required evidence checks.
- ABN/GST/state validation.
- IICRC citation lookup from indexed chunks.
- Progress transition gates.
- File validation.
- Invoice GST math.
- Known insurer profile rules.

### 2. Task Routing

Route cheap/default:

- Note cleanup.
- Photo labels.
- Checklist summaries.
- Room/stage suggestions.
- Support ticket drafts.

Route premium only:

- Full compliance report draft.
- Complex damage reasoning.
- Dispute response.
- Multi-room scope recommendation.
- Insurer-specific narrative.

### 3. Batch and Async

Use batch/async for:

- Nightly QA.
- Embeddings.
- Bulk photo classification.
- Standards ingestion.
- Historical report review.

OpenAI Batch API and similar provider batch modes should be used where turnaround can be up to 24 hours.

### 4. Prompt Caching

Cache:

- IICRC system prompts.
- Report schemas.
- Insurer profile blocks.
- Repeated workspace context.
- Standards snippets.

### 5. Hard Budgets

Implement:

- Workspace daily budget.
- Workspace monthly budget.
- Per-task max cost.
- Per-user rate limits.
- Per-route media upload caps.
- Kill switch by provider/model/task.

### 6. BYOK

Use BYOK for:

- Power users.
- Premium reports.
- High-volume businesses.
- Customers requiring direct provider billing.

Guardrails:

- BYOK keys encrypted.
- BYOK provider allowlist.
- Clear warning on data residency and provider terms.
- Fallback manual workflow when key fails.

## Media and Storage Controls

- Store original once.
- Generate only required derivatives.
- Compress/resize for report thumbnails.
- Use lifecycle policy for old raw media after legal retention/export requirements.
- Deduplicate identical uploads by hash.
- Add upload batch size and daily workspace caps.
- Track Cloudinary transforms separately from storage.

## Database and Query Controls

- Enforce `take` and pagination on all lists.
- Add covering indexes for high-volume workspace/time/status queries.
- Move analytics to precomputed summaries where needed.
- Use vector search with tight top-k and metadata filters.
- Avoid per-row AI or storage calls in request/response path.

## Integration Cost Controls

- Fire-and-forget sync.
- Coalesce repeated sync events.
- Backoff retries.
- Dead-letter old failures.
- Show retry CTA instead of infinite retry loops.
- Cache external reference data like Xero account codes and ServiceM8 job metadata.

## Observability

Dashboards:

- AI spend by workspace/provider/model/task.
- Cost per inspection.
- Storage per workspace.
- Upload count per inspection.
- Report generation time/cost.
- Queue retry count.
- Failed AI calls cost.

Alerts:

- Workspace exceeds 80 percent monthly budget.
- Daily AI cost spike.
- Media upload spike.
- Queue failure age over threshold.
- Provider fallback rate above threshold.

## Cost Blowout Scenarios

### Scenario: Technician uploads hundreds of photos

Error: Storage and transform spend spikes.  
Cause: Unbounded field capture or duplicate uploads.  
Fix: Batch upload limits, duplicate hash detection, compression, workspace warning, and archive policy.

### Scenario: Realtime voice left running

Error: Audio token cost spikes.  
Cause: Realtime session does not stop on background/lock/network transition.  
Fix: Push-to-talk default, max session length, silence timeout, app lifecycle stop, cost meter.

### Scenario: Report generation repeats

Error: Same report draft costs multiple premium calls.  
Cause: No draft caching/versioning.  
Fix: Report section cache keyed by evidence hash, prompt version, model version, and user edits.

### Scenario: Vector retrieval too broad

Error: Large context costs rise and citations become noisy.  
Cause: RAG sends too many chunks.  
Fix: Top-k filters by standard/edition/section/jurisdiction and summarize only retrieved chunks.

### Scenario: Provider outage causes expensive fallback

Error: Cheap model fails and premium fallback handles all traffic.  
Cause: Fallback chain ignores cost policy.  
Fix: Fallback policy must include max cost and task criticality. Non-blocking tasks should queue or degrade.

## Immediate Savings

1. Move sketch-import rate limiting to shared limiter.
2. Add per-task AI cost caps in gateway.
3. Use batch for non-urgent classification/eval jobs.
4. Cache report drafts by evidence hash.
5. Add image compression before upload where possible.
6. Add workspace AI spend dashboard to settings.
7. Default routine photo tagging to low-cost/local model after eval pass.

