-- RA-8198 — add META to the AiProvider enum so ProviderConnection can store
-- a workspace's own Meta Model API (Llama) key. Additive only: no column or
-- table changes. The key stays inside the existing AES-256-GCM credentials
-- blob, same as the other BYOK providers.
--
-- AlterEnum (additive + idempotent: never drops existing values)
ALTER TYPE "AiProvider" ADD VALUE IF NOT EXISTS 'META';
