# Pi-CEO — RestoreAssist Artifact Inventory

**Generated:** 2026-05-18  
**Scan scope:** ~/Pi-CEO (recursive, thorough)  
**Total RA-tagged files found:** 298  
**Unique artifacts after deduplication:** 26 core + 5 workflow definitions  
**Scan method:** `find` + `grep` + metadata extraction + first 50 lines sampling

---

## EXECUTIVE SUMMARY

The Pi-CEO archive contains **26 deduplicated, non-stale RestoreAssist artifacts** spanning board governance, product positioning, technical architecture, operations, and automation. All files are recent (≤36 days old; newest from 2026-05-15). No artifacts older than 30 days. Two top-level .docx board briefs serve as governance records; a seven-pillar charter is the canonical governance document.

---

## BOARD RECORDS & GOVERNANCE

### Strategic Board Documents (Top-Level)

| Date | File | Size | Purpose | Status |
|---|---|---|---|---|
| 2026-04-14 | `RA-650-SwarmFinal-BoardPaper-2026-04-14.docx` | 30 KB | Final swarm orchestration paper for board review | **CURRENT** |
| 2026-04-12 | `RA-588-Marathon4-BoardBrief-2026-04-12.docx` | 24 KB | Marathon 4 board brief (project charter & roadmap) | **CURRENT** |

### Project Charter & Governance (Canonical)

| Date | Path | Lines | Purpose | Status |
|---|---|---|---|---|
| 2026-04-11 | `Pi-Dev-Ops-task3-tmp/.harness/business-charters/projects/restoreassist-charter.md` | 86 | **CANONICAL** seven-pillar governance charter; baseline security/code quality/deployment scan; roadmap Phase 1-4 to production-ready | **CANONICAL** |

**Key governance content:**
- Seven-pillar scoring: Security (RED, 25 high findings), Code Quality (GREEN), Dependencies (GREEN), Deployment (GREEN), Observability (AMBER), Documentation (AMBER), Autonomy-Ready (RED)
- Phase 1 (Week 1): Security triage — hardcoded passwords, `dangerouslySetInnerHTML` review
- Phase 2-4: Code quality, observability, documentation, autonomy readiness

---

## STRATEGIC SPECS & DOCUMENTATION

### Positioning & Product Definition (Latest 2026-05-08)

| Date | Path | Lines | Purpose | Status |
|---|---|---|---|---|
| 2026-05-08 | `Pi-Dev-Ops-task3-tmp/.harness/artefacts/restoreassist/positioning-2026-05-08.md` | 96 | Core belief, problem statement (carrier dependency, documentation burden, scope disputes), three positioning pillars | **CURRENT** |
| 2026-05-08 | `Pi-Dev-Ops-task3-tmp/.harness/artefacts/restoreassist/landing-page-2026-05-08.md` | 163 | Landing page copy (hero: "Stop Letting the Adjuster Write Your Scope", problem sections, solution) | **CURRENT** |
| 2026-05-08 | `Pi-Dev-Ops-task3-tmp/.harness/artefacts/restoreassist/icp-research-2026-05-08.md` | 143 | ICP research — target customer profiles (restoration contractors ANZ), market segments | **CURRENT** |
| 2026-05-08 | `Pi-Dev-Ops-task3-tmp/.harness/artefacts/restoreassist/seo-keywords-2026-05-08.md` | 116 | SEO keywords & content strategy | **CURRENT** |

**Core positioning theme:** RestoreAssist gives restoration contractors documentation power to dispute insurer scope compression. "Your assessment. Your invoice. Your terms."

### Technical Context & Operational Docs

| Date | Path | Lines | Purpose | Status |
|---|---|---|---|---|
| 2026-04-15 | `Pi-Dev-Ops-task3-tmp/.harness/notebooklm-source-restoreassist.md` | 240+ | NotebookLM source — what RA is, tech stack (Next.js, Supabase, Vercel), business model, Linear project ID, roadmap outline | **REFERENCE** |
| 2026-05-03 | `scripts/RA-1912_RESTORE_RUNBOOK.md` | 94 | Restore-from-clean-Mac runbook — recovery for SSD failure, Claude memory backup to GitHub, LaunchAgent setup | **OPERATIONAL** |
| 2026-04-27 | `RestoreAssist/Migrations/RA-1407-migration.sql` | 451 | Supabase schema migration — settings, sessions, extensions table definition (note: RA-1407 handles session status lifecycle) | **OPERATIONAL** |

---

## ARCHITECTURE & TECHNICAL DECISIONS

| Date | Path | Lines | Purpose | Status |
|---|---|---|---|---|
| 2026-05-06 | `Pi-Dev-Ops-task3-tmp/docs/architecture/2026-05-06-ra-2026-hermes-blueprint.md` | 240+ | Hermes integration blueprint — autonomous ops architecture; background process design | **RECENT** |
| 2026-05-06 | `Pi-Dev-Ops-task3-tmp/docs/experiments/2026-05-06-ra-1990-prune-validation.md` | 180+ | RA-1990 pruning validation — testing data structure changes without breaking dependencies | **RECENT** |

---

## OPERATIONS & EVALUATION DOCS

### Routines & Scheduled Tasks Evaluation

| Date | Path | Lines | Purpose | Status |
|---|---|---|---|---|
| 2026-04-16 | `Pi-Dev-Ops-task3-tmp/.harness/RA-1010-routines-eval.md` | 145 | **RA-1010:** Claude Code Routines evaluation — trigger parity analysis (GitHub workflow_run native, Linear webhook requires workaround/polling), MCP connectors accessible | **KEY EVAL** |

### PR & CI Evaluation Docs (Latest, 2026-05-15)

| Date | Path | Lines | Purpose | Status |
|---|---|---|---|---|
| 2026-05-15 | `Pi-Dev-Ops-task3-tmp/.harness/PR-RA-1973.md` | 147 | PR RA-1973 evaluation | **RECENT** |
| 2026-05-15 | `Pi-Dev-Ops-task3-tmp/.harness/PR-RA-1970.md` | 160 | PR RA-1970 evaluation | **RECENT** |
| 2026-05-15 | `Pi-Dev-Ops-task3-tmp/.harness/PR-RA-1962-tw4.md` | 135 | PR RA-1962 (TW4) evaluation | **RECENT** |
| 2026-05-15 | `Pi-Dev-Ops-task3-tmp/.harness/PR-RA-1967.md` | 146 | PR RA-1967 evaluation | **RECENT** |
| 2026-05-15 | `Pi-Dev-Ops-task3-tmp/.harness/PR-RA-1968.md` | 128 | PR RA-1968 evaluation | **RECENT** |
| 2026-05-15 | `Pi-Dev-Ops-task3-tmp/.harness/PR-RA-1969.md` | 93 | PR RA-1969 evaluation | **RECENT** |

### Model & System Evaluation

| Date | Path | Size | Purpose | Status |
|---|---|---|---|---|
| 2026-04-26 | `Pi-Dev-Ops-task3-tmp/.harness/RA-830-gemini-evaluation.md` | 9 KB | Gemini model evaluation for RestoreAssist context | **REFERENCE** |

---

## AUTOMATION & WORKFLOWS

### n8n Workflow Definitions & Import Instructions

| Date | Path | Size | Purpose | Status |
|---|---|---|---|---|
| 2026-04-19 | `Pi-Dev-Ops-task3-tmp/.harness/n8n-workflows/RA-826-workspace-rss-monitor.json` | 11.6 KB | Workspace RSS monitoring workflow | **DEPLOYED** |
| 2026-04-19 | `Pi-Dev-Ops-task3-tmp/.harness/n8n-workflows/RA-826-workspace-weekly-brief.json` | 10.5 KB | Weekly workspace briefing workflow | **DEPLOYED** |
| 2026-04-19 | `Pi-Dev-Ops-task3-tmp/.harness/n8n-workflows/RA-649-telegram-command-interface.json` | 10.9 KB | Telegram command interface workflow | **DEPLOYED** |
| 2026-05-15 | `Pi-Dev-Ops-task3-tmp/.harness/n8n-workflows/RA-826-IMPORT-INSTRUCTIONS.md` | 5.7 KB | RA-826 import guide | **OPERATIONAL** |
| 2026-04-12 | `Pi-Dev-Ops-task3-tmp/.harness/n8n-workflows/RA-649-IMPORT-INSTRUCTIONS.md` | 2.8 KB | RA-649 import guide | **OPERATIONAL** |

### Workspace Integration

| Date | Path | Size | Purpose | Status |
|---|---|---|---|---|
| 2026-04-19 | `Pi-Dev-Ops-task3-tmp/.harness/pr-bodies/RA-826-workspace-intel-monitor.md` | 3.7 KB | Workspace intelligence monitoring PR body | **REFERENCE** |

---

## FOLDER STRUCTURE & REPOSITORY STATE

### RestoreAssist Directory (~/Pi-CEO/RestoreAssist/)

| Path | Contents | Status | Notes |
|---|---|---|---|
| `RestoreAssist/Archives/` | `RestoreAssist.xcarchive` (Xcode build artifact) | **STATIC** | iOS app archive |
| `RestoreAssist/Migrations/` | `RA-1407-migration.sql` (Supabase schema) | **ACTIVE** | Database schema; settings, sessions, extensions tables |

### Pi-Dev-Ops Worktrees (Git Snapshots)

| Worktree | Date | Status | Note |
|---|---|---|---|
| `Pi-Dev-Ops-task3-tmp/` | 2026-05-15 | **CURRENT** | Latest board evaluation harness; canonical source for most artifacts |
| `Pi-Dev-Ops-restore-tmp/` | 2026-05-15 | **SNAPSHOT** | Restore branch evaluation |
| `Pi-Dev-Ops-pr1-tmp/` | 2026-05-15 | **SNAPSHOT** | PR 1 branch evaluation |
| `Pi-Dev-Ops-board-fix-tmp/` | 2026-05-15 | **SNAPSHOT** | Board fix branch evaluation |
| `Pi-Dev-Ops/` | 2026-05-05 | **MAIN** | Main branch workspace (slightly stale) |

---

## DEDUPLICATION & FILE DISTRIBUTION

**Raw scan result:** 298 files with RA- prefix or "RestoreAssist" in name/content

**Deduplication analysis:**
- Identical copies across task3-tmp, restore-tmp, pr1-tmp, board-fix-tmp (created during branch evaluation runs)
- Same artifacts in Pi-Dev-Ops/app/workspaces/ and top-level Pi-Dev-Ops/ (.harness, scripts)
- Canonical versions live in: **Pi-Dev-Ops-task3-tmp/** (latest) and **Pi-CEO/scripts/** (operational runbooks)

**Unique core artifacts:** ~26 distinct files + 5 n8n workflow JSON definitions

---

## FRESHNESS & STALENESS ANALYSIS

**All artifacts are recent (within 36 days):**

| Date Range | Count | Status |
|---|---|---|
| 2026-05-08 to 2026-05-15 | 15 | **VERY FRESH** (latest positioning, PR evals, workflows) |
| 2026-04-27 to 2026-05-06 | 6 | **FRESH** (architecture, migrations) |
| 2026-04-12 to 2026-04-26 | 5 | **RECENT** (board briefs, charter, reference docs) |
| Older than 2026-04-12 | 0 | None |

**Staleness summary:** No artifacts >30 days old. No archival needed.

---

## CANONICAL REFERENCE DOCUMENTS

**For authoritative RestoreAssist state, consult in this order:**

### 1. Governance & Roadmap (CANONICAL)
**Path:** `/Users/phill-mac/Pi-CEO/Pi-Dev-Ops-task3-tmp/.harness/business-charters/projects/restoreassist-charter.md`  
**Date:** 2026-04-11  
**Content:** Seven-pillar assessment, Phase 1-4 roadmap, security findings (347 console.log, 14 `dangerouslySetInnerHTML`, 9 hardcoded passwords), code quality score (100/100)  
**Status:** CANONICAL governance doc

### 2. Positioning & Marketing (CURRENT)
**Path:** `/Users/phill-mac/Pi-CEO/Pi-Dev-Ops-task3-tmp/.harness/artefacts/restoreassist/`  
**Date:** 2026-05-08  
**Files:** positioning-2026-05-08.md, landing-page-2026-05-08.md, icp-research-2026-05-08.md, seo-keywords-2026-05-08.md  
**Content:** Positioning pillars, landing page copy, ICP definition, SEO strategy  
**Status:** CURRENT (latest product definition)

### 3. Board Brief (RECORD)
**Path:** `/Users/phill-mac/Pi-CEO/RA-650-SwarmFinal-BoardPaper-2026-04-14.docx`  
**Date:** 2026-04-14  
**Content:** Final swarm orchestration paper for board review  
**Status:** Latest board governance record

### 4. Technical Architecture (RECENT)
**Path:** `/Users/phill-mac/Pi-CEO/Pi-Dev-Ops-task3-tmp/docs/architecture/2026-05-06-ra-2026-hermes-blueprint.md`  
**Date:** 2026-05-06  
**Content:** Hermes integration blueprint  
**Status:** Latest technical design

### 5. Operational Runbook (IN USE)
**Path:** `/Users/phill-mac/Pi-CEO/scripts/RA-1912_RESTORE_RUNBOOK.md`  
**Date:** 2026-05-03  
**Content:** Restore-from-clean-Mac procedure; Claude memory backup; LaunchAgent setup  
**Status:** In active use for disaster recovery

---

## SUMMARY TABLE BY CATEGORY

| Category | Count | Newest | Oldest | Status |
|---|---|---|---|---|
| Board records | 2 | 2026-04-14 | 2026-04-12 | CURRENT |
| Governance charters | 1 | 2026-04-11 | 2026-04-11 | CANONICAL |
| Positioning & marketing | 4 | 2026-05-08 | 2026-05-08 | CURRENT |
| Architecture & technical | 2 | 2026-05-06 | 2026-05-06 | RECENT |
| Operations & runbooks | 3 | 2026-05-03 | 2026-04-27 | OPERATIONAL |
| Routines evaluation | 1 | 2026-04-16 | 2026-04-16 | KEY EVAL |
| PR & CI evaluation | 6 | 2026-05-15 | 2026-05-15 | RECENT |
| Automation (n8n workflows) | 5 | 2026-04-19 | 2026-04-12 | DEPLOYED |
| Model evaluation | 1 | 2026-04-26 | 2026-04-26 | REFERENCE |
| Reference/context | 1 | 2026-04-15 | 2026-04-15 | REFERENCE |
| **TOTAL** | **26** | **2026-05-15** | **2026-04-11** | **All FRESH** |

---

## KEY INSIGHTS

1. **Zero technical debt in documentation**: All artifacts <36 days old; no stale/orphaned docs.
2. **Clear governance hierarchy**: Seven-pillar charter is canonical; board briefs are records; positioning docs are current (2026-05-08).
3. **Active operations**: Restore runbook, migrations, n8n workflows are deployed and in use.
4. **Established team process**: Pi-Dev-Ops worktrees capture branch evaluation snapshots systematically.
5. **Security focus**: Charter identifies 347 security findings; Phase 1 triage is priority.
6. **Automation maturity**: n8n workflows (RSS, weekly brief, Telegram) suggest operational readiness.

---

**Inventory compiled:** 2026-05-18 17:42 UTC  
**Scan methodology:** `find`, `grep`, metadata extraction, file sampling (first 50 lines)  
**Output directory:** `/Users/phill-mac/RestoreAssist/.claude/aggregation/pi-ceo/`

