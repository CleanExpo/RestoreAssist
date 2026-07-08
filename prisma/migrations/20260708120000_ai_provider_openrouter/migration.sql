-- Phase 3 BYOK — add OPENROUTER to the AiProvider enum so the existing
-- ProviderConnection table (encrypted { apiKey, model? } payload) can hold a
-- workspace's own OpenRouter key. Additive only — no column or table changes;
-- the optional OpenRouter model slug rides inside the already-encrypted
-- credentials JSON (same pattern as the ELEVENLABS voiceId).
--
-- AlterEnum (additive + idempotent: never drops existing values)
ALTER TYPE "AiProvider" ADD VALUE IF NOT EXISTS 'OPENROUTER';
