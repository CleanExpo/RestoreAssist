# RestoreAssist — Bring Your Own Everything (BYOE) Year-Two Vision

**Issue:** RA-611
**Source:** BOARD-MEMO-BYOS-STORAGE-2026-04-03.md — Next Action 3
**Date:** 2026-04-12
**Status:** Strategic planning document — H2 and H3 horizons

---

## Executive Summary

RestoreAssist is architected from the ground up for progressive customer ownership of the underlying infrastructure. The path from "fully hosted SaaS" (today) to "fully customer-hosted platform" (2027 enterprise tier) runs through four discrete capability phases:

| Phase                     | Acronym | What the customer owns                              | When                  |
| ------------------------- | ------- | --------------------------------------------------- | --------------------- |
| Bring Your Own Key        | BYOK    | Model provider API keys (Anthropic, Google, OpenAI) | Now — live            |
| Bring Your Own Storage    | BYOS    | Cloud storage bucket for photos/documents           | H2 — Q3 2026          |
| Bring Your Own Compute    | BYOC    | Local inference (Gemma 4 on-prem)                   | H3 — Q1 2027          |
| Bring Your Own Everything | BYOE    | Full self-hosted deployment                         | H3+ — 2027 enterprise |

This document defines what each phase looks like architecturally, commercially, and operationally.

---

## 1. Current State (H1 — 2026)

### Infrastructure

- **Database:** Supabase PostgreSQL, hosted in AWS ap-southeast-2 (Sydney)
- **File storage:** Supabase Storage, same region. All inspection photos, generated PDFs, and uploaded documents stored under `restoreassist/{company_id}/{inspection_id}/`
- **Inference:** Anthropic API (claude-sonnet-4-6 primary). Single shared API key managed by RestoreAssist
- **Auth:** NextAuth v5 with Supabase adapter
- **Deployment:** Vercel (Next.js) + Railway (Pi-Dev-Ops orchestration layer)

### BYOK — Live Today

The `workspace/provider-connections` API allows enterprise customers to register their own:

- Anthropic API key (`BYOK_ANTHROPIC_API_KEY`)
- OpenAI API key (`BYOK_OPENAI_API_KEY`)
- Google AI API key (`BYOK_GOOGLE_API_KEY`)

When a customer's BYOK key is present, all AI calls for their tenant route through their key. This gives them:

- Direct billing relationship with the model provider
- Usage visibility in their own provider dashboard
- Ability to apply their own model rate limits and policies

### Architectural constraint today

Storage is not yet pluggable. All tenants share the RestoreAssist Supabase Storage bucket, partitioned by company ID. This works for early pilots but creates issues at scale:

- **Data sovereignty edge cases:** Some regulated AU customers (local government, defence contractors) require data to never leave their own cloud account — even in an Australian data centre operated by a third party
- **Retention control:** Insurance companies require raw inspection photos retained for 7 years (S500 compliance). Customers want to manage this on their own storage with their own backup policies
- **Cost:** At 100+ customers with high photo volume, shared storage costs at RestoreAssist's expense become material

---

## 2. H2 Vision — Bring Your Own Storage (Q3 2026, ~20 customers)

### Goal

Allow customers to connect their own cloud storage bucket. RestoreAssist writes to and reads from their bucket instead of the shared Supabase Storage pool.

### Architecture

`lib/storage/provider.ts` already exists as a pluggable interface. H2 ships two concrete implementations:

```typescript
// Provider interface (already defined)
interface StorageProvider {
  upload(path: string, file: Buffer, metadata: FileMetadata): Promise<string>
  download(path: string): Promise<Buffer>
  delete(path: string): Promise<void>
  generateSignedUrl(path: string, expiresIn: number): Promise<string>
}

// H1 — Default (always-on)
class SupabaseStorageProvider implements StorageProvider { ... }

// H2 — Customer-owned (opt-in)
class S3StorageProvider implements StorageProvider { ... }       // AWS S3
class AzureBlobStorageProvider implements StorageProvider { ... } // Azure Blob Storage
```

### What the customer configures

In the workspace settings UI (`/dashboard/workspace/storage`):

| Field               | Description                                             |
| ------------------- | ------------------------------------------------------- |
| Provider            | Supabase (default) / AWS S3 / Azure Blob Storage        |
| Bucket name         | e.g. `acme-restoreassist-prod`                          |
| Region              | e.g. `ap-southeast-2`                                   |
| Access key / Secret | Rotated by the customer                                 |
| Path prefix         | e.g. `inspections/` (scopes writes within their bucket) |

### Validation

On save, RestoreAssist performs a write-read-delete test with a 1KB probe object. If this fails, the configuration is rejected. No data moves to the new provider until the validation passes.

### Data migration (H2 scope)

H2 **does not include** automated migration of existing photos to the customer bucket. Customers who switch to BYOS start with their bucket empty and RestoreAssist falls back to shared storage for historical inspections. Full historical migration is H3 scope.

### Pricing impact

BYOS adds no cost to the customer during H2 pilot. Storage costs for their data shift from RestoreAssist to the customer. In H3, BYOS becomes a feature of the Enterprise tier (included above a seat count threshold).

### H2 build triggers

Start H2 BYOS development when any of:

- 3+ customers explicitly request data sovereignty control in their contracting
- A customer is a local government entity (DHA, council, emergency management)
- Monthly storage cost to RestoreAssist exceeds $200/month (scale inflection)

---

## 3. H3 Vision — Bring Your Own Compute (Q1 2027, ~100 customers)

### Goal

Allow enterprise customers to run inference locally using open-weight models (Gemma 4, Llama 4, or future AU-hosted models). This eliminates the Anthropic API dependency entirely for customers with strict data residency requirements.

### Why this matters for the Australian market

The IICRC S500:2025 compliance workflow involves processing detailed property data, personal information (property owner name, insurer claim number), and sometimes sensitive structural assessments. Several customer segments require that this data never leaves their network perimeter:

- **Defence contractor restoration:** Must comply with DSPF data handling requirements
- **State emergency management agencies:** Data sovereignty under the Privacy Act 1988 and state equivalents
- **Large insurers (private):** Prefer air-gapped assessment workflows for claim integrity

### BYOC architecture

```
Customer infrastructure
┌─────────────────────────────────────────────────────┐
│  RestoreAssist container (self-hosted)               │
│  ┌────────────────┐   ┌──────────────────────────┐  │
│  │  Next.js app   │ → │  Local inference server   │  │
│  │  (same code)   │   │  (Ollama + Gemma 4)       │  │
│  └────────────────┘   └──────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │  Customer Supabase (self-hosted or customer    │  │
│  │  managed Supabase Cloud account)               │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                    ↕ no outbound data
              Customer's network boundary
```

### Model selection

Primary target: **Gemma 4** (Google open-weight, commercial licence, strong instruction-following)

Minimum hardware: 64GB RAM, 4× A10G GPU (or equivalent). This is cloud-instance class — not a standard server. The practical deployment is a managed Kubernetes cluster or a dedicated cloud instance in the customer's own AWS/Azure account.

The inference server exposes an OpenAI-compatible API. The RestoreAssist codebase already uses the `openai` SDK adapter layer — swapping to a local endpoint is a single env var change (`OPENAI_BASE_URL=http://localhost:11434/v1`).

### Accuracy trade-off

Gemma 4 at the 27B parameter size produces reports that are approximately 85–90% of the quality of claude-sonnet-4-6 on standard S500 inspection scenarios. The remaining 10–15% gap is in:

- Complex multi-room moisture gradient interpretation
- Psychrometric chart analysis
- Narrative richness (vocabulary, structure)

BYOC customers accept this trade-off in exchange for data sovereignty. The gap is expected to close as model quality improves through 2026–2027.

### H3 build triggers

Start H3 BYOC development when any of:

- A defence or government customer is confirmed and contracting (creates revenue certainty for the build)
- A major private insurer requests an air-gapped pilot
- Gemma 4 benchmark scores reach parity with GPT-4o on structured report generation tasks (public benchmark tracking via RA-395 evaluation protocol)

---

## 4. BYOE Vision — Fully Customer-Hosted RestoreAssist (2027 Enterprise)

### What BYOE means

The customer runs the entire RestoreAssist platform stack on their own infrastructure. RestoreAssist ships:

- Container images (Docker)
- Infrastructure-as-code (Terraform modules for AWS and Azure)
- A configuration manifest
- A licence file (seat count + feature flags)
- An update channel (periodic pull, not push)

RestoreAssist does **not** have access to the customer's installation. No telemetry, no call-home, no remote management.

### What the customer is responsible for

| Area      | Customer responsibility                                                   |
| --------- | ------------------------------------------------------------------------- |
| Hosting   | Provision and maintain cloud infrastructure (ECS, AKS, or bare metal)     |
| Database  | Supabase self-hosted or compatible PostgreSQL 15+                         |
| Storage   | Customer-owned S3-compatible bucket                                       |
| Inference | Local inference server or customer's own API key                          |
| Updates   | Pull and apply RestoreAssist releases on their own schedule               |
| Backups   | 7-year inspection record retention (S500 compliance — their obligation)   |
| Security  | Network perimeter, access control, key management                         |
| Support   | First-line support from their own IT team; second-line from RestoreAssist |

### What RestoreAssist provides under BYOE

| Area                 | RestoreAssist responsibility                                                    |
| -------------------- | ------------------------------------------------------------------------------- |
| Software releases    | Versioned container images via private registry                                 |
| Update notifications | Release notes + security advisories via email                                   |
| Licence enforcement  | Offline-capable licence validation (no call-home required)                      |
| Second-line support  | Ticket-based, agreed SLA (4h/8h critical/standard)                              |
| Compliance updates   | New IICRC editions, Australian building code changes incorporated into releases |
| IICRC vocabulary     | Updated vocabulary files distributed with releases                              |

### Licence model

BYOE licences are:

- **Annual, per-seat** (same structure as cloud tier, higher unit price)
- **Priced at 3× the equivalent cloud seat rate** (customer absorbs infrastructure cost; RestoreAssist charges for software + support premium)
- **Minimum 10 seats** (below this, cloud tier is economically superior for the customer)
- **Renewal-locked to current version + 1** (customers must stay within 1 major version to receive support)

### Compliance posture

Under BYOE, the customer is the data controller. RestoreAssist is a data processor only during the initial onboarding and configuration phase. This substantially simplifies the Privacy Act 1988 and APP compliance posture for regulated customers — they can demonstrate data sovereignty without any third-party processor attestation requirement on RestoreAssist's side.

---

## 5. Commercial Positioning — BYOE on the Pricing Ladder

```
Pricing tier          Features                           Who
──────────────────────────────────────────────────────────────────────
Trial                 Full features, 30 days             New pilots
Starter (cloud)       Full features, ≤3 seats            Solo contractors
Professional (cloud)  Full features, ≤10 seats           Small teams
Team (cloud)          Full features, unlimited seats     Large businesses
Enterprise (cloud)    + BYOS, SLA, custom IICRC vocab    Regulated orgs
Enterprise (BYOE)     + BYOC, BYOE, air-gapped           Defence/govt/insurance
```

**BYOE pricing rationale:**

The Enterprise (BYOE) tier targets customers for whom the compliance and data sovereignty value exceeds the infrastructure overhead. These customers are:

- Already running their own cloud infrastructure
- Subject to procurement processes that preclude SaaS data processors
- Willing to pay a premium for control

The 3× price premium over cloud Enterprise is justified by:

- Elimination of RestoreAssist's infrastructure cost (the customer pays their own cloud bill)
- Higher support cost per seat (self-hosted deployments are more complex to support)
- Lower volume (fewer seats, less amortisation of fixed costs)

---

## 6. Build Triggers — What Accelerates Each Horizon

### H2 BYOS — trigger conditions

| Signal                                                               | Weight | Action          |
| -------------------------------------------------------------------- | ------ | --------------- |
| Customer explicitly requests data sovereignty in contracting         | High   | Start H2 sprint |
| Monthly shared storage cost > $200                                   | Medium | Start H2 sprint |
| 3+ customers in regulated sectors (govt, defence, insurance)         | Medium | Start H2 sprint |
| Customer asks "where is my data stored?" more than twice per quarter | Low    | Monitor         |

### H3 BYOC — trigger conditions

| Signal                                                      | Weight   | Action                      |
| ----------------------------------------------------------- | -------- | --------------------------- |
| Signed LOI from defence or government customer              | High     | Fund H3 build               |
| Private insurer requests air-gapped pilot                   | High     | Fund H3 build               |
| Gemma 4 reaches 95% benchmark parity with claude-sonnet     | Medium   | Start technical prototyping |
| BYOS in production for 6+ months (infrastructure stability) | Required | Prerequisite for H3         |

### BYOE — trigger conditions

| Signal                                                            | Weight   | Action                 |
| ----------------------------------------------------------------- | -------- | ---------------------- |
| Customer requires no third-party data processor (contract clause) | High     | Scope BYOE             |
| BYOC stable for 3+ customers for 90 days                          | Required | Prerequisite           |
| Legal advice confirms BYOE is the only pathway to the customer    | High     | Build or lose the deal |

---

## 7. Relationship to Other Strategic Documents

- **BOARD-MEMO-BYOS-STORAGE-2026-04-03.md** — the BYOS decision and `lib/storage/provider.ts` pluggable interface
- **WORKSPACE-SPEC.md** — H2/H3 workspace provisioning automation spec (reference this doc in the H2/H3 sections)
- **BOARD-DECISIONS-2026-04-07.md** — confirmed Supabase Storage as the default (Cloudinary removed)
- **RA-437** — Historical job embeddings (pgvector RAG stack — relevant to BYOC inference quality)
- **RA-570** — HistoricalJob embeddings for BYOC training baseline

---

_This document is a living strategy brief. Update when: a customer triggers a horizon, a build decision is made, or the model quality benchmarks change materially. Do not delete trigger conditions that haven't fired — they are the forward signal._
