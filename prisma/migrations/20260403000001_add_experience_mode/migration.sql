-- Sprint G: Experience-level adaptive guidance (RA-400)
-- Adds ExperienceMode enum and experienceMode field to User model

CREATE TYPE "ExperienceMode" AS ENUM (
  'APPRENTICE',
  'EXPERIENCED'
);

ALTER TABLE "User"
  ADD COLUMN "experienceMode" "ExperienceMode" NOT NULL DEFAULT 'EXPERIENCED';
