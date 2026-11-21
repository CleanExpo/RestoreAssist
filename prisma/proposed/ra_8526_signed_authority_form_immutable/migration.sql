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
--   1. A signed AuthorityFormSignature row cannot be deleted. Postgres fires
--      row triggers for ON DELETE CASCADE actions too, so deleting the parent
--      AuthorityFormInstance, its Report, or the Report's User fails as a
--      whole and rolls back.
--   2. A signed AuthorityFormSignature row keeps its signature evidence:
--      signer, image, time, IP, user agent and form. Token and request
--      bookkeeping columns may still change (link revocation).
--   3. Once any signature on a form is signed, the form's wording and
--      parties cannot change. status, pdfUrl, draftPdfUrl, completedAt and
--      updatedAt stay writable so signing can complete the form.
--
-- Before approving, note:
--   - Integration test cleanups that delete a user or report holding a signed
--     form (for example lib/authority-forms/__tests__/signed-record-guard.integration.test.ts)
--     will fail against a database with these triggers. They must delete the
--     fixture inside a session that sets
--     `SET LOCAL restoreassist.allow_signed_form_erasure = 'on'`.
--   - That setting is the only way past the triggers. It is for a lawful,
--     reviewed erasure (for example a court order) run by a person with
--     database access, never by application code. The app never sets it; a
--     test in lib/authority-forms/__tests__/signed-record-guard.test.ts can be
--     added to keep it that way.
--   - Rollback: DROP TRIGGER ... ; DROP FUNCTION ... (bottom of this file).

CREATE OR REPLACE FUNCTION ra_signed_form_erasure_allowed() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('restoreassist.allow_signed_form_erasure', true), '') = 'on'
$$;

CREATE OR REPLACE FUNCTION ra_guard_signed_authority_signature() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."signedAt" IS NULL OR ra_signed_form_erasure_allowed() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RA-8526: signature % on authority form % is signed and cannot be deleted',
      OLD."id", OLD."instanceId"
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."instanceId"      IS DISTINCT FROM OLD."instanceId"
  OR NEW."signatoryName"   IS DISTINCT FROM OLD."signatoryName"
  OR NEW."signatoryRole"   IS DISTINCT FROM OLD."signatoryRole"
  OR NEW."signatoryEmail"  IS DISTINCT FROM OLD."signatoryEmail"
  OR NEW."signatoryPhone"  IS DISTINCT FROM OLD."signatoryPhone"
  OR NEW."signatureData"   IS DISTINCT FROM OLD."signatureData"
  OR NEW."signatureUrl"    IS DISTINCT FROM OLD."signatureUrl"
  OR NEW."ipAddress"       IS DISTINCT FROM OLD."ipAddress"
  OR NEW."userAgent"       IS DISTINCT FROM OLD."userAgent"
  OR NEW."signedAt"        IS DISTINCT FROM OLD."signedAt" THEN
    RAISE EXCEPTION 'RA-8526: signature % on authority form % is signed and cannot be changed',
      OLD."id", OLD."instanceId"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS ra_8526_signed_signature_guard ON "AuthorityFormSignature";
CREATE TRIGGER ra_8526_signed_signature_guard
  BEFORE UPDATE OR DELETE ON "AuthorityFormSignature"
  FOR EACH ROW EXECUTE FUNCTION ra_guard_signed_authority_signature();

CREATE OR REPLACE FUNCTION ra_guard_signed_authority_form() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ra_signed_form_erasure_allowed() THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "AuthorityFormSignature" s
    WHERE s."instanceId" = OLD."id" AND s."signedAt" IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW."templateId"           IS DISTINCT FROM OLD."templateId"
  OR NEW."reportId"             IS DISTINCT FROM OLD."reportId"
  OR NEW."companyName"          IS DISTINCT FROM OLD."companyName"
  OR NEW."companyLogo"          IS DISTINCT FROM OLD."companyLogo"
  OR NEW."companyABN"           IS DISTINCT FROM OLD."companyABN"
  OR NEW."companyPhone"         IS DISTINCT FROM OLD."companyPhone"
  OR NEW."companyEmail"         IS DISTINCT FROM OLD."companyEmail"
  OR NEW."companyWebsite"       IS DISTINCT FROM OLD."companyWebsite"
  OR NEW."companyAddress"       IS DISTINCT FROM OLD."companyAddress"
  OR NEW."clientName"           IS DISTINCT FROM OLD."clientName"
  OR NEW."clientAddress"        IS DISTINCT FROM OLD."clientAddress"
  OR NEW."incidentBrief"        IS DISTINCT FROM OLD."incidentBrief"
  OR NEW."incidentDate"         IS DISTINCT FROM OLD."incidentDate"
  OR NEW."authorityDescription" IS DISTINCT FROM OLD."authorityDescription" THEN
    RAISE EXCEPTION 'RA-8526: authority form % has been signed and its wording cannot be changed',
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
--   DROP FUNCTION IF EXISTS ra_signed_form_erasure_allowed();
