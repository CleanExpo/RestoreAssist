# 04 — Karpathy Optimisations

> **Series:** [Ship Chain](./00-index.md) · Document 4 of 5

Sprint 9–11 added nine enhancements to the ship chain.
Each is listed with its Linear issue, the source file it lives in, and what problem it solved.

---

## Sprint 9 — Foundation (KARPATHY-1 through KARPATHY-5)

### KARPATHY-1 · Confidence-Weighted Gate Check (RA-674)

**Problem:** The pipeline either shipped or didn't. There was no graduated response — a 75/100 output triggered the same re-run as a 20/100 output.

**Solution:** Three-tier routing (AUTO_SHIP / FLAG / RETRY) with independent quality and confidence axes.

**Source:** `lib/harness/gate-check.ts`

The key insight is the two-axis decision space. Confidence is orthogonal to quality:
a high-quality score with low confidence (Haiku wasn't sure) routes to FLAG, not AUTO_SHIP.
This catches outputs where the model produced plausible-sounding but uncertain text.

---

### KARPATHY-2 · Lesson Injection on Retry (implicit in RA-674)

**Problem:** Retries re-ran the same prompt and got the same result.

**Solution:** On RETRY, extract the lowest-scoring dimension's `reason` and prepend it to the build prompt as an explicit correction instruction.

**Source:** `lib/harness/gate-check.ts` — `DimensionResult.reason` field

Example lesson: _"compliance: IICRC reference missing edition number — use 'IICRC S500:2025 §7.1' format"_

---

### KARPATHY-3 · Per-Project Threshold Overrides (RA-674)

**Problem:** A single global threshold doesn't fit every task type. Evidence classification is creative and can tolerate lower confidence. Scope-of-works quality must be stricter for compliance reasons.

**Solution:** Per-project threshold blocks in `.harness/config.yaml`, merged with defaults at runtime.

**Source:** `.harness/config.yaml` → `lib/harness/gate-check.ts` — `getThresholds()`

---

### KARPATHY-4 · Telegram Alerting (RA-674)

**Problem:** FLAG decisions were invisible. Engineers had to poll the DB to know if a build needed attention.

**Solution:** Telegram alert fires for every FLAG and RETRY, with quality/confidence scores and the DB record ID for lookup.

**Source:** `lib/harness/gate-check.ts` — `sendTelegramAlert()`

Requires: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` in env. Silent no-op if not set.

---

### KARPATHY-5 · Engineering Constraints Injection (RA-678)

**Problem:** Individual engineers had to remember to include auth rules, IICRC citation formats, and GST constraints in every brief. Briefs were inconsistent.

**Solution:** `.harness/intent/ENGINEERING_CONSTRAINTS.md` is injected into every build prompt automatically. No brief field needed.

**Source:** `.harness/intent/ENGINEERING_CONSTRAINTS.md`

---

## Sprint 10 — Briefs (KARPATHY-6 through KARPATHY-8)

### KARPATHY-6 · Research Intent File (RA-678)

**Problem:** The build phase had no awareness of the current sprint's research direction. It would solve problems the same way every time, ignoring active investigations.

**Solution:** `.harness/intent/RESEARCH_INTENT.md` declares the cycle's primary research direction, open questions, and deferred topics. Injected alongside constraints.

**Source:** `.harness/intent/RESEARCH_INTENT.md`

---

### KARPATHY-7 · Harness Config YAML (RA-674)

**Problem:** Thresholds were hardcoded in `lib/harness/gate-check.ts` as TypeScript constants. Changing them required a code deployment.

**Solution:** Move thresholds to `.harness/config.yaml`. The TypeScript file mirrors these as defaults but the YAML is the source of truth for per-project overrides.

**Source:** `.harness/config.yaml`

---

### KARPATHY-8 · Progressive Brief Templates (RA-681)

**Problem:** New engineers either over-specified (filling in fields they didn't understand) or under-specified (leaving out acceptance criteria). Both produced poor builds.

**Solution:** Three-tier progressive disclosure. BasicBrief for quick tasks, DetailedBrief when you know the acceptance criteria, AdvancedBrief when you need pipeline control.

**Source:** `.harness/templates/basic-brief.yaml`, `detailed-brief.yaml`, `advanced-brief.yaml`
**API:** `GET /api/harness/brief-templates` (returns all three schemas)
**API:** `GET /api/harness/brief-templates?tier=basic`

---

## Sprint 11 — Educational Layer (KARPATHY-9 through KARPATHY-10)

### KARPATHY-9 · Gate Check API (RA-681, RA-674)

**Problem:** The evaluator was a library function. There was no way to call it from external tools, dashboards, or the Pi-CEO pipeline runner without importing the module directly.

**Solution:** `POST /api/harness/gate-check` — auth-gated, subscription-checked, returns structured `GateCheckResult`.

**Source:** `app/api/harness/gate-check/route.ts`

---

### KARPATHY-10 · This Document Series (RA-683)

**Problem:** The ship chain existed only in code and Linear issues. A new engineer joining the team had no way to understand the system without reading ~500 lines of TypeScript and a dozen Linear tickets.

**Solution:** Five self-contained documents in `docs/ship-chain/`, written in the Karpathy nn-zero-to-hero style: build understanding from first principles, reference actual production files, end each doc with a pointer to the next.

**Source:** `docs/ship-chain/`

---

→ Next: **[05 — Running the System](./05-running-the-system.md)**
