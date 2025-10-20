-- CreateTable: organizations (HOTFIX for Ascora migration)
-- This fixes the missing organizations table that blocks Ascora integration

-- Drop partial Ascora tables first
DROP TABLE IF EXISTS ascora_sync_schedules CASCADE;
DROP TABLE IF EXISTS ascora_sync_logs CASCADE;
DROP TABLE IF EXISTS ascora_invoices CASCADE;
DROP TABLE IF EXISTS ascora_customers CASCADE;
DROP TABLE IF EXISTS ascora_jobs CASCADE;
DROP TABLE IF EXISTS ascora_integrations CASCADE;

-- Create organizations table
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "logo_url" VARCHAR(500),
    "owner_id" TEXT NOT NULL,
    "subscription_tier" VARCHAR(50) NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- Create organization_members table
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "idx_organizations_owner_id" ON "organizations"("owner_id");

-- CreateIndex
CREATE INDEX "idx_org_members_org" ON "organization_members"("organization_id");

-- CreateIndex
CREATE INDEX "idx_org_members_user" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
