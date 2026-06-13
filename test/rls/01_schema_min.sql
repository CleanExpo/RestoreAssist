-- RA-4956 RLS harness — minimal real-schema subset.
--
-- The RA-4956 migration is ENV-TOLERANT: every emitter is guarded by
-- `to_regclass(...) IS NULL THEN ... RETURN`, so it only attaches policies to
-- tables that actually exist. We therefore create just enough of the REAL
-- schema (matching prisma/schema.prisma column shapes) to exercise one table
-- from each scoping family. The migration runs UNMODIFIED against this subset;
-- every other table it references is silently skipped — exactly as it would be
-- on a narrower env.
--
-- Families exercised:
--   * user-owned         → "Notification"            ("userId" = auth.uid())
--   * via-inspection      → "InspectionPhoto"          (EXISTS join → Inspection)
--   * org-scoped readonly → "OrganizationPricingConfig"("organizationId" = caller org)
--
-- IMPORTANT: auth.uid() returns uuid, and policies cast it ::text. So User.id
-- (and every "userId" FK) MUST be a uuid-shaped string for the comparison to
-- bind. The seed (02_seed.sql) uses real UUIDs for that reason.

-- ── Parent / identity tables (shapes mirror prisma/schema.prisma) ───────────
CREATE TABLE public."Organization" (
  "id"        text PRIMARY KEY,
  "ownerId"   text,
  "name"      text
);

CREATE TABLE public."User" (
  "id"             text PRIMARY KEY,
  "organizationId" text REFERENCES public."Organization"("id"),
  "email"          text
);

CREATE TABLE public."Workspace" (
  "id"      text PRIMARY KEY,
  "ownerId" text NOT NULL REFERENCES public."User"("id"),
  "name"    text
);

CREATE TABLE public."WorkspaceMember" (
  "id"          text PRIMARY KEY,
  "workspaceId" text NOT NULL REFERENCES public."Workspace"("id"),
  "userId"      text NOT NULL REFERENCES public."User"("id"),
  "status"      text NOT NULL DEFAULT 'INVITED',
  UNIQUE ("workspaceId", "userId")
);

CREATE TABLE public."Inspection" (
  "id"          text PRIMARY KEY,
  "userId"      text NOT NULL REFERENCES public."User"("id"),
  "workspaceId" text REFERENCES public."Workspace"("id"),
  "title"       text
);

-- ── Scoped leaf tables (one per family) ─────────────────────────────────────

-- user-owned
CREATE TABLE public."Notification" (
  "id"      text PRIMARY KEY,
  "userId"  text NOT NULL REFERENCES public."User"("id"),
  "message" text
);

-- via-inspection child
CREATE TABLE public."InspectionPhoto" (
  "id"           text PRIMARY KEY,
  "inspectionId" text NOT NULL REFERENCES public."Inspection"("id"),
  "url"          text
);

-- org-scoped read-only
CREATE TABLE public."OrganizationPricingConfig" (
  "id"             text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES public."Organization"("id"),
  "marginPct"      numeric
);

-- The migration calls is_workspace_* helpers which reference "Workspace" and
-- "WorkspaceMember" — both created above, so the helpers resolve.
