-- RA-4956 RLS harness — two-tenant seed.
--
-- Tenant A: org A, user A (uuid AAAAAAAA-...), inspection A, photo A,
--           notification A, pricing config A.
-- Tenant B: the mirror image.
--
-- Seeding runs as the table OWNER (the connection superuser / postgres), which
-- bypasses RLS — so the seed itself is never blocked by the policies under test.
-- The isolation assertions later switch to the `authenticated` role.

-- Fixed UUIDs so auth.uid()::text comparisons are deterministic in assertions.
-- (User ids must be uuid-shaped — see 01_schema_min.sql.)

INSERT INTO public."Organization" ("id", "ownerId", "name") VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-1111-1111-1111-111111111111', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'bbbbbbbb-2222-2222-2222-222222222222', 'Org B');

INSERT INTO public."User" ("id", "organizationId", "email") VALUES
  ('aaaaaaaa-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a@example.com'),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-00000000000b', 'b@example.com');

INSERT INTO public."Workspace" ("id", "ownerId", "name") VALUES
  ('aaaaaaaa-3333-3333-3333-333333333333', 'aaaaaaaa-1111-1111-1111-111111111111', 'WS A'),
  ('bbbbbbbb-4444-4444-4444-444444444444', 'bbbbbbbb-2222-2222-2222-222222222222', 'WS B');

INSERT INTO public."WorkspaceMember" ("id", "workspaceId", "userId", "status") VALUES
  ('wma', 'aaaaaaaa-3333-3333-3333-333333333333', 'aaaaaaaa-1111-1111-1111-111111111111', 'ACTIVE'),
  ('wmb', 'bbbbbbbb-4444-4444-4444-444444444444', 'bbbbbbbb-2222-2222-2222-222222222222', 'ACTIVE');

INSERT INTO public."Inspection" ("id", "userId", "workspaceId", "title") VALUES
  ('insp-a', 'aaaaaaaa-1111-1111-1111-111111111111', 'aaaaaaaa-3333-3333-3333-333333333333', 'Inspection A'),
  ('insp-b', 'bbbbbbbb-2222-2222-2222-222222222222', 'bbbbbbbb-4444-4444-4444-444444444444', 'Inspection B');

INSERT INTO public."Notification" ("id", "userId", "message") VALUES
  ('notif-a', 'aaaaaaaa-1111-1111-1111-111111111111', 'hello A'),
  ('notif-b', 'bbbbbbbb-2222-2222-2222-222222222222', 'hello B');

INSERT INTO public."InspectionPhoto" ("id", "inspectionId", "url") VALUES
  ('photo-a', 'insp-a', 'https://example.com/a.jpg'),
  ('photo-b', 'insp-b', 'https://example.com/b.jpg');

INSERT INTO public."OrganizationPricingConfig" ("id", "organizationId", "marginPct") VALUES
  ('opc-a', 'aaaaaaaa-0000-0000-0000-00000000000a', 12.5),
  ('opc-b', 'bbbbbbbb-0000-0000-0000-00000000000b', 20.0);

-- Grant table privileges to the authenticated role (RLS still applies on top).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
