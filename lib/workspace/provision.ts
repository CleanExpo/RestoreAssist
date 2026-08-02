/**
 * RA-415: Workspace Provisioning
 *
 * Minimum viable "you paid → you have a workspace" pipeline.
 * Called from the Stripe webhook after a subscription checkout completes.
 *
 * Steps:
 *  1. Guard — skip if user already owns a workspace for this subscription
 *  2. Create Workspace (status: PROVISIONING)
 *  3. Create WorkspaceMember (owner, ACTIVE)
 *  4. Bind system "Owner" role to the member
 *  5. Seed ProviderConnection placeholders (DISABLED) for all 4 AI providers
 *  6. Mark Workspace status → READY
 *
 * This is NOT the full 10-step autonomous provisioning pipeline.
 * First 20 customers get a supplemental 15-min onboarding call.
 */

import { prisma } from "../prisma";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProvisionWorkspaceInput {
  userId: string;
  userEmail: string;
  userName?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

export interface ProvisionResult {
  workspaceId: string;
  workspaceName: string;
  alreadyExisted: boolean;
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Idempotent workspace provisioning.
 * Safe to call multiple times — returns existing workspace if already provisioned.
 */
export async function provisionWorkspace(
  input: ProvisionWorkspaceInput,
): Promise<ProvisionResult> {
  // Guard: check if user already owns a workspace tied to this subscription
  if (input.stripeSubscriptionId) {
    const existing = await prisma.workspace.findUnique({
      where: { stripeSubscriptionId: input.stripeSubscriptionId },
      select: { id: true, name: true },
    });
    if (existing) {
      return {
        workspaceId: existing.id,
        workspaceName: existing.name,
        alreadyExisted: true,
      };
    }
  }

  // Guard: check if user already owns any workspace (first workspace per owner)
  const existingOwned = await prisma.workspace.findFirst({
    where: { ownerId: input.userId },
    select: { id: true, name: true },
  });
  if (existingOwned) {
    return {
      workspaceId: existingOwned.id,
      workspaceName: existingOwned.name,
      alreadyExisted: true,
    };
  }

  // Derive workspace name and slug from user name or email
  const workspaceName = deriveWorkspaceName(input.userName, input.userEmail);
  const slug = await generateUniqueSlug(workspaceName);

  // Run provisioning in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create workspace at PROVISIONING status
    const workspace = await tx.workspace.create({
      data: {
        name: workspaceName,
        slug,
        ownerId: input.userId,
        status: "PROVISIONING",
        stripeCustomerId: input.stripeCustomerId ?? undefined,
        stripeSubscriptionId: input.stripeSubscriptionId ?? undefined,
      },
    });

    // 2. Create owner WorkspaceMember
    const member = await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: input.userId,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });

    // 3. Find system "Owner" role (workspaceId IS NULL, isSystem = true)
    const ownerRole = await tx.workspaceRole.findFirst({
      where: { name: "Owner", isSystem: true, workspaceId: null },
      select: { id: true },
    });

    if (ownerRole) {
      await tx.memberRoleBinding.create({
        data: {
          memberId: member.id,
          roleId: ownerRole.id,
        },
      });
    } else {
      console.warn(
        `[provisionWorkspace] System Owner role not found — role binding skipped for workspace ${workspace.id}`,
      );
    }

    // 4. Seed ProviderConnection placeholders (DISABLED) for all AI providers
    // These are placeholders — users configure real keys during onboarding call
    const providers = ["ANTHROPIC", "OPENAI", "GOOGLE", "GEMMA"] as const;
    await tx.providerConnection.createMany({
      data: providers.map((provider) => ({
        workspaceId: workspace.id,
        provider,
        status: "DISABLED" as const,
        encryptedCredentials: "", // Empty until configured
        createdByMemberId: member.id,
      })),
      skipDuplicates: true,
    });

    // 5. Promote to READY
    await tx.workspace.update({
      where: { id: workspace.id },
      data: { status: "READY" },
    });

    return workspace;
  });

  console.log(
    `✅ WORKSPACE PROVISIONED: "${result.name}" (${result.id}) for user ${input.userId}`,
  );

  return {
    workspaceId: result.id,
    workspaceName: result.name,
    alreadyExisted: false,
  };
}

/**
 * Ensure the user has a READY workspace they can configure (BYOK, settings).
 *
 * Signup historically created an Organization without calling
 * `provisionWorkspace`, so setup step "Add your AI key" hit
 * `checkPaymentGate` → 402 NO_WORKSPACE. This helper is the idempotent
 * bridge for that gap (and for any future caller that needs a workspace
 * before Stripe webhook wiring exists).
 */
export async function ensureWorkspaceForUser(
  userId: string,
): Promise<ProvisionResult | null> {
  const existingOwned = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    select: { id: true, name: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  if (existingOwned) {
    // Incomplete provision runs can leave PROVISIONING forever — promote.
    if (existingOwned.status === "PROVISIONING") {
      await prisma.workspace.update({
        where: { id: existingOwned.id },
        data: { status: "READY" },
      });
    }
    await ensureOwnerMembership(existingOwned.id, userId);
    return {
      workspaceId: existingOwned.id,
      workspaceName: existingOwned.name,
      alreadyExisted: true,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user?.email) return null;

  return provisionWorkspace({
    userId,
    userEmail: user.email,
    userName: user.name,
  });
}

/**
 * Repair missing owner membership / Owner role binding on an existing workspace.
 * Safe to call repeatedly.
 */
async function ensureOwnerMembership(
  workspaceId: string,
  userId: string,
): Promise<void> {
  let member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: {
      id: true,
      status: true,
      roleBindings: { select: { id: true }, take: 1 },
    },
  });

  if (!member) {
    member = await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        roleBindings: { select: { id: true }, take: 1 },
      },
    });
  } else if (member.status !== "ACTIVE") {
    await prisma.workspaceMember.update({
      where: { id: member.id },
      data: { status: "ACTIVE", joinedAt: new Date() },
    });
  }

  if (member.roleBindings.length > 0) return;

  const ownerRole = await prisma.workspaceRole.findFirst({
    where: { name: "Owner", isSystem: true, workspaceId: null },
    select: { id: true },
  });
  if (!ownerRole) {
    console.warn(
      `[ensureOwnerMembership] System Owner role not found — role binding skipped for workspace ${workspaceId}`,
    );
    return;
  }

  await prisma.memberRoleBinding.upsert({
    where: {
      memberId_roleId: { memberId: member.id, roleId: ownerRole.id },
    },
    create: {
      memberId: member.id,
      roleId: ownerRole.id,
    },
    update: {},
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derive a human-readable workspace name from user name or email.
 * Examples: "Sarah Connor" → "Sarah Connor's Workspace"
 *           "sarah@acme.com.au" → "Acme's Workspace"
 */
function deriveWorkspaceName(
  name: string | null | undefined,
  email: string,
): string {
  if (name && name.trim().length > 0) {
    const firstName = name.trim().split(/\s+/)[0];
    return `${firstName}'s Workspace`;
  }
  // Fall back to email domain (strip TLD, capitalise)
  const domain = email.split("@")[1] ?? email;
  const company = domain
    .split(".")[0]
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return `${company}'s Workspace`;
}

/**
 * Generate a unique URL-safe slug for the workspace.
 * Appends a random suffix if slug is already taken.
 */
async function generateUniqueSlug(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  // Try base slug first
  const existing = await prisma.workspace.findUnique({
    where: { slug: base },
    select: { id: true },
  });
  if (!existing) return base;

  // Append random 4-char suffix
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}
