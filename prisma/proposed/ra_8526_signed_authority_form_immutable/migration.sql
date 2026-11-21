-- RA-8526 PROPOSED MIGRATION. NOT APPLIED. NEEDS PHILL'S APPROVAL.
--
-- This file sits outside prisma/migrations on purpose: scripts/build.sh runs
-- `prisma migrate deploy` on every deploy, so anything in prisma/migrations
-- reaches production on merge. Moving this folder to
-- prisma/migrations/<timestamp>_ra_8526_signed_authority_form_immutable/ is
-- the approval act. Do not apply it to any database by hand.
--
-- What it does: makes a signed authority form a closed record at the database,
-- so no writer path (route, script, cron, SQL console or a FK cascade from
-- Report or User) can change or erase it. The application guard in
-- lib/authority-forms/signed-record-guard.ts gives the user a clear 409; this
-- is the backstop that does not depend on every writer calling it.
--
-- A form is "signed" once any of its AuthorityFormSignature rows has signedAt.
-- The unit of immutability is the FORM, not the row: the executed document
-- shows every slot, signed or pending, so once one person has signed, every
-- slot on that form is part of the record.
--
--   1. No slot of a signed form can be deleted, signed or pending. Postgres
--      fires row triggers for ON DELETE CASCADE actions too, so deleting the
--      form, its Report, or the Report's User fails as a whole and rolls back.
--   2. Every slot of a signed form is frozen except for an allow-list of link
--      bookkeeping columns (signatureRequestToken, signatureRequestSent,
--      signatureRequestSentAt, updatedAt). Every other column, including any
--      column added later, is frozen by default.
--      The one other permitted write is a pending slot being signed: in the
--      same UPDATE that sets signedAt, the signing columns (signatureData,
--      signatureUrl, signatoryName, ipAddress, userAgent) may be filled.
--   3. No new signature row can be added to a signed form (a new slot would
--      appear on the executed document, which is rendered from live rows).
--   4. A signed form row is frozen except for status, pdfUrl, draftPdfUrl,
--      completedAt and updatedAt, which signing needs to complete the form.
--      Every other column, including any added later, is frozen by default.
--
-- Tested against Postgres (PGlite) by
-- lib/authority-forms/__tests__/signed-form-trigger.pglite.test.ts.
--
-- Before approving, note:
--   - Integration test cleanups that delete a user or report holding a signed
--     form (for example lib/authority-forms/__tests__/signed-record-guard.integration.test.ts)
--     will fail against a database with these triggers. They must delete the
--     fixture inside a transaction that runs
--     `SET LOCAL restoreassist.allow_signed_form_erasure = 'on'`.
--   - That setting is the only way past the triggers. It is for a lawful,
--     reviewed erasure (for example a court order) run by a person with
--     database access, never by application code. A test in
--     lib/authority-forms/__tests__/signed-record-guard.test.ts fails if any
--     file under app, lib or scripts names the setting.
--   - Rollback: the DROP statements at the bottom of this file.

CREATE OR REPLACE FUNCTION ra_signed_form_erasure_allowed() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('restoreassist.allow_signed_form_erasure', true), '') = 'on'
$$;

CREATE OR REPLACE FUNCTION ra_authority_form_is_signed(form_id text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "AuthorityFormSignature" s
    WHERE s."instanceId" = form_id AND s."signedAt" IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION ra_guard_signed_authority_signature() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  -- The only columns of any slot on a signed form that may change.
  mutable text[] := ARRAY['signatureRequestToken', 'signatureRequestSent', 'signatureRequestSentAt', 'updatedAt'];
  -- Also writable, but only in the UPDATE that signs a pending slot.
  signing text[] := ARRAY['signatureData', 'signatureUrl', 'signatoryName', 'signedAt', 'ipAddress', 'userAgent'];
BEGIN
  IF ra_signed_form_erasure_allowed() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF ra_authority_form_is_signed(NEW."instanceId") THEN
      RAISE EXCEPTION 'RA-8526: authority form % has been signed and cannot take a new signatory',
        NEW."instanceId"
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- The rule belongs to the form: a slot on a form nobody has signed is free.
  IF OLD."signedAt" IS NULL AND NOT ra_authority_form_is_signed(OLD."instanceId") THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RA-8526: authority form % has been signed; signature slot % cannot be deleted',
      OLD."instanceId", OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- A pending slot on a signed form may be signed, once.
  IF OLD."signedAt" IS NULL AND NEW."signedAt" IS NOT NULL THEN
    IF (to_jsonb(NEW) - mutable - signing) IS DISTINCT FROM (to_jsonb(OLD) - mutable - signing) THEN
      RAISE EXCEPTION 'RA-8526: authority form % has been signed; signing slot % may only fill its signature',
        OLD."instanceId", OLD."id"
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'RA-8526: authority form % has been signed; signature slot % cannot be changed',
      OLD."instanceId", OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS ra_8526_signed_signature_guard ON "AuthorityFormSignature";
CREATE TRIGGER ra_8526_signed_signature_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "AuthorityFormSignature"
  FOR EACH ROW EXECUTE FUNCTION ra_guard_signed_authority_signature();

CREATE OR REPLACE FUNCTION ra_guard_signed_authority_form() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  -- The only columns of a signed form row that may change.
  mutable text[] := ARRAY['status', 'pdfUrl', 'draftPdfUrl', 'completedAt', 'updatedAt'];
BEGIN
  IF ra_signed_form_erasure_allowed() OR NOT ra_authority_form_is_signed(OLD."id") THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'RA-8526: authority form % has been signed and cannot be changed',
      OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS ra_8526_signed_form_guard ON "AuthorityFormInstance";
CREATE TRIGGER ra_8526_signed_form_guard
  BEFORE UPDATE ON "AuthorityFormInstance"
  FOR EACH ROW EXECUTE FUNCTION ra_guard_signed_authority_form();

-- Rollback (run only on Phill's instruction):
--   DROP TRIGGER IF EXISTS ra_8526_signed_form_guard ON "AuthorityFormInstance";
--   DROP TRIGGER IF EXISTS ra_8526_signed_signature_guard ON "AuthorityFormSignature";
--   DROP FUNCTION IF EXISTS ra_guard_signed_authority_form();
--   DROP FUNCTION IF EXISTS ra_guard_signed_authority_signature();
--   DROP FUNCTION IF EXISTS ra_authority_form_is_signed(text);
--   DROP FUNCTION IF EXISTS ra_signed_form_erasure_allowed();
