-- Reverse of 20260926090100_d030_scope_item_source.
--
-- Drops exactly the nullable column the forward migration adds.

ALTER TABLE "ScopeItem" DROP COLUMN IF EXISTS "source";
