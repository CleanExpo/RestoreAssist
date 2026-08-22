-- RA-6998 / RA-6920 — per-workspace ElevenLabs BYOK credential store.
-- Additive only: adds the ELEVENLABS value to the AiProvider enum so the
-- existing ProviderConnection table (encrypted { apiKey, voiceId } payload)
-- can hold a workspace's own ElevenLabs key. No column or table changes —
-- the optional Voice ID rides inside the already-encrypted credentials JSON.
--
-- AlterEnum (additive: never drops existing values)
ALTER TYPE "AiProvider" ADD VALUE IF NOT EXISTS 'ELEVENLABS';
