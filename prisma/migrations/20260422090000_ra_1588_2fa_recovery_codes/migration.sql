-- RA-1588 / Security audit 2026-04-22: backup / recovery codes for 2FA.
-- Stores a JSON array of bcrypt hashes; each code is consumed on use.
-- Nullable so existing users are unaffected; null + twoFactorEnabled=true
-- means the user enrolled before recovery codes shipped and should be
-- prompted to regenerate.
ALTER TABLE "User" ADD COLUMN "twoFactorRecoveryCodes" TEXT;
