-- Bind each OAuth callback to the exact connect attempt that created its
-- state nonce. This prevents concurrent or retried connects from overwriting
-- a provider's PKCE verifier in the shared Integration.config field.
ALTER TABLE "OAuthStateNonce"
  ADD COLUMN "integrationId" TEXT,
  ADD COLUMN "redirectUri" TEXT,
  ADD COLUMN "codeVerifier" TEXT;
