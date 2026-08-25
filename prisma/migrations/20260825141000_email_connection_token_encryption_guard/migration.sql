-- EmailConnection is service-only under RLS, but a privileged DB dump would
-- still expose OAuth credentials if an application path wrote plaintext.
--
-- NOT VALID deliberately permits pre-existing legacy rows until the
-- owner-gated backfill encrypts them. PostgreSQL still enforces these checks on
-- every new insert or update immediately. The backfill validates both
-- constraints only after it proves that no plaintext rows remain.

ALTER TABLE public."EmailConnection"
  ADD CONSTRAINT "EmailConnection_accessToken_ciphertext_check"
  CHECK (
    "accessToken" ~ '^[0-9A-Fa-f]{32}:[0-9A-Fa-f]{32}:[0-9A-Fa-f]{2}([0-9A-Fa-f]{2})*$'
  ) NOT VALID;

ALTER TABLE public."EmailConnection"
  ADD CONSTRAINT "EmailConnection_refreshToken_ciphertext_check"
  CHECK (
    "refreshToken" ~ '^[0-9A-Fa-f]{32}:[0-9A-Fa-f]{32}:[0-9A-Fa-f]{2}([0-9A-Fa-f]{2})*$'
  ) NOT VALID;
