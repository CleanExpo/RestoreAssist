# Ship Chain — Educational Series

> **KARPATHY-10** · nn-zero-to-hero style · Sprint 9–11
>
> Read these documents in order. Each one is self-contained and ends with a pointer to the next.
> By the end you will understand every stage of the Pi-CEO ship chain from brief to deployment.

---

## What Is the Ship Chain?

The ship chain is the automated pipeline that turns a one-sentence brief into a shipped pull request.
It has five stages: **classify → plan → build → evaluate → route**.

A new engineer can submit a brief at 9 am and have a reviewed, passing PR by lunchtime — without writing a single line of code manually.

---

## Series Map

| #   | Document                                                 | What you will learn                                             |
| --- | -------------------------------------------------------- | --------------------------------------------------------------- |
| 01  | [The Algorithm](./01-the-algorithm.md)                   | The five pure functions that make up the pipeline               |
| 02  | [Intent Classification](./02-intent-classification.md)   | How PITER classifies briefs and picks complexity tiers          |
| 03  | [The Evaluator](./03-the-evaluator.md)                   | Confidence-weighted scoring and the three-tier routing decision |
| 04  | [Karpathy Optimisations](./04-karpathy-optimisations.md) | Sprint 9–11 enhancements with source file references            |
| 05  | [Running the System](./05-running-the-system.md)         | Local setup, env vars, first build, and smoke test              |

---

## Reference Files

These are the production files the series references. Open them alongside the docs.

| File                                         | Purpose                                               |
| -------------------------------------------- | ----------------------------------------------------- |
| `.harness/config.yaml`                       | Gate-check thresholds and per-project overrides       |
| `.harness/templates/basic-brief.yaml`        | Minimal 3-field brief (PITER fills the rest)          |
| `.harness/templates/detailed-brief.yaml`     | 6-field brief with acceptance criteria                |
| `.harness/templates/advanced-brief.yaml`     | Full spec — eval threshold, budget, target files      |
| `.harness/intent/ENGINEERING_CONSTRAINTS.md` | Hard constraints injected into every build            |
| `.harness/intent/RESEARCH_INTENT.md`         | Cycle-level research direction                        |
| `lib/harness/gate-check.ts`                  | Evaluator — 5 dimensions, scoring, decision, Telegram |
| `app/api/harness/gate-check/route.ts`        | POST /api/harness/gate-check                          |
| `app/api/harness/brief-templates/route.ts`   | GET /api/harness/brief-templates                      |

---

## Prerequisites

- You have read `CLAUDE.md` at the repo root.
- You can run `pnpm dev` and reach `localhost:3000`.
- You have a basic understanding of Next.js App Router and Prisma.

---

→ Start with **[01 — The Algorithm](./01-the-algorithm.md)**
