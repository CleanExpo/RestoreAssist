-- RA-1459: cloud mirror provider chosen at onboarding.
-- Values: 'drive' | 'onedrive' | 'icloud'. NULL until onboarding finishes.
ALTER TABLE "User" ADD COLUMN "cloudMirrorProvider" TEXT;
