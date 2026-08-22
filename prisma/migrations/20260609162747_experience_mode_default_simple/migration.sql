-- RA-400: Make Simple mode the default for NEW accounts.
-- app/dashboard/layout.tsx maps experienceMode APPRENTICE/null => Simple nav
-- and EXPERIENCED => Advanced nav. The original column default was
-- 'EXPERIENCED', so every new/un-toggled user resolved to Advanced.
-- Flip the column DEFAULT to 'APPRENTICE' so new rows land in Simple mode.
-- Intentionally NO backfill of existing rows: users who already have a
-- stored value keep it (that's a separate, deliberate decision).
ALTER TABLE "User" ALTER COLUMN "experienceMode" SET DEFAULT 'APPRENTICE';
