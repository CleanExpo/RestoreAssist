-- RA-7493: the AI runtime's data layer — five tables, four enums, nothing else.
--
-- Phase 0 of the six-runner AI runtime. Data only: no runner exists yet, and no
-- runner will run for a workspace without an AiRunnerFlag row saying so.
--
-- WHAT IT ADDS
--   AiRunnerFlag     per-(workspace, runner) operational switch + kill-switch.
--                    NO ROW MEANS OFF, so nothing turns on by accident and no
--                    backfill is needed.
--   AiRunnerBudget   ceiling per window, COUNTING DOWN. Money is BIGINT micro-USD,
--                    never a float, because a ceiling has to refuse exactly at a
--                    boundary. It stores what is LEFT, not what is spent, so the
--                    atomic guard is `remaining >= cost` and needs no prior read
--                    (review round 1, P0: Prisma's updateMany cannot compare two
--                    columns, so a `spent <= max - cost` guard was read-then-write).
--   AiRunnerReceipt  append-only, one row per attempted runner call, carrying
--                    which key paid (keySource) so the published BYOK promise
--                    becomes queryable instead of asserted.
--   AiJobSuggestion  the Job Copilot's queue: a proposal on a job record plus
--                    the human's accept/dismiss verdict.
--   AiStyleProfile   per-tenant writing profile, opt-in, logically deletable.
--
-- ADDITIVE, AND THAT IS CHECKED, NOT ASSERTED
--   Every statement below is CREATE TYPE, CREATE TABLE, CREATE INDEX or
--   ADD CONSTRAINT against an object this migration itself creates. Not one
--   line alters, renames, retypes or drops anything that existed before it.
--   `bash scripts/ci/migration-roundtrip.sh additive-only` fails the build if
--   that ever stops being true.
--
--   The SQL was generated with
--     prisma migrate diff --from-schema <schema.prisma at the merge base>
--                         --to-schema   prisma/schema.prisma --script
--   deliberately NOT from the live migration history. Diffing from the history
--   drags in ~143 statements of PRE-EXISTING divergence between this repo's
--   migrations and its schema.prisma (timestamp precision, dropped defaults,
--   index names) which is real, is not this branch's, and must not be smuggled
--   into an unrelated migration. See the RA-7493 scoreboard for the detail.
--
-- REVERSIBLE
--   down.sql in this directory drops exactly what this file creates, in
--   dependency order, and `migration-roundtrip.sh rollback` proves the objects
--   are gone afterwards — with a positive control first, so "zero remaining"
--   cannot be a query looking in the wrong place.

-- CreateEnum
CREATE TYPE "AiRunner" AS ENUM ('GOVERNOR', 'INGESTION', 'FIELD', 'JOB_COPILOT', 'STYLE', 'SELF_HEAL');

-- CreateEnum
-- What ONE budget row caps. A SEPARATE enum from AiRunner on purpose: a budget
-- needs a workspace-wide scope and needs it NOT NULL (Postgres treats NULLs as
-- distinct, so a nullable scope permits two workspace-wide budgets per period),
-- but adding WORKSPACE to AiRunner made that value legal on every table AiRunner
-- touches -- a flag for a runner that does not exist, a receipt attributed to no
-- runner. Review round 2, P1. The drift risk of a parallel list is covered by a
-- test that asserts AiBudgetScope == AiRunner + WORKSPACE.
CREATE TYPE "AiBudgetScope" AS ENUM ('WORKSPACE', 'GOVERNOR', 'INGESTION', 'FIELD', 'JOB_COPILOT', 'STYLE', 'SELF_HEAL');

-- CreateEnum
CREATE TYPE "AiKeySource" AS ENUM ('TENANT_BYOK', 'PLATFORM', 'NONE');

-- CreateEnum
CREATE TYPE "AiReceiptOutcome" AS ENUM ('PENDING', 'OK', 'REFUSED_NO_KEY', 'REFUSED_BUDGET', 'REFUSED_FLAG_OFF', 'FAILED');

-- CreateEnum
CREATE TYPE "AiSuggestionState" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "AiRunnerFlag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runner" "AiRunner" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "killedAt" TIMESTAMP(3),
    "killedReason" TEXT,
    "enabledByUserId" TEXT,
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRunnerFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRunnerBudget" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" "AiBudgetScope" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "maxMicroUsd" BIGINT NOT NULL,
    "remainingMicroUsd" BIGINT NOT NULL,
    "maxTokens" BIGINT,
    "remainingTokens" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRunnerBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRunnerReceipt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "runner" "AiRunner" NOT NULL,
    "taskType" TEXT NOT NULL,
    "provider" "AiProvider",
    "model" TEXT,
    "keySource" "AiKeySource" NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "outcome" "AiReceiptOutcome" NOT NULL DEFAULT 'PENDING',
    "errorType" TEXT,
    "provenance" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AiRunnerReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJobSuggestion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "runner" "AiRunner" NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "grounding" JSONB,
    "state" "AiSuggestionState" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "receiptId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiJobSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiStyleProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "sourceDocumentCount" INTEGER NOT NULL DEFAULT 0,
    "lastBuiltAt" TIMESTAMP(3),
    "consentedAt" TIMESTAMP(3),
    "consentedByUserId" TEXT,
    "exportedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiStyleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRunnerFlag_workspaceId_idx" ON "AiRunnerFlag"("workspaceId");

-- CreateIndex
CREATE INDEX "AiRunnerFlag_runner_enabled_idx" ON "AiRunnerFlag"("runner", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AiRunnerFlag_workspaceId_runner_key" ON "AiRunnerFlag"("workspaceId", "runner");

-- CreateIndex
CREATE INDEX "AiRunnerBudget_workspaceId_periodEnd_idx" ON "AiRunnerBudget"("workspaceId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AiRunnerBudget_workspaceId_scope_periodStart_key" ON "AiRunnerBudget"("workspaceId", "scope", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AiRunnerReceipt_supersedesId_key" ON "AiRunnerReceipt"("supersedesId");

-- CreateIndex
CREATE INDEX "AiRunnerReceipt_workspaceId_createdAt_idx" ON "AiRunnerReceipt"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRunnerReceipt_inspectionId_createdAt_idx" ON "AiRunnerReceipt"("inspectionId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRunnerReceipt_runner_outcome_idx" ON "AiRunnerReceipt"("runner", "outcome");

-- CreateIndex
CREATE INDEX "AiRunnerReceipt_workspaceId_keySource_idx" ON "AiRunnerReceipt"("workspaceId", "keySource");

-- CreateIndex
CREATE UNIQUE INDEX "AiRunnerReceipt_workspaceId_idempotencyKey_key" ON "AiRunnerReceipt"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AiJobSuggestion_workspaceId_state_idx" ON "AiJobSuggestion"("workspaceId", "state");

-- CreateIndex
CREATE INDEX "AiJobSuggestion_inspectionId_state_createdAt_idx" ON "AiJobSuggestion"("inspectionId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "AiJobSuggestion_runner_state_idx" ON "AiJobSuggestion"("runner", "state");

-- CreateIndex
CREATE UNIQUE INDEX "AiStyleProfile_workspaceId_key" ON "AiStyleProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "AiStyleProfile_deletedAt_idx" ON "AiStyleProfile"("deletedAt");

-- AddForeignKey
ALTER TABLE "AiRunnerFlag" ADD CONSTRAINT "AiRunnerFlag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunnerBudget" ADD CONSTRAINT "AiRunnerBudget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunnerReceipt" ADD CONSTRAINT "AiRunnerReceipt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunnerReceipt" ADD CONSTRAINT "AiRunnerReceipt_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunnerReceipt" ADD CONSTRAINT "AiRunnerReceipt_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "AiRunnerReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJobSuggestion" ADD CONSTRAINT "AiJobSuggestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJobSuggestion" ADD CONSTRAINT "AiJobSuggestion_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJobSuggestion" ADD CONSTRAINT "AiJobSuggestion_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "AiRunnerReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiStyleProfile" ADD CONSTRAINT "AiStyleProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariants the DATABASE holds, because the application guard is not enough.
--
-- The spend guard is `updateMany({ where: { remainingMicroUsd: { gte: cost } },
-- data: { remainingMicroUsd: { decrement: cost } } })`. Review round 2 found the
-- P0 in it: `decrement` accepts a NEGATIVE number, and a negative cost passes
-- its own guard trivially (`remaining >= -50`) and then ADDS to the balance.
--
-- `remaining >= 0` alone does NOT close that -- an inflated balance is still
-- >= 0. It takes the upper bound to stop it, which is why both are here.
-- Together they pin `0 <= remaining <= max` no matter what arithmetic a future
-- caller passes in.
-- ---------------------------------------------------------------------------
ALTER TABLE "AiRunnerBudget"
  ADD CONSTRAINT "AiRunnerBudget_remainingMicroUsd_within_max"
  CHECK ("remainingMicroUsd" >= 0 AND "remainingMicroUsd" <= "maxMicroUsd");

-- The token ceiling, same shape. Both columns null means "no token ceiling";
-- one null and one set is the state that would silently disable the ceiling
-- while the row still looked like it had one, so it is refused.
ALTER TABLE "AiRunnerBudget"
  ADD CONSTRAINT "AiRunnerBudget_remainingTokens_within_max"
  CHECK (
    ("maxTokens" IS NULL AND "remainingTokens" IS NULL)
    OR ("maxTokens" IS NOT NULL AND "remainingTokens" IS NOT NULL
        AND "remainingTokens" >= 0 AND "remainingTokens" <= "maxTokens")
  );

-- A granted budget starts full. Without this, a row can be inserted already
-- spent, or (with remaining > 0 and max = 0) inconsistent from birth.
ALTER TABLE "AiRunnerBudget"
  ADD CONSTRAINT "AiRunnerBudget_maxMicroUsd_nonnegative"
  CHECK ("maxMicroUsd" >= 0);

-- ---------------------------------------------------------------------------
-- A budget only ever counts DOWN inside one window.
--
-- The CHECK above pins `0 <= remaining <= max`, and that is NOT enough on its
-- own. A negative cost of -60 against a budget sitting at 40 of 100 leaves 100
-- -- an increase, but still within the ceiling, so every CHECK passes and the
-- spend is quietly refunded. The invariant that actually protects the ceiling
-- is monotonicity, and only a trigger can see the previous value.
--
-- Raising the window's ceiling is a real operation, so it is not forbidden --
-- it is made explicit: move periodStart, which starts a new window and is
-- exactly what a reset does. An in-place increase is refused.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "ai_runner_budget_monotonic"() RETURNS trigger
LANGUAGE plpgsql AS $ai_budget_monotonic$
BEGIN
  -- A reset is a NEW window, and review round 4 (P1) showed that "periodStart
  -- changed" is not the same claim. Shifting it by one microsecond --
  --   SET "periodStart" = "periodStart" + interval '1 us',
  --       "remainingMicroUsd" = "maxMicroUsd"
  -- satisfied the old condition and minted an unlimited series of refills
  -- inside what is, in every sense that matters, the same window.
  --
  -- The new window must START AT OR AFTER the old one ENDED, and must be a
  -- window at all. Anything else is an in-place edit wearing a reset's clothes.
  IF NEW."periodStart" >= OLD."periodEnd" AND NEW."periodEnd" > NEW."periodStart" THEN
    RETURN NEW;   -- a genuinely new window; the reset is the point
  END IF;

  -- periodStart moved, but not to a new window. Say so explicitly rather than
  -- letting it fall through to the balance checks, where the error message
  -- would blame the balance for a period problem.
  IF NEW."periodStart" IS DISTINCT FROM OLD."periodStart" THEN
    RAISE EXCEPTION
      'AiRunnerBudget % period may only move forward to a new window (% -> %, previous window ended %)',
      OLD."id", OLD."periodStart", NEW."periodStart", OLD."periodEnd";
  END IF;

  IF NEW."remainingMicroUsd" > OLD."remainingMicroUsd" THEN
    RAISE EXCEPTION
      'AiRunnerBudget % may only count down within a window (% -> %); a negative cost cannot refund a spend, and a ceiling is raised by starting a new period',
      OLD."id", OLD."remainingMicroUsd", NEW."remainingMicroUsd";
  END IF;

  -- The token half, and the NULL transition is the whole point of writing it
  -- this way. Review round 3 (P0) found the obvious form --
  --   IF NEW IS NOT NULL AND OLD IS NOT NULL AND NEW > OLD
  -- reintroduced the refill it was added to stop, one line below the guard:
  -- set the pair to NULL (permitted, NEW is null so the check is skipped), then
  -- set it back to a full balance (permitted, OLD is null so the check is
  -- skipped). Two legal updates, a refilled budget, periodStart untouched.
  --
  -- So within a window the token ceiling's PRESENCE is frozen as well as its
  -- value. Removing it mid-window grants unlimited tokens; adding one grants a
  -- balance that was not there. Both are a raise, and a raise is a new period.
  IF (OLD."remainingTokens" IS NULL) <> (NEW."remainingTokens" IS NULL) THEN
    RAISE EXCEPTION
      'AiRunnerBudget % may not add or remove its token ceiling within a window; start a new period instead',
      OLD."id";
  END IF;

  IF NEW."remainingTokens" IS NOT NULL
     AND OLD."remainingTokens" IS NOT NULL
     AND NEW."remainingTokens" > OLD."remainingTokens" THEN
    RAISE EXCEPTION
      'AiRunnerBudget % token balance may only count down within a window (% -> %)',
      OLD."id", OLD."remainingTokens", NEW."remainingTokens";
  END IF;

  RETURN NEW;
END;
$ai_budget_monotonic$;

CREATE TRIGGER "ai_runner_budget_monotonic"
  BEFORE UPDATE ON "AiRunnerBudget"
  FOR EACH ROW EXECUTE FUNCTION "ai_runner_budget_monotonic"();

-- ---------------------------------------------------------------------------
-- AiRunnerReceipt: the row's STORY is immutable.
--
-- Round 2 asked for append-only to be enforced rather than asserted, and
-- suggested revoking UPDATE. That would break the design: a receipt is written
-- PENDING before the provider is called and resolved after, which needs exactly
-- one update. So the trigger permits that ONE transition and freezes the rest.
--
-- Permitted: PENDING -> a terminal outcome, touching only the facts that are
-- genuinely unknowable until the call returns. Everything that makes the row a
-- receipt -- who it belongs to, which runner, whose key paid, what it was
-- grounded in -- is frozen at insert. A different story needs a NEW row
-- pointing at this one through supersedesId.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "ai_runner_receipt_freeze"() RETURNS trigger
LANGUAGE plpgsql AS $ai_receipt_freeze$
DECLARE
  frozen_old "AiRunnerReceipt";
  frozen_new "AiRunnerReceipt";
BEGIN
  -- The ONE update this function must let through that is not a resolution:
  -- Postgres detaching the row from a deleted Inspection.
  --
  -- `inspectionId` is ON DELETE SET NULL (review round 9, P0 -- a cascade there
  -- would delete a ledger row while its workspace still exists). SET NULL is
  -- implemented as an UPDATE on the child, so it arrives here, and every check
  -- below would refuse it: a resolved receipt fails the PENDING test, and a
  -- pending one fails the frozen-column comparison because inspectionId moved.
  -- Without this the whole feature is simply "inspections can no longer be
  -- deleted", which is a guard breaking the product rather than protecting it.
  --
  -- Kept as narrow as it can be: only from inside another trigger (the RI
  -- machinery, never a plain application UPDATE), only non-null to null, and
  -- only when NOTHING else about the row changed.
  IF pg_trigger_depth() > 1
     AND OLD."inspectionId" IS NOT NULL
     AND NEW."inspectionId" IS NULL THEN
    frozen_old := OLD;
    frozen_new := NEW;
    frozen_old."inspectionId" := NULL;
    frozen_new."inspectionId" := NULL;
    IF frozen_old IS NOT DISTINCT FROM frozen_new THEN
      RETURN NEW;
    END IF;
  END IF;

  IF OLD."outcome" <> 'PENDING' THEN
    RAISE EXCEPTION
      'AiRunnerReceipt % is already resolved (%); receipts are corrected by a new row via supersedesId, never rewritten',
      OLD."id", OLD."outcome";
  END IF;

  IF NEW."outcome" = 'PENDING' THEN
    RAISE EXCEPTION
      'AiRunnerReceipt % update must resolve it to a terminal outcome, not back to PENDING',
      OLD."id";
  END IF;

  -- FAIL CLOSED on columns nobody has thought of yet.
  --
  -- This used to enumerate the FROZEN columns by name, and review round 4 (P1)
  -- was right that it had the polarity backwards: a column added by a later
  -- migration would be absent from the list and therefore silently mutable --
  -- the freeze would quietly stop covering the newest, least-reviewed field on
  -- the table.
  --
  -- So enumerate the PERMITTED columns instead, blank exactly those on a copy
  -- of both rows, and require everything else to be byte-identical. A new
  -- column is frozen the day it is added, with no edit here, which is the only
  -- version of this that stays true.
  frozen_old := OLD;
  frozen_new := NEW;

  frozen_old."outcome"      := NULL; frozen_new."outcome"      := NULL;
  frozen_old."errorType"    := NULL; frozen_new."errorType"    := NULL;
  frozen_old."resolvedAt"   := NULL; frozen_new."resolvedAt"   := NULL;
  frozen_old."latencyMs"    := NULL; frozen_new."latencyMs"    := NULL;
  frozen_old."inputTokens"  := NULL; frozen_new."inputTokens"  := NULL;
  frozen_old."outputTokens" := NULL; frozen_new."outputTokens" := NULL;
  frozen_old."costMicroUsd" := NULL; frozen_new."costMicroUsd" := NULL;

  IF frozen_old IS DISTINCT FROM frozen_new THEN
    RAISE EXCEPTION
      'AiRunnerReceipt % is frozen at insert except for resolution fields (outcome, errorType, resolvedAt, latencyMs, inputTokens, outputTokens, costMicroUsd)',
      OLD."id";
  END IF;

  RETURN NEW;
END;
$ai_receipt_freeze$;

CREATE TRIGGER "ai_runner_receipt_freeze"
  BEFORE UPDATE ON "AiRunnerReceipt"
  FOR EACH ROW EXECUTE FUNCTION "ai_runner_receipt_freeze"();

-- ---------------------------------------------------------------------------
-- DELETE closes the last way round both guards.
--
-- Review rounds 3, 4 and 7 all raised it and the first two deferred it, which
-- is its own kind of finding: a blocker reported three times without progress
-- is not a status update. Both BEFORE UPDATE triggers above are bypassed
-- entirely by DELETE + re-INSERT --
--   * a budget row deleted and reinserted is a budget refilled, with no UPDATE
--     for the monotonic trigger to see;
--   * a receipt deleted is a runner call that never happened, which is the
--     "no invisible AI" promise removed by the one statement nobody guarded.
--
-- The complication, and the reason this is a trigger rather than a revoked
-- grant: both tables cascade from Workspace, and deleting a tenant MUST still
-- take their rows. A blanket refusal would break tenant deletion, and a guard
-- that blocks the real operation is not stricter, it is broken.
--
-- Postgres deletes the parent row before cascading to children, so inside a
-- child's BEFORE DELETE the Workspace row is already gone within the same
-- transaction. That is the discriminator: no workspace means a cascade and is
-- allowed; a live workspace means someone is deleting the row on its own, and
-- is refused.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "ai_runtime_delete_only_with_workspace"() RETURNS trigger
LANGUAGE plpgsql AS $ai_runtime_delete$
BEGIN
  -- Cascade detection is pg_trigger_depth(), not a lookup of the parent row.
  --
  -- The first version ran `EXISTS (SELECT 1 FROM "Workspace" ...)` per row, and
  -- review round 8 (P1) was right that deleting a busy tenant would then run one
  -- extra query per receipt. pg_trigger_depth() answers the same question with
  -- no query at all.
  --
  -- The constant is > 1, NOT > 0, and the difference is the whole guard. This
  -- function IS a trigger, so inside it the depth is already at least 1; `> 0`
  -- is therefore true on a direct DELETE as well and would permit everything.
  -- A referential CASCADE runs the child delete from inside Postgres's own
  -- internal RI trigger, so our trigger sits one level deeper -- depth 2.
  --
  -- Anything at depth 1 is someone deleting a ledger row on its own, and is
  -- refused. `lib/ai-runtime/__tests__/schema-tenancy.test.ts` asserts both
  -- halves, so the constant is not a matter of opinion here.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;   -- reached through a cascade; the workspace is going with it
  END IF;

  RAISE EXCEPTION
    '% % may not be deleted on its own; it is a ledger row, and a correction is a new row',
    TG_TABLE_NAME, OLD."id";
END;
$ai_runtime_delete$;

CREATE TRIGGER "ai_runner_receipt_no_delete"
  BEFORE DELETE ON "AiRunnerReceipt"
  FOR EACH ROW EXECUTE FUNCTION "ai_runtime_delete_only_with_workspace"();

CREATE TRIGGER "ai_runner_budget_no_delete"
  BEFORE DELETE ON "AiRunnerBudget"
  FOR EACH ROW EXECUTE FUNCTION "ai_runtime_delete_only_with_workspace"();

