-- RA-412: Multi-tenant Workspace Foundation
-- H1 Schema Foundation — Sprint I
-- Creates Workspace, WorkspaceMember, WorkspaceRole, Permission, RolePermission, MemberRoleBinding
--
-- Idempotent: safe to re-run after a partial apply (e.g. enums/tables created, then
-- failed on Supabase-only auth.uid() RLS against DigitalOcean/Heroku Postgres).

-- CreateEnum: WorkspaceStatus
DO $$ BEGIN
  CREATE TYPE "WorkspaceStatus" AS ENUM ('PROVISIONING', 'READY', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: WorkspaceMemberStatus
DO $$ BEGIN
  CREATE TYPE "WorkspaceMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: Workspace
CREATE TABLE IF NOT EXISTS "Workspace" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "status" "WorkspaceStatus" NOT NULL DEFAULT 'PROVISIONING',
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WorkspaceMember
CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "WorkspaceMemberStatus" NOT NULL DEFAULT 'INVITED',
  "joinedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WorkspaceRole
CREATE TABLE IF NOT EXISTS "WorkspaceRole" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Permission
CREATE TABLE IF NOT EXISTS "Permission" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RolePermission
CREATE TABLE IF NOT EXISTS "RolePermission" (
  "id" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MemberRoleBinding
CREATE TABLE IF NOT EXISTS "MemberRoleBinding" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  CONSTRAINT "MemberRoleBinding_pkey" PRIMARY KEY ("id")
);

-- Indexes: Workspace
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_slug_key" ON "Workspace"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_stripeCustomerId_key" ON "Workspace"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_stripeSubscriptionId_key" ON "Workspace"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "Workspace_ownerId_idx" ON "Workspace"("ownerId");
CREATE INDEX IF NOT EXISTS "Workspace_slug_idx" ON "Workspace"("slug");
CREATE INDEX IF NOT EXISTS "Workspace_status_idx" ON "Workspace"("status");

-- Indexes: WorkspaceMember
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");
CREATE INDEX IF NOT EXISTS "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
CREATE INDEX IF NOT EXISTS "WorkspaceMember_status_idx" ON "WorkspaceMember"("status");

-- Indexes: WorkspaceRole
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceRole_workspaceId_name_key" ON "WorkspaceRole"("workspaceId", "name");
CREATE INDEX IF NOT EXISTS "WorkspaceRole_workspaceId_idx" ON "WorkspaceRole"("workspaceId");
CREATE INDEX IF NOT EXISTS "WorkspaceRole_isSystem_idx" ON "WorkspaceRole"("isSystem");

-- Indexes: Permission
CREATE UNIQUE INDEX IF NOT EXISTS "Permission_key_key" ON "Permission"("key");
CREATE INDEX IF NOT EXISTS "Permission_category_idx" ON "Permission"("category");

-- Indexes: RolePermission
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");
CREATE INDEX IF NOT EXISTS "RolePermission_roleId_idx" ON "RolePermission"("roleId");
CREATE INDEX IF NOT EXISTS "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- Indexes: MemberRoleBinding
CREATE UNIQUE INDEX IF NOT EXISTS "MemberRoleBinding_memberId_roleId_key" ON "MemberRoleBinding"("memberId", "roleId");
CREATE INDEX IF NOT EXISTS "MemberRoleBinding_memberId_idx" ON "MemberRoleBinding"("memberId");
CREATE INDEX IF NOT EXISTS "MemberRoleBinding_roleId_idx" ON "MemberRoleBinding"("roleId");

-- ForeignKeys
DO $$ BEGIN
  ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WorkspaceRole" ADD CONSTRAINT "WorkspaceRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "WorkspaceRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "MemberRoleBinding" ADD CONSTRAINT "MemberRoleBinding_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "MemberRoleBinding" ADD CONSTRAINT "MemberRoleBinding_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "WorkspaceRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enable RLS (safe without policies — default-deny for non-owner roles; Prisma BYPASSRLS)
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Permission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberRoleBinding" ENABLE ROW LEVEL SECURITY;

-- RLS: Supabase-only (requires auth.uid()). Skip on DigitalOcean/Heroku Postgres
-- where the auth schema does not exist — that was the P3018 / 3F000 mid-apply failure.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    RAISE NOTICE 'auth schema missing — skipping workspace foundation RLS policies (non-Supabase Postgres)';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    RAISE NOTICE 'auth.uid() missing — skipping workspace foundation RLS policies';
    RETURN;
  END IF;

  -- RLS: Workspace
  DROP POLICY IF EXISTS "Workspace_select_member" ON "Workspace";
  CREATE POLICY "Workspace_select_member" ON "Workspace"
    FOR SELECT USING (
      "ownerId" = auth.uid()::text
      OR EXISTS (SELECT 1 FROM "WorkspaceMember" wm WHERE wm."workspaceId" = "id" AND wm."userId" = auth.uid()::text AND wm."status" = 'ACTIVE')
    );
  DROP POLICY IF EXISTS "Workspace_insert_owner" ON "Workspace";
  CREATE POLICY "Workspace_insert_owner" ON "Workspace"
    FOR INSERT WITH CHECK ("ownerId" = auth.uid()::text);
  DROP POLICY IF EXISTS "Workspace_update_owner" ON "Workspace";
  CREATE POLICY "Workspace_update_owner" ON "Workspace"
    FOR UPDATE USING ("ownerId" = auth.uid()::text);

  -- RLS: WorkspaceMember
  DROP POLICY IF EXISTS "WorkspaceMember_select_own" ON "WorkspaceMember";
  CREATE POLICY "WorkspaceMember_select_own" ON "WorkspaceMember"
    FOR SELECT USING (
      "userId" = auth.uid()::text
      OR EXISTS (SELECT 1 FROM "Workspace" w WHERE w."id" = "workspaceId" AND w."ownerId" = auth.uid()::text)
    );
  DROP POLICY IF EXISTS "WorkspaceMember_insert_owner" ON "WorkspaceMember";
  CREATE POLICY "WorkspaceMember_insert_owner" ON "WorkspaceMember"
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM "Workspace" w WHERE w."id" = "workspaceId" AND w."ownerId" = auth.uid()::text)
    );
  DROP POLICY IF EXISTS "WorkspaceMember_update_owner" ON "WorkspaceMember";
  CREATE POLICY "WorkspaceMember_update_owner" ON "WorkspaceMember"
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM "Workspace" w WHERE w."id" = "workspaceId" AND w."ownerId" = auth.uid()::text)
    );

  -- RLS: WorkspaceRole (system roles visible to all authenticated users)
  DROP POLICY IF EXISTS "WorkspaceRole_select_member" ON "WorkspaceRole";
  CREATE POLICY "WorkspaceRole_select_member" ON "WorkspaceRole"
    FOR SELECT USING (
      "workspaceId" IS NULL
      OR EXISTS (SELECT 1 FROM "WorkspaceMember" wm WHERE wm."workspaceId" = "workspaceId" AND wm."userId" = auth.uid()::text)
    );

  -- RLS: Permission (keys are non-sensitive; readable by all authenticated users)
  DROP POLICY IF EXISTS "Permission_select_auth" ON "Permission";
  CREATE POLICY "Permission_select_auth" ON "Permission"
    FOR SELECT USING (auth.uid() IS NOT NULL);

  -- RLS: RolePermission
  DROP POLICY IF EXISTS "RolePermission_select_member" ON "RolePermission";
  CREATE POLICY "RolePermission_select_member" ON "RolePermission"
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM "WorkspaceRole" wr
        LEFT JOIN "WorkspaceMember" wm ON wm."workspaceId" = wr."workspaceId"
        WHERE wr."id" = "roleId" AND (wr."workspaceId" IS NULL OR wm."userId" = auth.uid()::text)
      )
    );

  -- RLS: MemberRoleBinding
  DROP POLICY IF EXISTS "MemberRoleBinding_select_own" ON "MemberRoleBinding";
  CREATE POLICY "MemberRoleBinding_select_own" ON "MemberRoleBinding"
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM "WorkspaceMember" wm
        JOIN "Workspace" w ON w."id" = wm."workspaceId"
        WHERE wm."id" = "memberId" AND (wm."userId" = auth.uid()::text OR w."ownerId" = auth.uid()::text)
      )
    );
END $$;

-- Seed: 3 system roles
INSERT INTO "WorkspaceRole" ("id", "name", "description", "isSystem", "createdAt", "updatedAt") VALUES
  ('sys-role-owner',      'Owner',      'Full workspace control — billing, members, settings', true, NOW(), NOW()),
  ('sys-role-manager',    'Manager',    'Manage jobs, staff, and reports — no billing access', true, NOW(), NOW()),
  ('sys-role-technician', 'Technician', 'Field work — inspections, evidence capture, reports',  true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- Seed: Permission keys (Section 9 of workspace spec)
INSERT INTO "Permission" ("id", "key", "description", "category", "createdAt", "updatedAt") VALUES
  ('perm-mem-invite',   'membership.invite',        'Invite new members',                     'membership', NOW(), NOW()),
  ('perm-mem-remove',   'membership.remove',        'Remove members',                         'membership', NOW(), NOW()),
  ('perm-mem-roles',    'membership.manage_roles',  'Assign or revoke member roles',          'membership', NOW(), NOW()),
  ('perm-ws-settings',  'workspace.settings',       'Edit workspace name, slug, branding',    'workspace',  NOW(), NOW()),
  ('perm-ws-billing',   'workspace.billing',        'View and manage billing & subscription', 'workspace',  NOW(), NOW()),
  ('perm-ws-delete',    'workspace.delete',         'Delete the workspace permanently',       'workspace',  NOW(), NOW()),
  ('perm-rep-create',   'reports.create',           'Create new inspection reports',          'reporting',  NOW(), NOW()),
  ('perm-rep-edit',     'reports.edit',             'Edit any report in the workspace',       'reporting',  NOW(), NOW()),
  ('perm-rep-delete',   'reports.delete',           'Delete reports',                         'reporting',  NOW(), NOW()),
  ('perm-rep-export',   'reports.export',           'Export / download reports as PDF',       'reporting',  NOW(), NOW()),
  ('perm-rep-approve',  'reports.approve',          'Approve reports before client delivery', 'reporting',  NOW(), NOW()),
  ('perm-ai-standard',  'ai.use_standard',          'Use standard AI features (Quick Fill)',  'ai',         NOW(), NOW()),
  ('perm-ai-premium',   'ai.use_premium',           'Use premium AI (BYOK vision)',           'ai',         NOW(), NOW()),
  ('perm-ai-config',    'ai.configure',             'Configure AI keys and providers',        'ai',         NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- Seed: Owner gets all permissions
INSERT INTO "RolePermission" ("id", "roleId", "permissionId") VALUES
  ('rp-own-mem-invite',   'sys-role-owner', 'perm-mem-invite'),
  ('rp-own-mem-remove',   'sys-role-owner', 'perm-mem-remove'),
  ('rp-own-mem-roles',    'sys-role-owner', 'perm-mem-roles'),
  ('rp-own-ws-settings',  'sys-role-owner', 'perm-ws-settings'),
  ('rp-own-ws-billing',   'sys-role-owner', 'perm-ws-billing'),
  ('rp-own-ws-delete',    'sys-role-owner', 'perm-ws-delete'),
  ('rp-own-rep-create',   'sys-role-owner', 'perm-rep-create'),
  ('rp-own-rep-edit',     'sys-role-owner', 'perm-rep-edit'),
  ('rp-own-rep-delete',   'sys-role-owner', 'perm-rep-delete'),
  ('rp-own-rep-export',   'sys-role-owner', 'perm-rep-export'),
  ('rp-own-rep-approve',  'sys-role-owner', 'perm-rep-approve'),
  ('rp-own-ai-standard',  'sys-role-owner', 'perm-ai-standard'),
  ('rp-own-ai-premium',   'sys-role-owner', 'perm-ai-premium'),
  ('rp-own-ai-config',    'sys-role-owner', 'perm-ai-config')
ON CONFLICT ("id") DO NOTHING;

-- Seed: Manager (ops, no billing/delete/AI config)
INSERT INTO "RolePermission" ("id", "roleId", "permissionId") VALUES
  ('rp-mgr-mem-invite',   'sys-role-manager', 'perm-mem-invite'),
  ('rp-mgr-mem-remove',   'sys-role-manager', 'perm-mem-remove'),
  ('rp-mgr-mem-roles',    'sys-role-manager', 'perm-mem-roles'),
  ('rp-mgr-ws-settings',  'sys-role-manager', 'perm-ws-settings'),
  ('rp-mgr-rep-create',   'sys-role-manager', 'perm-rep-create'),
  ('rp-mgr-rep-edit',     'sys-role-manager', 'perm-rep-edit'),
  ('rp-mgr-rep-delete',   'sys-role-manager', 'perm-rep-delete'),
  ('rp-mgr-rep-export',   'sys-role-manager', 'perm-rep-export'),
  ('rp-mgr-rep-approve',  'sys-role-manager', 'perm-rep-approve'),
  ('rp-mgr-ai-standard',  'sys-role-manager', 'perm-ai-standard'),
  ('rp-mgr-ai-premium',   'sys-role-manager', 'perm-ai-premium')
ON CONFLICT ("id") DO NOTHING;

-- Seed: Technician (field only)
INSERT INTO "RolePermission" ("id", "roleId", "permissionId") VALUES
  ('rp-tech-rep-create',  'sys-role-technician', 'perm-rep-create'),
  ('rp-tech-rep-edit',    'sys-role-technician', 'perm-rep-edit'),
  ('rp-tech-rep-export',  'sys-role-technician', 'perm-rep-export'),
  ('rp-tech-ai-standard', 'sys-role-technician', 'perm-ai-standard')
ON CONFLICT ("id") DO NOTHING;
