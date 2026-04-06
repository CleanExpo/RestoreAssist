/**
 * RestoreAssist — Workspace System Seed
 * [RA-412] Multi-tenant schema foundation
 *
 * Seeds 3 immutable system roles (Owner, Manager, Technician) and all
 * Permission records across 4 families: membership, workspace, reporting, ai.
 *
 * Run with: npx tsx prisma/seed-workspace.ts
 * Idempotent: uses upsert — safe to re-run at any time.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Permission definitions ─────────────────────────────────────────────────

const PERMISSIONS = [
  // membership family
  {
    key: "membership.invite",
    category: "membership",
    description: "Invite new members to the workspace",
  },
  {
    key: "membership.remove",
    category: "membership",
    description: "Remove members from the workspace",
  },
  {
    key: "membership.view",
    category: "membership",
    description: "View the workspace member list",
  },
  {
    key: "membership.role.assign",
    category: "membership",
    description: "Assign roles to workspace members",
  },

  // workspace family
  {
    key: "workspace.view",
    category: "workspace",
    description: "View workspace details and configuration",
  },
  {
    key: "workspace.settings",
    category: "workspace",
    description: "Edit workspace name, slug, and settings",
  },
  {
    key: "workspace.billing",
    category: "workspace",
    description: "Manage billing, subscription, and payment methods",
  },
  {
    key: "workspace.delete",
    category: "workspace",
    description: "Permanently delete the workspace",
  },

  // reporting family
  {
    key: "reporting.create",
    category: "reporting",
    description: "Create and draft inspection reports",
  },
  {
    key: "reporting.view",
    category: "reporting",
    description: "View inspection reports",
  },
  {
    key: "reporting.export",
    category: "reporting",
    description: "Export and download reports (PDF, CSV)",
  },
  {
    key: "reporting.approve",
    category: "reporting",
    description: "Approve reports for insurer submission",
  },
  {
    key: "reporting.delete",
    category: "reporting",
    description: "Delete inspection reports",
  },

  // ai family
  {
    key: "ai.use_basic",
    category: "ai",
    description: "Use RestoreAssist AI (Gemma self-hosted tier)",
  },
  {
    key: "ai.use_premium",
    category: "ai",
    description: "Use premium BYOK AI features (Claude, GPT, Gemini)",
  },
  {
    key: "ai.configure_byok",
    category: "ai",
    description: "Configure BYOK API keys for the workspace",
  },
  {
    key: "ai.view_usage",
    category: "ai",
    description: "View AI usage statistics and cost dashboard",
  },
] as const;

type PermissionKey = (typeof PERMISSIONS)[number]["key"];

// ── Role definitions ───────────────────────────────────────────────────────

const SYSTEM_ROLES: Array<{
  name: string;
  description: string;
  permissions: PermissionKey[];
}> = [
  {
    name: "Owner",
    description:
      "Full control of the workspace. Can manage billing, delete the workspace, and configure all settings.",
    permissions: [
      "membership.invite",
      "membership.remove",
      "membership.view",
      "membership.role.assign",
      "workspace.view",
      "workspace.settings",
      "workspace.billing",
      "workspace.delete",
      "reporting.create",
      "reporting.view",
      "reporting.export",
      "reporting.approve",
      "reporting.delete",
      "ai.use_basic",
      "ai.use_premium",
      "ai.configure_byok",
      "ai.view_usage",
    ],
  },
  {
    name: "Manager",
    description:
      "Day-to-day operations management. Can invite/remove members, manage reports, and use AI. Cannot change billing or delete the workspace.",
    permissions: [
      "membership.invite",
      "membership.remove",
      "membership.view",
      "membership.role.assign",
      "workspace.view",
      "reporting.create",
      "reporting.view",
      "reporting.export",
      "reporting.approve",
      "reporting.delete",
      "ai.use_basic",
      "ai.use_premium",
      "ai.view_usage",
    ],
  },
  {
    name: "Technician",
    description:
      "Field technician. Can create and view inspection reports and use basic AI features. Read-only access to workspace and member list.",
    permissions: [
      "membership.view",
      "workspace.view",
      "reporting.create",
      "reporting.view",
      "reporting.export",
      "ai.use_basic",
    ],
  },
];

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏢 RestoreAssist — Workspace System Seed [RA-412]");
  console.log("─".repeat(50));

  // 1. Upsert all permissions
  console.log(`\n⬆  Seeding ${PERMISSIONS.length} permissions...`);
  const permMap = new Map<string, string>(); // key → id

  for (const perm of PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description, category: perm.category },
      create: {
        key: perm.key,
        category: perm.category,
        description: perm.description,
      },
    });
    permMap.set(perm.key, record.id);
    console.log(`  ✓ ${perm.key}`);
  }

  // 2. Upsert system roles and bind permissions
  console.log(`\n⬆  Seeding ${SYSTEM_ROLES.length} system roles...`);

  for (const roleDef of SYSTEM_ROLES) {
    // Upsert the role (system roles have workspaceId = null)
    const existingRole = await prisma.workspaceRole.findFirst({
      where: { name: roleDef.name, workspaceId: null, isSystem: true },
    });

    let roleId: string;
    if (existingRole) {
      await prisma.workspaceRole.update({
        where: { id: existingRole.id },
        data: { description: roleDef.description },
      });
      roleId = existingRole.id;
      console.log(`  ↻ ${roleDef.name} (updated)`);
    } else {
      const role = await prisma.workspaceRole.create({
        data: {
          name: roleDef.name,
          description: roleDef.description,
          isSystem: true,
          workspaceId: null,
        },
      });
      roleId = role.id;
      console.log(`  ✓ ${roleDef.name} (created)`);
    }

    // Bind permissions to role (idempotent)
    for (const permKey of roleDef.permissions) {
      const permId = permMap.get(permKey);
      if (!permId) throw new Error(`Permission not found: ${permKey}`);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permId } },
        update: {},
        create: { roleId, permissionId: permId },
      });
    }
    console.log(`    └─ ${roleDef.permissions.length} permissions bound`);
  }

  console.log("\n✅ Workspace system seed complete.");
  console.log("─".repeat(50));
  console.log("  System roles created:  Owner, Manager, Technician");
  console.log("  Permission families:   membership, workspace, reporting, ai");
  console.log(`  Total permissions:     ${PERMISSIONS.length}`);
  console.log(
    "\nRun 'npx prisma db push' if schema has changed, then re-run this seed.",
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
