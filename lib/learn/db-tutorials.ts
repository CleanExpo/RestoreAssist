/**
 * Setup-aware learning resources for connecting a tenant database (gate G1).
 *
 * Maps the client's chosen DB type to a curated set of "how to get your
 * connection string" resources shown in the learning area beside the explainer
 * videos. Seeded with real official-vendor documentation; `kind: "video"` slots
 * are added by owner curation with real IDs (we never fabricate video links).
 * Maintenance: prefer official-vendor sources and periodically link-check.
 */
export type DbType = "supabase" | "neon" | "aws-rds" | "self-hosted" | "generic";

export interface TutorialLink {
  title: string;
  url: string;
  kind: "doc" | "video";
  /** The authoritative source (official vendor / channel). */
  source: string;
}

const REGISTRY: Record<DbType, TutorialLink[]> = {
  supabase: [
    {
      title: "Connecting to your Postgres database",
      url: "https://supabase.com/docs/guides/database/connecting-to-postgres",
      kind: "doc",
      source: "Supabase Docs",
    },
  ],
  neon: [
    {
      title: "Connect from any application",
      url: "https://neon.tech/docs/connect/connect-from-any-app",
      kind: "doc",
      source: "Neon Docs",
    },
  ],
  "aws-rds": [
    {
      title: "Connecting to a PostgreSQL DB instance",
      url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ConnectToPostgreSQLInstance.html",
      kind: "doc",
      source: "AWS RDS User Guide",
    },
  ],
  "self-hosted": [
    {
      title: "Connection strings (libpq)",
      url: "https://www.postgresql.org/docs/current/libpq-connect.html",
      kind: "doc",
      source: "PostgreSQL Documentation",
    },
  ],
  generic: [
    {
      title: "PostgreSQL connection strings",
      url: "https://www.postgresql.org/docs/current/libpq-connect.html",
      kind: "doc",
      source: "PostgreSQL Documentation",
    },
  ],
};

function normalise(raw: string): DbType {
  const key = (raw ?? "").trim().toLowerCase();
  return (key in REGISTRY ? key : "generic") as DbType;
}

export function getTutorialsForDbType(dbType: string): TutorialLink[] {
  return REGISTRY[normalise(dbType)];
}
