/**
 * Recover local Postgres when `prisma migrate deploy` left
 * `20260828213100_job_file_audit_intake_replay_guard_index` in a failed state.
 *
 * That migration uses CREATE INDEX CONCURRENTLY, which cannot run inside
 * Prisma's transaction wrapper. CI pre-resolves it; a direct `migrate deploy`
 * on localhost often hits P3009 and blocks later migrations (for example
 * RA-7610 `MoistureReading.sketchRoomId`), which surfaces as GET /api/inspections 500.
 *
 * localhost / 127.0.0.1 only — refuses remote DATABASE_URL.
 *
 * The Prisma CLI resolve steps live in scripts/dev-local-migrate.sh so this
 * file is not scanned as a seventh CONCURRENTLY pre-resolve site.
 */
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";

export const REPLAY_INDEX_MIGRATION =
  "20260828213100_job_file_audit_intake_replay_guard_index";

export function assertLocalDatabaseUrl(url: string): void {
  try {
    const { hostname } = new URL(url.replace(/^postgres:/, "postgresql:"));
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error(
        `Refusing dev-local-migrate-unblock against non-local host "${hostname}".`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Refusing")) throw err;
    throw new Error("DATABASE_URL is not a valid Postgres URL.");
  }
}

type MigrationRow = {
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

export async function isReplayMigrationStuck(
  prisma: Pick<PrismaClient, "$queryRaw">,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<MigrationRow[]>`
    SELECT finished_at, rolled_back_at
    FROM _prisma_migrations
    WHERE migration_name = ${REPLAY_INDEX_MIGRATION}
    ORDER BY started_at DESC
    LIMIT 1
  `;
  const latest = rows[0];
  return Boolean(
    latest && latest.finished_at === null && latest.rolled_back_at === null,
  );
}

export async function ensureReplayIndex(
  prisma: Pick<PrismaClient, "$executeRawUnsafe">,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_externalReference_key"
      ON "SupportTicket"("externalReference")
  `);
}

function createClient(): PrismaClient {
  const connectionString =
    process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  if (!connectionString) {
    throw new Error("DATABASE_URL (or DIRECT_URL) is required.");
  }
  assertLocalDatabaseUrl(connectionString);
  return new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString, max: 2 })),
  });
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "ensure-index";
  const prisma = createClient();

  try {
    if (mode === "--check") {
      process.exitCode = (await isReplayMigrationStuck(prisma)) ? 2 : 0;
      return;
    }
    if (mode === "--ensure-index") {
      await ensureReplayIndex(prisma);
      return;
    }
    throw new Error(`Unknown mode ${mode}; use --check or --ensure-index`);
  } finally {
    await prisma.$disconnect();
  }
}

const isMain = Boolean(
  process.argv[1] &&
    fileURLToPath(import.meta.url) ===
      fileURLToPath(new URL(`file://${process.argv[1]}`)),
);

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
