/**
 * B3 backfill — encrypt existing plaintext Account OAuth tokens at rest.
 *
 * Run against the target DB (owner-gated; prod is `udooysjajglluvuxkijp`):
 *   DATABASE_URL=... pnpm exec tsx scripts/backfill-encrypt-account-tokens.ts --dry-run
 *   DATABASE_URL=... pnpm exec tsx scripts/backfill-encrypt-account-tokens.ts
 *
 * Idempotent: a token already in cipher shape (iv:authTag:ciphertext) is left
 * alone, so this is safe to re-run and safe to run after new rows have been
 * written by the (already-encrypting) app. No maintenance window needed — the
 * readers have a legacy-plaintext fallback, so rows work before and after.
 *
 * Requires INTEGRATION_ENCRYPTION_KEY (the credential-vault key) in the env —
 * the same 32-byte key the running app uses, or decryption later will fail.
 */
import { PrismaClient } from "@prisma/client";
import {
  encryptAccountTokens,
  isEncryptedToken,
  ACCOUNT_TOKEN_FIELDS,
} from "@/lib/auth/account-tokens";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const accounts = await prisma.account.findMany({
    where: {
      OR: [
        { access_token: { not: null } },
        { refresh_token: { not: null } },
        { id_token: { not: null } },
      ],
    },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      id_token: true,
    },
  });

  let encrypted = 0;
  let alreadyCipher = 0;

  for (const acc of accounts) {
    const needsEncryption = ACCOUNT_TOKEN_FIELDS.some((f) => {
      const v = acc[f];
      return typeof v === "string" && v.length > 0 && !isEncryptedToken(v);
    });

    if (!needsEncryption) {
      alreadyCipher++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.account.update({
        where: { id: acc.id },
        data: encryptAccountTokens({
          access_token: acc.access_token,
          refresh_token: acc.refresh_token,
          id_token: acc.id_token,
        }),
      });
    }
    encrypted++;
  }

  console.log(
    `${DRY_RUN ? "[dry-run] " : ""}Account rows with tokens: ${accounts.length} | ` +
      `${DRY_RUN ? "would encrypt" : "encrypted"}: ${encrypted} | already-ciphertext: ${alreadyCipher}`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill-encrypt-account-tokens] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
