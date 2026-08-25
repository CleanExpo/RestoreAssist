---
type: index
name: contracts
description: OKF index — 2 concepts, 0 subfolders
okf_version: "0.1"
updated: 2026-08-23
---

<!-- okf:generated -->

# contracts — index

_Read this first. Lists every concept + subfolder here so an agent loads only what it needs (OKF / LLM-Wiki pattern)._

## Concepts

- [[claims-integration-v2.schema]] — Claims Integration Export v2 JSON Schema — **the live contract**; versioned insurer/adjuster handoff payload; zod source of truth in `lib/export/claims-contract.ts`, regenerate via `pnpm exec tsx scripts/generate-claims-schema.ts`, drift-gated by `lib/export/__tests__/claims-contract.test.ts`
- [[claims-integration-v1.schema]] — Claims Integration Export v1 JSON Schema — **retired and frozen**; v2 widened `report.photoManifest.photos[].latitude/longitude` to `number | null` so a photo with no GPS fix is no longer published as `0, 0`. Not regenerated; kept unchanged so anything bound to v1 still has a stable document describing what v1 was.
