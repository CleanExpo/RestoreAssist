---
type: index
name: contracts
description: OKF index — 1 concept, 0 subfolders
okf_version: "0.1"
updated: 2026-07-25
---

<!-- okf:generated -->
# contracts — index

_Read this first. Lists every concept + subfolder here so an agent loads only what it needs (OKF / LLM-Wiki pattern)._

## Concepts
- [[claims-integration-v1.schema]] — Claims Integration Export v1 JSON Schema — versioned insurer/adjuster handoff contract; zod source of truth in `lib/export/claims-contract.ts`, regenerate via `pnpm exec tsx scripts/generate-claims-schema.ts`, drift-gated by `lib/export/__tests__/claims-contract.test.ts`
