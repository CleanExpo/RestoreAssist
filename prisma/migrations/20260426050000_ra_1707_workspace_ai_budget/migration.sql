-- RA-1707 / P0-2 — Workspace AI daily budget cap.
-- Null falls back to AI_DEFAULT_DAILY_BUDGET_USD env in lib/ai/budget-guard.ts.

ALTER TABLE "Workspace"
    ADD COLUMN "aiDailyBudgetUsd" DOUBLE PRECISION;
