/**
 * Seed a single QA account that can reach every area of the application.
 *
 * WHY THIS EXISTS ALONGSIDE THE THREE SEEDS THAT ALREADY DO SOMETHING SIMILAR.
 * `scripts/seed-e2e-user.ts`, `scripts/provision-reviewer-account.ts` and
 * `scripts/seed-playstore-test-account.ts` each build an account for one job,
 * and each stops short of full reach in a different way:
 *
 *   seed-e2e-user            ADMIN, but TRIAL, APPRENTICE nav, and 6 of the 7
 *                            add-on SKUs — TECHNICIAN_SEATS was added later and
 *                            the hardcoded list never caught up.
 *   provision-reviewer       ADMIN, TRIAL with 30 credits, no entitlements.
 *   seed-playstore-test      USER role. Cannot see admin surfaces at all.
 *
 * The four things that actually decide what a signed-in account can reach, and
 * which no existing seed sets together:
 *
 *   1. role = ADMIN                 top of the Role enum (USER | ADMIN | MANAGER)
 *   2. experienceMode = EXPERIENCED APPRENTICE renders Simple nav, which HIDES
 *                                   navigation. An APPRENTICE admin has every
 *                                   permission and still cannot see the pages.
 *   3. every AddonSku entitled      requireAddon() returns 402 per missing SKU
 *   4. a subscription that is not   TRIAL + a past trialEndsAt redirects to
 *      expiring                     /billing/upgrade?reason=trial-expired
 *
 * The SKU list is read from the generated Prisma enum at run time rather than
 * typed out. That is the specific bug in seed-e2e-user: a hand-maintained list
 * silently stops being complete the day someone adds a SKU, and nothing fails —
 * the account just quietly loses a surface. Enumerating cannot drift.
 *
 * USAGE — against a local or ephemeral database:
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/seed-full-access-account.ts
 *
 * The password is generated and printed ONCE. It is never written to a file and
 * never committed. Capture it from the terminal into your password manager.
 *
 * OPTIONAL REAL INTEGRATION CREDENTIALS. Supply them as environment variables
 * and they are encrypted with lib/credential-vault (AES-256-GCM) before they
 * touch the database, exactly as the live OAuth callback stores them. One token
 * variable per provider in the IntegrationProvider enum, plus the tenant-style
 * discriminator each vendor uses:
 *
 *   SEED_XERO_TOKEN=...        SEED_XERO_TENANT_ID=...
 *   SEED_QUICKBOOKS_TOKEN=...  SEED_QUICKBOOKS_REALM_ID=...
 *   SEED_MYOB_TOKEN=...        SEED_MYOB_TENANT_ID=...
 *   SEED_SERVICEM8_TOKEN=...   SEED_SERVICEM8_COMPANY_ID=...
 *   SEED_ASCORA_TOKEN=...      SEED_ASCORA_COMPANY_ID=...
 *
 * Stripe is deliberately absent. It is not an Integration row — IntegrationProvider
 * has no STRIPE member. The platform key is the STRIPE_SECRET_KEY environment
 * variable read by lib/stripe.ts, and the per-client case is Stripe Connect on the
 * client's own account under the PAYMENTS add-on. Neither is seedable here, and a
 * seeder that pretended otherwise would write a row nothing reads.
 *
 * The script prints WHICH integrations it wired and a truncated SHA-256 of each
 * value so you can confirm the right secret landed. It never prints the secret,
 * and it never reads a secret manager itself — you decide what enters its env.
 *
 * USE TEST-MODE CREDENTIALS. A full-access login wired to live keys can charge a
 * real card, email a real customer and post to a real Xero ledger, and it is the
 * one account most likely to be handed around. Stripe issues `sk_test_` keys and
 * Xero publishes a demo company for exactly this. The script warns on a key that
 * looks live; it does not refuse, because that is your call, not its.
 */
import { PrismaClient, AddonSku } from "@prisma/client";
import type { IntegrationProvider } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { encrypt } from "../lib/credential-vault";

// Prisma 7's pg driver adapter must be passed explicitly; a bare
// `new PrismaClient()` throws PrismaClientInitializationError. This is what
// broke the Sketch E2E seed step (RA-7079), so mirror lib/prisma.ts.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

// A seeder that writes an ADMIN account with a known password is the last thing
// that should run against production by accident. Refuse anything that is not
// plainly a local host unless the caller says otherwise in so many words.
function looksLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
if (!looksLocal(connectionString) && process.env.ALLOW_NON_LOCAL_DB !== "1") {
  console.error(
    [
      "Refusing to run: DATABASE_URL does not point at localhost.",
      "",
      "This creates an ADMIN account with a password printed to the terminal.",
      "Against production that is an owner-gated action (.claude/RULES.md 29),",
      "and it is not something a script should do because nobody said no.",
      "",
      "If you are the owner and you mean it:  ALLOW_NON_LOCAL_DB=1",
    ].join("\n"),
  );
  process.exit(2);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString, max: 2 })),
});

const EMAIL = process.env.FULL_ACCESS_EMAIL ?? "qa-full-access@restoreassist.app";

/** 20 chars, mixed classes — clears the >=12 floor in the register route. */
function generatePassword(): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = alpha + digits + symbols;
  const b = crypto.randomBytes(20);
  let out = alpha[b[0] % alpha.length];
  out += alpha[b[1] % alpha.length].toUpperCase();
  out += digits[b[2] % digits.length];
  out += symbols[b[3] % symbols.length];
  for (let i = 4; i < 20; i++) out += all[b[i] % all.length];
  return out;
}

/** Identify a secret without disclosing it. */
function fingerprint(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

/** Stripe and most vendors prefix live keys distinguishably. Warn, do not block. */
function looksLive(value: string): boolean {
  return /^(sk|pk|rk)_live_/.test(value) || /^live_/.test(value);
}

async function main() {
  const password = process.env.FULL_ACCESS_PASSWORD ?? generatePassword();
  const generated = !process.env.FULL_ACCESS_PASSWORD;
  const hashedPassword = await bcrypt.hash(password, 12);
  const farFuture = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

  // ── User ──────────────────────────────────────────────────────────────────
  // subscriptionStatus ACTIVE with a far-future subscriptionEndsAt, and
  // trialEndsAt set as well: whichever gate a surface happens to read, it reads
  // a date that has not passed. TRIAL alone is what leaves the e2e account
  // stuck on /billing/upgrade once its year runs out.
  const access = {
    password: hashedPassword,
    role: "ADMIN",
    experienceMode: "EXPERIENCED", // APPRENTICE hides nav — see header
    isJuniorTechnician: false, // ring-fence; blocks Progress transitions
    twoFactorEnabled: false, // a stale row with 2FA on cannot be signed into
    emailVerified: new Date(),
    subscriptionStatus: "ACTIVE",
    trialEndsAt: farFuture,
    subscriptionEndsAt: farFuture,
    creditsRemaining: 999_999,
    quickFillCreditsRemaining: 999_999,
  } as const;

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: access,
    create: {
      email: EMAIL,
      name: "QA Full Access",
      totalCreditsUsed: 0,
      totalQuickFillUsed: 0,
      ...access,
    },
  });

  // ── Organisation ──────────────────────────────────────────────────────────
  // setupCompletedAt + a business profile, or middleware's setup-gate 307s every
  // /dashboard request to /setup and the account looks broken rather than gated.
  const existingOrg = await prisma.organization.findFirst({
    where: { ownerId: user.id },
  });
  const orgData = {
    name: "QA Full Access Organisation",
    ownerId: user.id,
    legalName: "QA Full Access Pty Ltd",
    abn: "53004085616", // valid ABN checksum
    state: "NSW",
    setupCompletedAt: new Date(),
  };
  const org = existingOrg
    ? await prisma.organization.update({
        where: { id: existingOrg.id },
        data: orgData,
      })
    : await prisma.organization.create({ data: orgData });
  await prisma.user.update({
    where: { id: user.id },
    data: { organizationId: org.id },
  });

  // ── Workspace ─────────────────────────────────────────────────────────────
  let workspace = await prisma.workspace.findFirst({
    where: { ownerId: user.id },
    select: { id: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  if (!workspace) {
    let slug = "qa-full-access";
    let n = 0;
    while (await prisma.workspace.findUnique({ where: { slug } })) {
      n += 1;
      slug = `qa-full-access-${n}`;
    }
    workspace = await prisma.workspace.create({
      data: {
        name: "QA Full Access Workspace",
        slug,
        ownerId: user.id,
        status: "READY",
      },
      select: { id: true, status: true },
    });
  } else if (workspace.status !== "READY") {
    workspace = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { status: "READY" },
      select: { id: true, status: true },
    });
  }
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, userId: user.id },
    select: { id: true },
  });
  if (membership) {
    await prisma.workspaceMember.update({
      where: { id: membership.id },
      data: { status: "ACTIVE" },
    });
  } else {
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
  }

  // ── Entitlements ──────────────────────────────────────────────────────────
  // Enumerated, never listed. See the header: a hand-kept list is how
  // TECHNICIAN_SEATS went missing from the e2e account without any check failing.
  const skus = Object.values(AddonSku);
  for (const sku of skus) {
    await prisma.featureEntitlement.upsert({
      where: { workspaceId_sku: { workspaceId: workspace.id, sku } },
      create: { workspaceId: workspace.id, sku, active: true },
      update: { active: true },
    });
  }

  // ── Optional integration credentials ──────────────────────────────────────
  // Encrypted before they reach the database, same as the OAuth callback path.
  const wired: string[] = [];
  const warned: string[] = [];

  const workspaceId = workspace.id;

  async function connect(
    provider: IntegrationProvider,
    name: string,
    secret: string | undefined,
    extra: { tenantId?: string; realmId?: string; companyId?: string } = {},
  ) {
    if (!secret?.trim()) return;
    if (looksLive(secret)) warned.push(name);
    const existing = await prisma.integration.findFirst({
      where: { userId: user.id, workspaceId, provider },
      select: { id: true },
    });
    const data = {
      name,
      status: "CONNECTED" as const,
      accessToken: encrypt(secret),
      ...(extra.tenantId?.trim() ? { tenantId: extra.tenantId } : {}),
      ...(extra.realmId?.trim() ? { realmId: extra.realmId } : {}),
      ...(extra.companyId?.trim() ? { companyId: extra.companyId } : {}),
    };
    if (existing) {
      await prisma.integration.update({ where: { id: existing.id }, data });
    } else {
      await prisma.integration.create({
        data: { userId: user.id, workspaceId, provider, ...data },
      });
    }
    wired.push(`${name} (sha256:${fingerprint(secret)})`);
  }

  await connect("XERO", "Xero", process.env.SEED_XERO_TOKEN, {
    tenantId: process.env.SEED_XERO_TENANT_ID,
  });
  await connect("QUICKBOOKS", "QuickBooks", process.env.SEED_QUICKBOOKS_TOKEN, {
    realmId: process.env.SEED_QUICKBOOKS_REALM_ID,
  });
  await connect("MYOB", "MYOB", process.env.SEED_MYOB_TOKEN, {
    tenantId: process.env.SEED_MYOB_TENANT_ID,
  });
  await connect("SERVICEM8", "ServiceM8", process.env.SEED_SERVICEM8_TOKEN, {
    companyId: process.env.SEED_SERVICEM8_COMPANY_ID,
  });
  await connect("ASCORA", "Ascora", process.env.SEED_ASCORA_TOKEN, {
    companyId: process.env.SEED_ASCORA_COMPANY_ID,
  });

  // ── Report ────────────────────────────────────────────────────────────────
  console.log("\n=== Full-access QA account ===");
  console.log(`  email      ${EMAIL}`);
  console.log(
    generated
      ? `  password   ${password}      <- generated, shown once, not stored`
      : "  password   (taken from FULL_ACCESS_PASSWORD, not printed)",
  );
  console.log(`  user       ${user.id}`);
  console.log(`  org        ${org.id} (setup complete)`);
  console.log(`  workspace  ${workspace.id} (READY)`);
  console.log("  role       ADMIN, EXPERIENCED nav, not junior-ring-fenced");
  console.log("  billing    ACTIVE, far-future end date, 999,999 credits");
  console.log(`  add-ons    ${skus.length}/${skus.length}: ${skus.join(", ")}`);
  console.log(
    wired.length > 0
      ? `  integrations ${wired.join(", ")}`
      : "  integrations none supplied (see the header for the SEED_* variables)",
  );
  if (warned.length > 0) {
    console.log(
      `\n  WARNING: ${warned.join(", ")} look like LIVE keys. This account can` +
        "\n  charge real cards and write to real ledgers. Test-mode keys exist" +
        "\n  for exactly this account.",
    );
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("[seed-full-access-account] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
