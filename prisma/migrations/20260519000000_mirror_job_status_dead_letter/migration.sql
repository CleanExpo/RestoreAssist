-- Punch-list P1 #11.2 — mirror-recovery subscriber.
-- Additive ALTER TYPE ADD VALUE — no data movement, no locks beyond a
-- catalog touch. Distinct from MirrorJobStatus.FAILED so the recovery
-- sweep can be idempotent (DEAD_LETTER rows are never re-processed).
ALTER TYPE "MirrorJobStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';
