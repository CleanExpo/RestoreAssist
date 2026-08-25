/**
 * Encrypt legacy EmailConnection OAuth tokens and validate the encrypted-only
 * database constraints.
 *
 * This is deliberately harder to invoke than a normal maintenance script:
 * it requires a direct database URL, exact host/database/schema expectations,
 * the migration-owned database fingerprint, and an explicit mode.
 *
 * Inspect only (no writes):
 *   npx tsx scripts/backfill-encrypt-email-connections.ts --dry-run
 *
 * Owner-approved mutation:
 *   npx tsx scripts/backfill-encrypt-email-connections.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  decryptEmailConnectionTokens,
  encryptEmailConnectionTokens,
  isEncryptedEmailConnectionToken,
} from "@/lib/email/email-connection-tokens";
import { assertDirectDatabaseUrl } from "./assert-direct-database-url.mjs";
import { assertExpectedLogicalIdentity } from "./verify-database-identity.mjs";
import { pgMigrateSslOption } from "./lib/pg-ssl-for-migrate.mjs";

const ACCESS_CONSTRAINT = '"EmailConnection_accessToken_ciphertext_check"';
const REFRESH_CONSTRAINT = '"EmailConnection_refreshToken_ciphertext_check"';

export interface EmailConnectionBackfillRow {
  id: string;
  accessToken: string;
  refreshToken: string;
}

export interface EmailConnectionBackfillStore {
  findMany(): Promise<EmailConnectionBackfillRow[]>;
  updateIfUnchanged(
    before: EmailConnectionBackfillRow,
    encrypted: Pick<EmailConnectionBackfillRow, "accessToken" | "refreshToken">,
  ): Promise<number>;
  validateConstraints(): Promise<void>;
}

export interface EmailConnectionBackfillResult {
  total: number;
  alreadyEncrypted: number;
  encrypted: number;
  invalid: number;
  dryRun: boolean;
}

export function parseMode(argv: string[]): "dry-run" | "apply" {
  const dryRun = argv.includes("--dry-run");
  const apply = argv.includes("--apply");
  if (dryRun === apply) {
    throw new Error("Specify exactly one of --dry-run or --apply");
  }
  return apply ? "apply" : "dry-run";
}

function rowIsEncrypted(row: EmailConnectionBackfillRow): boolean {
  return (
    isEncryptedEmailConnectionToken(row.accessToken) &&
    isEncryptedEmailConnectionToken(row.refreshToken)
  );
}

function rowCanBeBackfilled(row: EmailConnectionBackfillRow): boolean {
  return row.accessToken.length > 0 && row.refreshToken.length > 0;
}

export async function backfillEmailConnectionTokens(
  store: EmailConnectionBackfillStore,
  mode: "dry-run" | "apply",
): Promise<EmailConnectionBackfillResult> {
  const rows = await store.findMany();
  let alreadyEncrypted = 0;
  let encrypted = 0;
  let invalid = 0;

  for (const row of rows) {
    if (rowIsEncrypted(row)) {
      // Shape alone is not proof. Before validating the DB constraints, prove
      // every existing ciphertext authenticates under the configured key.
      if (mode === "apply") decryptEmailConnectionTokens(row);
      alreadyEncrypted++;
      continue;
    }
    if (!rowCanBeBackfilled(row)) {
      invalid++;
      continue;
    }

    if (mode === "apply") {
      const encryptedTokens = encryptEmailConnectionTokens({
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
      });
      const updated = await store.updateIfUnchanged(row, encryptedTokens);
      if (updated !== 1) {
        throw new Error(
          "EmailConnection changed concurrently; no constraints were validated. Re-run the backfill.",
        );
      }
    }
    encrypted++;
  }

  if (invalid > 0) {
    throw new Error(
      `${invalid} EmailConnection row(s) have empty credentials and require provider reconnection`,
    );
  }

  if (mode === "apply") {
    const remaining = (await store.findMany()).filter(
      (row) => !rowIsEncrypted(row),
    );
    if (remaining.length > 0) {
      throw new Error(
        `${remaining.length} EmailConnection row(s) remain outside the encrypted token contract`,
      );
    }
    await store.validateConstraints();
  }

  return {
    total: rows.length,
    alreadyEncrypted,
    encrypted,
    invalid,
    dryRun: mode === "dry-run",
  };
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertDedicatedVaultKey(): void {
  if (
    !process.env.CREDENTIAL_ENCRYPTION_KEY &&
    !process.env.INTEGRATION_ENCRYPTION_KEY
  ) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY or INTEGRATION_ENCRYPTION_KEY is required; NEXTAUTH_SECRET fallback is forbidden for this backfill",
    );
  }
}

async function assertDatabaseIdentity(connectionString: string): Promise<void> {
  const ssl = pgMigrateSslOption(connectionString);
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 20_000,
    ...(ssl ? { ssl } : {}),
  });
  try {
    const result = await pool.query(`
      SELECT current_database() AS database_name,
             current_schema() AS schema_name,
             (
               SELECT "instanceId"::text
               FROM "DatabaseInstanceSentinel"
               WHERE "singleton" = true
             ) AS instance_sentinel
    `);
    if (result.rows.length !== 1) {
      throw new Error("database identity query did not return exactly one row");
    }
    const fingerprint = assertExpectedLogicalIdentity(
      result.rows[0],
      requireEnvironment("EXPECTED_DIRECT_DATABASE_NAME"),
      requireEnvironment("EXPECTED_DIRECT_DATABASE_SCHEMA"),
      "DIRECT_URL",
    );
    if (fingerprint !== requireEnvironment("EXPECTED_DATABASE_FINGERPRINT")) {
      throw new Error("DIRECT_URL database fingerprint mismatch");
    }
  } finally {
    await pool.end();
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let prisma: PrismaClient | undefined;
  try {
    const mode = parseMode(argv);
    const directUrl = requireEnvironment("DIRECT_URL");
    assertDirectDatabaseUrl(
      directUrl,
      requireEnvironment("EXPECTED_DIRECT_DATABASE_HOST"),
      requireEnvironment("EXPECTED_DIRECT_DATABASE_NAME"),
      requireEnvironment("EXPECTED_DIRECT_DATABASE_SCHEMA"),
    );
    if (mode === "apply") assertDedicatedVaultKey();
    await assertDatabaseIdentity(directUrl);

    const ssl = pgMigrateSslOption(directUrl);
    const pool = new Pool({
      connectionString: directUrl,
      max: 1,
      connectionTimeoutMillis: 20_000,
      ...(ssl ? { ssl } : {}),
    });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const store: EmailConnectionBackfillStore = {
      findMany: () =>
        prisma!.emailConnection.findMany({
          select: { id: true, accessToken: true, refreshToken: true },
        }),
      updateIfUnchanged: async (before, encrypted) => {
        const result = await prisma!.emailConnection.updateMany({
          where: {
            id: before.id,
            accessToken: before.accessToken,
            refreshToken: before.refreshToken,
          },
          data: encrypted,
        });
        return result.count;
      },
      validateConstraints: async () => {
        await prisma!.$executeRawUnsafe(
          `ALTER TABLE public."EmailConnection" VALIDATE CONSTRAINT ${ACCESS_CONSTRAINT}`,
        );
        await prisma!.$executeRawUnsafe(
          `ALTER TABLE public."EmailConnection" VALIDATE CONSTRAINT ${REFRESH_CONSTRAINT}`,
        );
      },
    };

    const result = await backfillEmailConnectionTokens(store, mode);
    console.log(
      `${result.dryRun ? "[dry-run] " : ""}EmailConnection rows: ${result.total} | ` +
        `${result.dryRun ? "would encrypt" : "encrypted"}: ${result.encrypted} | ` +
        `already encrypted: ${result.alreadyEncrypted}`,
    );
    if (!result.dryRun) {
      console.log(
        "[email-connection-backfill] PASS: encrypted-only constraints validated",
      );
    }
    return 0;
  } catch (error) {
    console.error(
      `[email-connection-backfill] ERROR: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 1;
  } finally {
    await prisma?.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
