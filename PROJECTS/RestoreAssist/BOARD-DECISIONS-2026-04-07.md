# Board Decisions — Founder Acknowledgment

**Date:** 2026-04-07
**Issued by:** Phill McGurk (Founder, Unite-Group Nexus Pty Ltd)
**Status:** ACCEPTED — all rulings binding effective immediately

---

## RA-422 — Workspace Spec Rulings

### 1. OpenRouter — REJECTED

OpenRouter is not entering the BYOK allowlist or provider list. The platform supports:
- OpenAI (GPT-4o, o1, text-embedding-3-small)
- Anthropic (Claude claude-sonnet-4-5, claude-sonnet-4-5, Haiku)
- Google (Gemini 1.5 Pro/Flash)
- Groq (Llama 3.1 inference)

No additional routing middleware. Decision is final.

### 2. Gemma 4 Local Desktop Inference — DEFERRED TO HORIZON 3

RestoreAssist is a server-hosted web app (Capacitor WebView). GPU-accelerated local inference via Gemma-4-31B-IT is not applicable to the current architecture. Gemma-4 continues as a server-side inference option only — referenced in AI constants but not surfaced as a BYOK provider option.

Horizon 3 (native mobile/desktop) will revisit if on-device inference becomes architecturally viable.

### 3. Obsidian Injection Framework — REMOVED

Obsidian is Phill's personal knowledge management tool and will not be integrated into the RestoreAssist platform architecture.

The following domain objects will **not** enter the Prisma schema:
- `obsidian_vault_bindings`
- `obsidian_note_registry`
- `obsidian_templates`

Any CLAUDE.md or architecture documentation referencing Obsidian as a platform integration is to be treated as personal tooling notes only.

---

## RA-421 — Brand Consolidation Decision

### Decision: RestoreAssist is the sole market-facing brand.

**DR (Disaster Recovery)** and **NRPG (National Restoration & Property Group)** are repositioned as **internal operating entities / sub-brands** — not market-facing products.

| Entity | Role going forward |
|--------|-------------------|
| **RestoreAssist** | Primary market brand — all product, marketing, sales activity |
| **CARSI / DR** | Operating entity for field services (ABN: 62 580 077 456) |
| **NRPG** | Internal training / operations brand; not market-facing |

### Implications

- All external-facing product copy uses "RestoreAssist"
- Footer, invoices, and legal notices use "Restore Assist by Unite-Group Nexus Pty Ltd" + ABN 62 580 077 456
- Media cataloging and AI features serve RestoreAssist only (not DR/NRPG as separate tenants)
- Linear team `DR-NRPG` remains for internal task tracking; no change to workflow tooling
- No brand rename in GitHub repo, Vercel project names, or Supabase project IDs at this stage

---

*These rulings supersede all previous conflicting instructions in CLAUDE.md, ARCHITECTURE.md, or Linear issues.*
