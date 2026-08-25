-- Physical database identity for deploy verification. This is deliberately a
-- persistent database row, not an environment echo: both DIRECT_URL and the
-- runtime pooler must read the same marker to prove they terminate on the
-- same PostgreSQL instance even when both use database=postgres/schema=public.
CREATE TABLE "DatabaseInstanceSentinel" (
  "singleton" BOOLEAN NOT NULL DEFAULT true,
  "instanceId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DatabaseInstanceSentinel_pkey" PRIMARY KEY ("singleton"),
  CONSTRAINT "DatabaseInstanceSentinel_instanceId_key" UNIQUE ("instanceId"),
  CONSTRAINT "DatabaseInstanceSentinel_singleton_check" CHECK ("singleton" = true)
);

INSERT INTO "DatabaseInstanceSentinel" ("singleton") VALUES (true);

-- Server/service-role-only operational metadata. Keep no client policy: RLS
-- default-deny prevents PostgREST/browser access while Prisma's service
-- connection can supply the deployment-health check.
ALTER TABLE "DatabaseInstanceSentinel" ENABLE ROW LEVEL SECURITY;
