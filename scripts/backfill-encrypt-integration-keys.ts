/**
 * RA-6935 backfill — encrypt existing plaintext Ascora / DR-NRPG API keys at rest.
 *
 * Run against the target DB (owner-gated; prod is `udooysjajglluvuxkijp`):
 *   DATABASE_URL=... pnpm exec tsx scripts/backfill-encrypt-integration-keys.ts --dry-run
 *   DATABASE_URL=... pnpm exec tsx scripts/backfill-encrypt-integration-keys.ts
 *
 * Idempotent: a key already in cipher shape (iv:authTag:ciphertext, all hex) is
 * left alone, so this is safe to re-run and safe to run after new rows have been
 * written by the (already-encrypting) connect routes. No maintenance window
 * needed — the readers (ascora/sync, dr-nrpg-liveness) have a legacy-plaintext
 * fallback, so rows work before and after.
 *
 * Requires the credential-vault key in the env (CREDENTIAL_ENCRYPTION_KEY,
 * INTEGRATION_ENCRYPTION_KEY, or NEXTAUTH_SECRET) — the same 32-byte key the
 * running app uses, or decryption later will fail.
 *
 * Scope: only encrypts the API-key columns (AscoraIntegration.apiKey and
 * DrNrpgIntegration.drNrpgApiKey). Webhook secrets are out of scope for RA-6935.
 */
import { PrismaClient } from "@prisma/client";
import { encrypt } from "@/lib/credential-vault";
import { isEncryptedToken } from "@/lib/auth/account-tokens";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

async function backfillModel(
  label: string,
  rows: Array<{ id: string; key: string | null }>,
  update: (id: string, cipher: string) => Promise<unknown>,
): Promise<void> {
  let encrypted = 0;
  let alreadyCipher = 0;

  for (const row of rows) {
    const value = row.key;
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    if (isEncryptedToken(value)) {
      alreadyCipher++;
      continue;
    }
    if (!DRY_RUN) {
      await update(row.id, encrypt(value));
    }
    encrypted++;
  }

  console.log(
    `${DRY_RUN ? "[dry-run] " : ""}${label} rows: ${rows.length} | ` +
      `${DRY_RUN ? "would encrypt" : "encrypted"}: ${encrypted} | already-ciphertext: ${alreadyCipher}`,
  );
}

async function main() {
  const ascora = await (prisma as any).ascoraIntegration.findMany({
    select: { id: true, apiKey: true },
  });
  await backfillModel(
    "AscoraIntegration",
    ascora.map((r: { id: string; apiKey: string | null }) => ({
      id: r.id,
      key: r.apiKey,
    })),
    (id, cipher) =>
      (prisma as any).ascoraIntegration.update({
        where: { id },
        data: { apiKey: cipher },
      }),
  );

  const drNrpg = await (prisma as any).drNrpgIntegration.findMany({
    select: { id: true, drNrpgApiKey: true },
  });
  await backfillModel(
    "DrNrpgIntegration",
    drNrpg.map((r: { id: string; drNrpgApiKey: string | null }) => ({
      id: r.id,
      key: r.drNrpgApiKey,
    })),
    (id, cipher) =>
      (prisma as any).drNrpgIntegration.update({
        where: { id },
        data: { drNrpgApiKey: cipher },
      }),
  );
}

main()
  .catch((err) => {
    console.error("[backfill-encrypt-integration-keys] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
