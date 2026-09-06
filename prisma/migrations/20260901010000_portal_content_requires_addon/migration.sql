-- Mark which PortalContent rows sit behind the CLIENT_EDUCATION add-on.
--
-- The client portal already shows a small explainer set to every client for
-- free. Gating THAT would be taking a feature away, not selling a new one, so
-- the free rows stay free and the add-on buys the expanded library on top.
--
-- The alternative was to infer the split from `category` — free: process, faq,
-- insurance; paid: everything else. That breaks silently the first time someone
-- files a free article under a new category, or a paid one under an old name.
-- An explicit column cannot be got wrong by accident.
--
-- Additive + deploy-safe:
--   * NOT NULL with DEFAULT false, so every existing row keeps its current
--     behaviour (free) without a backfill and without a table rewrite pause on
--     Postgres 11+, which stores the default in the catalogue.
--   * No existing column is renamed, retyped or dropped.

ALTER TABLE "PortalContent"
  ADD COLUMN IF NOT EXISTS "requiresAddon" BOOLEAN NOT NULL DEFAULT false;

-- The portal read filters on (audience, state, requiresAddon); extend the
-- existing (audience, category, state) index rather than adding a second
-- overlapping one.
CREATE INDEX IF NOT EXISTS "PortalContent_audience_state_requiresAddon_idx"
  ON "PortalContent"("audience", "state", "requiresAddon");
