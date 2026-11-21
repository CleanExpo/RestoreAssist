-- Reverse of 20261121120000_ra_8496_job_notes.
--
-- Drops exactly what the forward migration adds, dependants first: the
-- "JobNote" table (its three indexes, two foreign keys, row level security
-- and the "job_note_append_only" trigger go with it), then the trigger
-- function, then the "JobNoteKind" enum. Nothing that existed before that
-- migration is touched.
--
-- This DISCARDS every job note. Notes are the customer's record: export them
-- first, or use this only before any real note exists. The usual rollback is
-- to revert the route and the page mount and leave the table in place.
--
-- Revert the application code BEFORE running this: the notes route and the
-- generated client name this table.
--
-- Dropping the table needs an ACCESS EXCLUSIVE lock on "JobNote" and a brief
-- lock on "Inspection" and "User" for its two foreign keys. A statement that
-- cannot get its lock within 5 seconds fails instead of making other queries
-- wait behind it. Every drop is IF EXISTS, so the file can be run again after
-- a failure, and after a partly applied forward migration.

SET lock_timeout = '5s';

DROP TABLE IF EXISTS "JobNote";

DROP FUNCTION IF EXISTS "job_note_append_only"();

DROP TYPE IF EXISTS "JobNoteKind";
