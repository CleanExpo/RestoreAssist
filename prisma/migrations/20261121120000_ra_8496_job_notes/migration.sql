-- RA-8496: append-only, time-stamped job notes.
--
-- WHY
--   Office staff write a note every time they call the insured or book a
--   technician, and every note must carry its date, time and author. Nothing
--   in the schema held that: JobAppointment.notes is one free-text field that
--   is overwritten.
--
-- WHAT IT ADDS
--   enum     "JobNoteKind"  GENERAL, CALL, BOOKING, REBOOKING, REVIEW
--   table    "JobNote"      one row per note; author name and role copied
--                           onto the row at write time; createdAt set by the
--                           server
--   trigger  "job_note_append_only" on the new table
--
-- ADDITIVE
--   CREATE TYPE, CREATE TABLE, CREATE INDEX, ADD CONSTRAINT, a trigger and
--   ENABLE ROW LEVEL SECURITY on the new table only. No existing table,
--   column or row is touched, so nothing here can fail on existing data and
--   no existing table is locked beyond the brief SHARE ROW EXCLUSIVE the two
--   foreign keys take on "Inspection" and "User" while they are added (no
--   rows to check).
--
-- FOREIGN KEYS
--   inspectionId  ON DELETE CASCADE   the notes go with the job
--   authorUserId  ON DELETE SET NULL  the stamp (authorName, authorRole) stays
--   Both are ON UPDATE RESTRICT, not Prisma's default CASCADE. Nothing in the
--   app changes "Inspection"."id" or "User"."id" (both are generated once), and
--   with RESTRICT an id change on a job or account that has notes is refused
--   by the foreign key itself, so the append-only trigger never meets a
--   cascaded id rewrite it would have to tell apart from a real edit.
--
-- ROW LEVEL SECURITY
--   Enabled with no policy, like ReportShareAccess: anon and authenticated
--   are default-denied, and the application, which connects as the table
--   owner (no table uses FORCE ROW LEVEL SECURITY), is unaffected. Notes hold
--   personal details of the insured and are not a browser/PostgREST surface.
--
-- APPEND-ONLY
--   Enforced by the database, not only by the route. The notes route exports
--   only GET and POST, and the trigger "job_note_append_only" refuses any
--   change to or removal of a note, from any caller, the table owner
--   included (row level security does not bind the owner; a trigger does).
--   Two changes come only from Postgres's own foreign-key actions, and are
--   let through. Each must run one trigger level down (pg_trigger_depth() > 1)
--   AND its parent row must already be gone, so a DELETE or UPDATE issued
--   from some other trigger while the job or account still exists is refused:
--     * deleting a job removes its notes (ON DELETE CASCADE);
--     * deleting an account clears authorUserId, and nothing else, on that
--       person's notes (ON DELETE SET NULL); the name and role stay.
--   Emptying the whole table with the owner-only bulk maintenance command
--   is not covered.
--
-- RETRIED SAVES
--   "clientRequestId" is one id per draft from the panel. The unique index
--   ("inspectionId", "clientRequestId") turns a retried save into the note
--   already written. NULLs do not collide, so callers without an id still
--   insert.
--
-- KNOWN LIMIT (accepted for RA-8496, follow-up filed)
--   The job's creator can still delete the job (and closing their account
--   deletes their jobs), which takes every note on it with it, including
--   notes other staff wrote.
--
-- DEPLOY ORDER
--   Startup does not apply migrations (scripts/start-production.sh). Until
--   this is applied the notes route answers 503 and the panel says notes are
--   not available yet; nothing else reads this table. Applying to production
--   is the owner's step, with `prisma migrate deploy` only (a hand-run copy
--   in the SQL console never reaches the ledger, and the next deploy then
--   fails at CREATE TYPE).
--
-- IF A STATEMENT TIMES OUT (lock_timeout below)
--   Prisma records the migration as failed and later deploys stop (P3009).
--   Check what was left: SELECT to_regclass('"JobNote"'),
--   to_regtype('"JobNoteKind"'). If either is not NULL, remove the new
--   table and type by hand, mark it rolled back with
--   `prisma migrate resolve --rolled-back 20261121120000_ra_8496_job_notes`,
--   and apply again off-peak (down.sql beside this file removes whatever
--   was left). Removing them is safe only before any note exists.
--
-- ORDER
--   Timestamped 20261121120000 so it sorts after RA-8495
--   (20261121090000_ra_8495_office_job_intake). The two touch different
--   objects and apply in either order.
--
-- ROLLBACK AND FIXES
--   Once applied, never edit this file (the ledger checksum would no longer
--   match). A fix is a new forward migration. The normal way to roll the
--   feature back is to revert the route and the page mount and leave this
--   table and its notes in place; the notes are the customer's record.
--   down.sql beside this file removes everything this migration adds, and
--   every note with it; use it only before any real note exists, or after
--   exporting the notes.

SET lock_timeout = '5s';

CREATE TYPE "JobNoteKind" AS ENUM ('GENERAL', 'CALL', 'BOOKING', 'REBOOKING', 'REVIEW');

CREATE TABLE "JobNote" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" "Role" NOT NULL,
    "kind" "JobNoteKind" NOT NULL DEFAULT 'GENERAL',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientRequestId" TEXT,

    CONSTRAINT "JobNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobNote_inspectionId_createdAt_idx" ON "JobNote"("inspectionId", "createdAt");

CREATE INDEX "JobNote_authorUserId_idx" ON "JobNote"("authorUserId");

CREATE UNIQUE INDEX "JobNote_inspectionId_clientRequestId_key" ON "JobNote"("inspectionId", "clientRequestId");

ALTER TABLE "JobNote"
  ADD CONSTRAINT "JobNote_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "JobNote"
  ADD CONSTRAINT "JobNote_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE RESTRICT;

ALTER TABLE "JobNote" ENABLE ROW LEVEL SECURITY;

-- Append-only, enforced here. See APPEND-ONLY in the header for what passes.
CREATE OR REPLACE FUNCTION "job_note_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $job_note_append_only$
DECLARE
  old_row "JobNote";
  new_row "JobNote";
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only the job's own ON DELETE CASCADE: it runs inside the foreign-key
    -- trigger, one level down, after the job row itself is gone.
    IF pg_trigger_depth() > 1
       AND NOT EXISTS (SELECT 1 FROM "Inspection" WHERE "id" = OLD."inspectionId") THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION
      'JobNote % cannot be removed; notes are append-only (RA-8496)', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- The account's ON DELETE SET NULL: only authorUserId, only to NULL, only
  -- once the account row is gone, and nothing else on the row may move.
  IF pg_trigger_depth() > 1
     AND OLD."authorUserId" IS NOT NULL
     AND NEW."authorUserId" IS NULL
     AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = OLD."authorUserId") THEN
    old_row := OLD;
    new_row := NEW;
    old_row."authorUserId" := NULL;
    IF old_row IS NOT DISTINCT FROM new_row THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION
    'JobNote % cannot be changed; add a new note to correct it (RA-8496)', OLD."id"
    USING ERRCODE = 'restrict_violation';
END;
$job_note_append_only$;

CREATE TRIGGER "job_note_append_only"
  BEFORE UPDATE OR DELETE ON "JobNote"
  FOR EACH ROW EXECUTE FUNCTION "job_note_append_only"();
