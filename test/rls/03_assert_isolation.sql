-- RA-4956 RLS harness — tenant-isolation assertions.
--
-- Runs the actual RA-4956 policies (already applied by run.sh before this file)
-- under the `authenticated` role with a per-statement JWT subject, and proves:
--
--   A. Tenant A SELECT sees ONLY A's rows  (user / via-inspection / org family).
--   B. Tenant A cannot SELECT B's rows.
--   C. Tenant A cannot UPDATE B's rows      (0 rows affected — RLS USING filter).
--   D. Tenant A cannot DELETE B's rows      (0 rows affected).
--   E. Tenant A INSERT for B's userId is rejected (WITH CHECK violation).
--   F. The mirror holds for tenant B.
--   G. The service role bypasses RLS and sees ALL rows.
--
-- Any failed ASSERT raises an exception → psql exits non-zero → run.sh fails.
-- Each tenant block is wrapped in its own transaction so `SET LOCAL role` and
-- the jwt claim are scoped and reset cleanly.

\set ON_ERROR_STOP on

-- Helper: impersonate a tenant by setting role + JWT sub for the txn.
-- (We inline the SETs in each block because SET LOCAL is txn-scoped.)

-- ════════════════════════════════════════════════════════════════════════════
-- TENANT A
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE n int;
BEGIN
  -- A. user-owned: sees own notification only
  SELECT count(*) INTO n FROM public."Notification";
  ASSERT n = 1, format('A.user SELECT: expected 1 own Notification, got %s', n);
  SELECT count(*) INTO n FROM public."Notification" WHERE "id" = 'notif-a';
  ASSERT n = 1, 'A.user: own notification notif-a must be visible';

  -- B. cannot see tenant B's notification
  SELECT count(*) INTO n FROM public."Notification" WHERE "id" = 'notif-b';
  ASSERT n = 0, 'A.user ISOLATION BREACH: B''s notification notif-b visible to A';

  -- via-inspection child: sees own photo, not B's
  SELECT count(*) INTO n FROM public."InspectionPhoto";
  ASSERT n = 1, format('A.via-inspection SELECT: expected 1 photo, got %s', n);
  SELECT count(*) INTO n FROM public."InspectionPhoto" WHERE "id" = 'photo-b';
  ASSERT n = 0, 'A.via-inspection ISOLATION BREACH: B''s photo-b visible to A';

  -- org-scoped readonly: sees own org pricing, not B's
  SELECT count(*) INTO n FROM public."OrganizationPricingConfig";
  ASSERT n = 1, format('A.org SELECT: expected 1 pricing row, got %s', n);
  SELECT count(*) INTO n FROM public."OrganizationPricingConfig" WHERE "id" = 'opc-b';
  ASSERT n = 0, 'A.org ISOLATION BREACH: B''s opc-b visible to A';

  -- C. cannot UPDATE B's row (RLS USING filter → 0 rows)
  UPDATE public."Notification" SET "message" = 'hacked' WHERE "id" = 'notif-b';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'A WRITE BREACH: UPDATE touched B''s notification';

  UPDATE public."InspectionPhoto" SET "url" = 'hacked' WHERE "id" = 'photo-b';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'A WRITE BREACH: UPDATE touched B''s photo';

  -- D. cannot DELETE B's row
  DELETE FROM public."Notification" WHERE "id" = 'notif-b';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'A WRITE BREACH: DELETE removed B''s notification';

  RAISE NOTICE 'TENANT A: all SELECT/UPDATE/DELETE isolation assertions passed';
END $$;

-- E. INSERT bearing B's userId must be rejected by WITH CHECK.
DO $$
BEGIN
  BEGIN
    INSERT INTO public."Notification" ("id", "userId", "message")
    VALUES ('notif-a-evil', 'bbbbbbbb-2222-2222-2222-222222222222', 'spoof');
    RAISE EXCEPTION 'A WRITE BREACH: INSERT with B''s userId was ACCEPTED';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'TENANT A: cross-tenant INSERT correctly rejected (%).', SQLERRM;
  END;
END $$;
ROLLBACK;  -- discard any harness writes; keep seed pristine for B's block

-- ════════════════════════════════════════════════════════════════════════════
-- TENANT B (mirror)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public."Notification";
  ASSERT n = 1, format('B.user SELECT: expected 1, got %s', n);
  SELECT count(*) INTO n FROM public."Notification" WHERE "id" = 'notif-a';
  ASSERT n = 0, 'B.user ISOLATION BREACH: A''s notif-a visible to B';

  SELECT count(*) INTO n FROM public."InspectionPhoto" WHERE "id" = 'photo-a';
  ASSERT n = 0, 'B.via-inspection ISOLATION BREACH: A''s photo-a visible to B';

  SELECT count(*) INTO n FROM public."OrganizationPricingConfig" WHERE "id" = 'opc-a';
  ASSERT n = 0, 'B.org ISOLATION BREACH: A''s opc-a visible to B';

  RAISE NOTICE 'TENANT B: mirror isolation assertions passed';
END $$;
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- SERVICE ROLE — must bypass RLS and see EVERYTHING
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL role service_role;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public."Notification";
  ASSERT n = 2, format('service_role: expected 2 notifications (all tenants), got %s', n);
  SELECT count(*) INTO n FROM public."InspectionPhoto";
  ASSERT n = 2, format('service_role: expected 2 photos, got %s', n);
  SELECT count(*) INTO n FROM public."OrganizationPricingConfig";
  ASSERT n = 2, format('service_role: expected 2 pricing rows, got %s', n);
  RAISE NOTICE 'SERVICE ROLE: sees all rows across tenants (RLS bypass confirmed)';
END $$;
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- ANON — no JWT sub → auth.uid() NULL → every tenant policy denies.
-- (Mirrors the NextAuth caveat: anon-key/unauthenticated paths see nothing.)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL role authenticated;  -- authenticated role but NO jwt sub set
SET LOCAL request.jwt.claims = '{"role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public."Notification";
  ASSERT n = 0, format('no-sub: expected 0 (auth.uid NULL denies), got %s', n);
  SELECT count(*) INTO n FROM public."InspectionPhoto";
  ASSERT n = 0, format('no-sub: expected 0 photos, got %s', n);
  RAISE NOTICE 'NO-SUBJECT: auth.uid() NULL → all tenant rows denied (safe default)';
END $$;
ROLLBACK;

\echo ''
\echo '✓ RA-4956 RLS tenant-isolation harness: ALL ASSERTIONS PASSED'
