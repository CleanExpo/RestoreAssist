# Hermes Inventory — RestoreAssist References

**Scan Date:** 2026-05-18  
**Scope:** ~/.hermes, ~/hermes-workspace, ~/hermes-mac-mini, ~/Library/LaunchAgents  
**Total RA-related items found:** 16

---

## 1. SCHEDULED ROUTINES / CRON JOBS

Location: `~/.hermes/cron/jobs.json`

### Active RestoreAssist Routines (Status: Enabled)

| ID | Name | Schedule (UTC) | Schedule Display | Last Run | Status | Delivery |
|---|---|---|---|---|---|---|
| `54dd6b074984` | RestoreAssist Wiki Enhancement Scan | 30 7 * * * | 7:30am AEST daily | None (pending) | scheduled | Telegram |
| `8e31b8cd9fdc` | RestoreAssist Overnight Run Status (Hermes-resilient) | 45 7 * * * | 7:45am AEST daily | None (pending) | scheduled | Telegram |

### Portfolio/Briefing Routines (RA-adjacent, portfolio-wide)

| ID | Name | Schedule (UTC) | Schedule Display | Last Run | Status | Delivery |
|---|---|---|---|---|---|---|
| `e27b7d7b60f7` | Pi-CEO Daily Briefing — Data Collector (6am) | 0 20 * * * | 8pm UTC / 6am AEST | 2026-05-12T20:01 | ok | origin |
| `e06a95deac75` | Pi-CEO Daily Briefing — NotebookLM Video (7am) | 0 7 * * * | 7am AEST daily | 2026-05-12T07:00 | ok | Telegram: 8792816988 |
| `087896dda594` | Margot Week-in-Review | 0 16 * * 5 | Friday 4pm UTC | 2026-05-10T17:10 | ok | Telegram |
| `2ae76aab4dbf` | Margot Quarterly SWOT | 0 9 1-7 1,4,7,10 1 | 1st Monday of Q (Jan/Apr/Jul/Oct) | 2026-05-10T17:11 | ok | Telegram |
| `6abb5b24213a` | Margot Week-Ahead + Swarm Telemetry | 0 8 * * 1 | Monday 8am AEST | 2026-05-11T08:00 | ok | Telegram |
| `enqueue-portfolio-scan-requests-daily` | Enqueue Portfolio scan_requests — Daily 04:30 AEST | 30 18 * * * | 4:30am AEST (UTC 18:30) | Never | unknown | N/A |

### Research Routines (RA-tagged, corpus-grounded)

| ID | Name | Schedule | Last Run | Status |
|---|---|---|---|---|
| `f079fd73793d` | Daily Research: M&A + Acquisition Intelligence | 0 5 * * * (5am UTC) | 2026-05-13T05:00 | ok |
| `79f637ae79ef` | Daily Research: AI + Tech News Brief | 0 4 * * * (4am UTC) | 2026-05-13T04:00 | ok |
| `3e781b6fa4dd` | Daily Research: SEO + AEO + GEO Intelligence | 0 3 * * * (3am UTC) | 2026-05-13T03:00 | ok |
| `94228a8ce89f` | Weekly Research: Marketing + Branding | 0 6 * * 2 (Tuesday 6am UTC) | 2026-05-12T06:01 | ok |
| `a9c064dd5447` | Weekly Research: Economics + ANZ Business Climate | 0 6 * * 3 (Wednesday 6am UTC) | 2026-05-13T06:01 | ok |
| `e105d4bc1229` | Weekly Research: Entrepreneurship + Leadership | 0 6 * * 4 (Thursday 6am UTC) | 2026-05-10T17:10 | ok |
| `9443270aa2fc` | Weekly Research: SaaS Metrics + Accountancy | 0 6 * * 5 (Friday 6am UTC) | 2026-05-10T17:10 | ok |
| `bf1ea13a98dd` | Weekly Research: Psychology + Persuasion + Customer Behaviour | 0 6 * * 6 (Saturday 6am UTC) | 2026-05-10T17:10 | ok |
| `competitive-intel-research` | Competitive Intel — Weekly Deep Research (Monday) | 0 20 * * 0 (Sunday 8pm UTC / Monday 6am AEST) | 2026-05-12T06:01 | ok |

### Broken / Stale / Pending Routines

| ID | Name | Schedule | Status | Issue |
|---|---|---|---|---|
| `restoreassist-appstore-monitor` | RestoreAssist — App Store Monitor (Daily) | 0 21 * * * (9pm UTC) | **BROKEN** | No enabled/state fields; never run; incomplete job definition |

**Summary:** 2 RA-specific routines exist (Wiki scan, Overnight run status) but both show `None` for last_run_at — **these appear pending or have not executed yet despite being scheduled and enabled**. The App Store Monitor is malformed and broken.

---

## 2. LAUNCH AGENTS / SYSTEM SERVICES

Location: `~/Library/LaunchAgents/`

### Active Launch Agent

**File:** `com.piceo.healthcheck.plist`  
**Purpose:** Pi-CEO health check probe + auto-restart (probes Ollama, n8n, FastAPI; restarts on failure)  
**RA Reference:** Lines 9-10 reference `RA-640` (initial) and `RA-3753` (Pi-CEO API probe + auto-restart added 2026-05-12)  
**Schedule:** Every 5 minutes (StartInterval: 300)  
**Status:** Active (RunAtLoad: true)  
**Secrets:** Loaded from `~/.config/piceo/healthcheck.env` at runtime (never committed)  
**Log path:** `/Users/phill-mac/pi-ceo/logs/healthcheck_launchd.log`

---

## 3. SWARM CREW CONFIGS / AUTONOMOUS OPERATIONS

**Scope searched:** ~/hermes-workspace/swarm*.yaml, crew/ directories, mission configs

**Result:** No RA-specific swarm crew configs found.  
**Note:** swarm.yaml exists at `~/hermes-workspace/swarm.yaml` but contains no RestoreAssist references.  
**Implication:** RA is not currently part of Hermes' autonomous swarm orchestration layer.

---

## 4. PLUGINS & INTEGRATIONS

Location: `~/.hermes/plugins/`

### Unite-Group Portfolio Plugin

**File:** `~/.hermes/plugins/unite-group/plugin.yaml`  
**Purpose:** Native portfolio health integration (4 tools: portfolio_health, ccw_kpis, wave_status, 6pager_summary)  
**RA-relevant:** RestoreAssist is listed in the portfolio alongside NRPG, Synthex, CARSI, CCW, ATO-App (~/hermes/config.yaml, line 404)  
**Env vars required:** SUPABASE_UNITE_GROUP_URL, SUPABASE_UNITE_GROUP_SERVICE_KEY  
**Status:** Active

---

## 5. BUSINESS CHARTER & STRATEGY DOCUMENTS

Location: `~/.hermes/business-charters/`

### RestoreAssist Business Charter

**File:** `restoreassist.md`  
**Version:** v1 — 2026-05-06  
**Linear Team ID:** `a8a52f07-63cf-4ece-9ad2-3e3bd3c15673`  
**Linear Project ID:** `3c78358a-b558-4029-b47d-367a65beea7b`

**Key Strategy Points:**
- Authority position in Australian restoration training (12-month goal)
- CCW (Carpet Cleaners Warehouse) is marquee customer / proof point
- Compliance-first positioning (IICRC / NSW EPA / WHS audit-trail story)
- 70%+ gross margin target on SaaS tier
- North-Star metrics: certified technician count, compliance audit pass rate (≥95%), time-to-competence delta (≥40% reduction), revenue per certified tech

**Watch-list:** 8 standing Perplexity queries (IICRC updates, WHS enforcement, competitor launches, SaaS pricing benchmarks, AI training adoption, insurance scope updates)

**Out of scope:** Pricing, hiring, Pi-CEO standard changes, replacing IICRC as standards body

---

## 6. CONFIGURATION & SYSTEM REFERENCES

Location: `~/.hermes/config.yaml` and `SOUL.md`

### In config.yaml

- Line 378: Routing rule for voice messages (RA-1886)
- Line 392: Real-time data support (RA-1903)
- Line 404: Portfolio list includes "RestoreAssist, Disaster Recovery|NRPG, Synthex, CARSI, Unite-Group CRM"

### In SOUL.md

- Line 123: Portfolio table lists "RestoreAssist | iOS live, App Store | Post-launch retention, paid tiers"

---

## 7. OTHER REFERENCES & SCRIPTS

### Hermes History Log

**File:** `~/.hermes/.hermes_history`  
**Contains:** 8+ goals and requests mentioning RestoreAssist, including:
- `/goal` directive to move RA to full production on App Store with paying customers (all features 100% green, fully tested)
- Portfolio assessment showing 50/100 health rating from Margot/Pi-CEO (explanation pending)
- Goal to test all functions, features, UI/UX flow for paying customer readiness

---

## HEALTH & STATUS ASSESSMENT

### Green (Healthy)

- **Daily briefing pipeline:** Active (Pi-CEO Daily Briefing collectors + video gen running 2026-05-13, delivering to Telegram)
- **Portfolio health monitoring:** Integrated into Margot briefing chain (portfolio_health tool active)
- **Research routines:** All 9 research jobs enabled and running (last exec 2026-05-13)
- **Launch agent:** Pi-CEO health probe running every 5 minutes, referenced RA tickets up to date

### Yellow (Pending / Untested)

- **Wiki Enhancement Scan (54dd6b074984):** Enabled, scheduled 7:30am daily, but last_run_at shows None — **has never executed or last exec not logged**
- **Overnight Run Status (8e31b8cd9fdc):** Enabled, scheduled 7:45am daily, but last_run_at shows None — **similar pending state**
- **Portfolio scan_requests (enqueue-portfolio-scan-requests-daily):** State unknown, last run never — **appears broken or not yet wired**

### Red (Broken / Stale)

- **App Store Monitor (restoreassist-appstore-monitor):** Job definition incomplete (missing enabled/state fields), never executed, marked as broken — **needs remediation or deletion**

---

## MASTER MANIFEST / INDEX

**No master Hermes manifest file found** that consolidates RA references. Nearest equivalent:

1. **~/.hermes/config.yaml** — Margot routing + portfolio list (RA in business portfolio)
2. **~/.hermes/SOUL.md** — Portfolio table with RA status
3. **~/.hermes/business-charters/restoreassist.md** — RA-specific charter (strategy, metrics, watch-list)
4. **~/.hermes/cron/jobs.json** — All routines (13 RA-tagged jobs)

---

## RECOMMENDATIONS

1. **Investigate stale wiki/overnight routines:** Why do 54dd6b074984 and 8e31b8cd9fdc show None for last_run? Check Hermes logs or re-enable if broken.

2. **Fix App Store Monitor:** Either complete the job definition (add enabled/state/schedule fields) or delete it.

3. **Review portfolio_scan_requests:** Status is unknown; confirm if this should be active or if it's obsolete.

4. **Confirm RA health ratings:** Hermes history logs show 50/100 rating from Margot — determine if this is stale or if there are blocking issues.

5. **Swarm integration:** Consider whether RA should be part of Hermes' autonomous swarm ops or remain briefing-only for now.

---

**End of inventory.**
