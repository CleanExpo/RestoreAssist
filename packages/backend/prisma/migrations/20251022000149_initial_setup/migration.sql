-- CreateEnum
CREATE TYPE "DamageType" AS ENUM ('Water', 'Fire', 'Storm', 'Flood', 'Mould', 'Biohazard', 'Impact', 'Other');

-- CreateEnum
CREATE TYPE "AustralianState" AS ENUM ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT');

-- CreateTable
CREATE TABLE "reports" (
    "report_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "property_address" TEXT NOT NULL,
    "damage_type" "DamageType" NOT NULL,
    "damage_description" TEXT NOT NULL,
    "state" "AustralianState" NOT NULL,
    "summary" TEXT NOT NULL,
    "scope_of_work" JSONB NOT NULL,
    "itemized_estimate" JSONB NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,
    "compliance_notes" JSONB NOT NULL,
    "authority_to_proceed" TEXT NOT NULL,
    "client_name" VARCHAR(255),
    "insurance_company" VARCHAR(255),
    "claim_number" VARCHAR(100),
    "generated_by" VARCHAR(100) NOT NULL DEFAULT 'RestoreAssist AI',
    "model" VARCHAR(100) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("report_id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "logo_url" VARCHAR(500),
    "owner_id" UUID NOT NULL,
    "subscription_tier" VARCHAR(50) NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ascora_integrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "api_url" VARCHAR(500) NOT NULL,
    "api_token" TEXT NOT NULL,
    "company_code" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMPTZ(6),
    "sync_status" VARCHAR(50) NOT NULL DEFAULT 'idle',
    "webhook_token" VARCHAR(255),
    "sync_settings" JSONB NOT NULL DEFAULT '{"sync_customers": true, "sync_jobs": true, "sync_invoices": true}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ascora_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ascora_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "report_id" UUID,
    "ascora_job_id" VARCHAR(255) NOT NULL,
    "job_title" VARCHAR(500),
    "customer_id" VARCHAR(255),
    "customer_name" VARCHAR(255),
    "customer_email" VARCHAR(255),
    "customer_phone" VARCHAR(20),
    "job_status" VARCHAR(50),
    "description" TEXT,
    "job_address" TEXT,
    "job_type" VARCHAR(50),
    "priority" VARCHAR(20),
    "estimated_cost" DECIMAL(12,2),
    "actual_cost" DECIMAL(12,2),
    "scheduled_date" TIMESTAMPTZ(6),
    "completed_date" TIMESTAMPTZ(6),
    "assigned_to" VARCHAR(255),
    "assigned_to_name" VARCHAR(255),
    "invoice_status" VARCHAR(50),
    "invoice_amount" DECIMAL(12,2),
    "payment_status" VARCHAR(50),
    "custom_fields" JSONB,
    "last_synced_at" TIMESTAMPTZ(6),
    "sync_direction" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ascora_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ascora_customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "ascora_customer_id" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(255),
    "last_name" VARCHAR(255),
    "company_name" VARCHAR(500),
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "mobile" VARCHAR(20),
    "street_address" TEXT,
    "suburb" VARCHAR(255),
    "state" VARCHAR(10),
    "postcode" VARCHAR(10),
    "country" VARCHAR(100),
    "customer_type" VARCHAR(50),
    "billing_address" TEXT,
    "tax_id" VARCHAR(50),
    "notes" TEXT,
    "custom_fields" JSONB,
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ascora_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ascora_invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "ascora_invoice_id" VARCHAR(255) NOT NULL,
    "ascora_job_id" VARCHAR(255),
    "report_id" UUID,
    "customer_id" VARCHAR(255),
    "invoice_number" VARCHAR(50),
    "invoice_date" DATE,
    "due_date" DATE,
    "total_amount" DECIMAL(12,2),
    "paid_amount" DECIMAL(12,2),
    "status" VARCHAR(50),
    "payment_method" VARCHAR(50),
    "payment_date" DATE,
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ascora_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ascora_sync_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "integration_id" UUID,
    "sync_type" VARCHAR(50) NOT NULL,
    "source" VARCHAR(50),
    "target" VARCHAR(50),
    "resource_type" VARCHAR(50),
    "resource_id" UUID,
    "ascora_resource_id" VARCHAR(255),
    "status" VARCHAR(50),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "response_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ascora_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ascora_sync_schedules" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "integration_id" UUID NOT NULL,
    "sync_interval" INTEGER NOT NULL DEFAULT 300,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMPTZ(6),
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ascora_sync_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL,
    "google_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "picture_url" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "locale" VARCHAR(10),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "free_trial_tokens" (
    "token_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "activated_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "reports_remaining" INTEGER DEFAULT 5,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,

    CONSTRAINT "free_trial_tokens_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "device_fingerprints" (
    "fingerprint_id" UUID NOT NULL,
    "user_id" UUID,
    "fingerprint_hash" VARCHAR(64) NOT NULL,
    "device_data" JSONB NOT NULL,
    "trial_count" INTEGER NOT NULL DEFAULT 0,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" TEXT,

    CONSTRAINT "device_fingerprints_pkey" PRIMARY KEY ("fingerprint_id")
);

-- CreateTable
CREATE TABLE "payment_verifications" (
    "verification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "card_fingerprint" VARCHAR(255),
    "card_last4" VARCHAR(4),
    "card_brand" VARCHAR(50),
    "verification_status" VARCHAR(50) NOT NULL,
    "stripe_payment_method_id" VARCHAR(255),
    "amount_cents" INTEGER NOT NULL DEFAULT 100,
    "verification_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failure_reason" TEXT,
    "reuse_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_verifications_pkey" PRIMARY KEY ("verification_id")
);

-- CreateTable
CREATE TABLE "login_sessions" (
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ip_address" INET,
    "country" VARCHAR(100),
    "region" VARCHAR(100),
    "city" VARCHAR(100),
    "timezone" VARCHAR(100),
    "user_agent" TEXT,
    "session_token" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "login_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "trial_fraud_flags" (
    "flag_id" UUID NOT NULL,
    "user_id" UUID,
    "fingerprint_hash" VARCHAR(64),
    "ip_address" INET,
    "flag_type" VARCHAR(100) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "fraud_score" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution_note" TEXT,

    CONSTRAINT "trial_fraud_flags_pkey" PRIMARY KEY ("flag_id")
);

-- CreateTable
CREATE TABLE "trial_usage" (
    "usage_id" UUID NOT NULL,
    "token_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "report_id" UUID,
    "action_type" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "trial_usage_pkey" PRIMARY KEY ("usage_id")
);

-- CreateTable
CREATE TABLE "user_subscriptions" (
    "subscription_id" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "stripe_customer_id" VARCHAR(255),
    "stripe_subscription_id" VARCHAR(255),
    "plan_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "reports_used" INTEGER NOT NULL DEFAULT 0,
    "reports_limit" INTEGER,
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("subscription_id")
);

-- CreateTable
CREATE TABLE "subscription_history" (
    "history_id" SERIAL NOT NULL,
    "subscription_id" VARCHAR(255) NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "old_status" VARCHAR(50),
    "new_status" VARCHAR(50),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateIndex
CREATE INDEX "idx_reports_created_at" ON "reports"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_reports_state" ON "reports"("state");

-- CreateIndex
CREATE INDEX "idx_reports_damage_type" ON "reports"("damage_type");

-- CreateIndex
CREATE INDEX "idx_reports_total_cost" ON "reports"("total_cost" DESC);

-- CreateIndex
CREATE INDEX "idx_reports_client_name" ON "reports"("client_name");

-- CreateIndex
CREATE INDEX "idx_reports_claim_number" ON "reports"("claim_number");

-- CreateIndex
CREATE INDEX "idx_reports_pagination" ON "reports"("created_at" DESC, "report_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "idx_organizations_slug" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "idx_organizations_owner_id" ON "organizations"("owner_id");

-- CreateIndex
CREATE INDEX "idx_org_members_org" ON "organization_members"("organization_id");

-- CreateIndex
CREATE INDEX "idx_org_members_user" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ascora_integrations_api_url_key" ON "ascora_integrations"("api_url");

-- CreateIndex
CREATE INDEX "idx_ascora_org" ON "ascora_integrations"("organization_id");

-- CreateIndex
CREATE INDEX "idx_ascora_active" ON "ascora_integrations"("is_active");

-- CreateIndex
CREATE INDEX "idx_ascora_user" ON "ascora_integrations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ascora_jobs_ascora_job_id_key" ON "ascora_jobs"("ascora_job_id");

-- CreateIndex
CREATE INDEX "idx_ascora_jobs_org" ON "ascora_jobs"("organization_id");

-- CreateIndex
CREATE INDEX "idx_ascora_jobs_report" ON "ascora_jobs"("report_id");

-- CreateIndex
CREATE INDEX "idx_ascora_jobs_ascora_id" ON "ascora_jobs"("ascora_job_id");

-- CreateIndex
CREATE INDEX "idx_ascora_jobs_customer" ON "ascora_jobs"("customer_id");

-- CreateIndex
CREATE INDEX "idx_ascora_jobs_status" ON "ascora_jobs"("job_status");

-- CreateIndex
CREATE UNIQUE INDEX "ascora_customers_ascora_customer_id_key" ON "ascora_customers"("ascora_customer_id");

-- CreateIndex
CREATE INDEX "idx_ascora_customers_org" ON "ascora_customers"("organization_id");

-- CreateIndex
CREATE INDEX "idx_ascora_customers_ascora_id" ON "ascora_customers"("ascora_customer_id");

-- CreateIndex
CREATE INDEX "idx_ascora_customers_email" ON "ascora_customers"("email");

-- CreateIndex
CREATE INDEX "idx_ascora_customers_phone" ON "ascora_customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "ascora_invoices_ascora_invoice_id_key" ON "ascora_invoices"("ascora_invoice_id");

-- CreateIndex
CREATE INDEX "idx_ascora_invoices_org" ON "ascora_invoices"("organization_id");

-- CreateIndex
CREATE INDEX "idx_ascora_invoices_ascora_id" ON "ascora_invoices"("ascora_invoice_id");

-- CreateIndex
CREATE INDEX "idx_ascora_invoices_report" ON "ascora_invoices"("report_id");

-- CreateIndex
CREATE INDEX "idx_ascora_invoices_status" ON "ascora_invoices"("status");

-- CreateIndex
CREATE INDEX "idx_ascora_logs_org" ON "ascora_sync_logs"("organization_id");

-- CreateIndex
CREATE INDEX "idx_ascora_logs_status" ON "ascora_sync_logs"("status");

-- CreateIndex
CREATE INDEX "idx_ascora_logs_type" ON "ascora_sync_logs"("sync_type");

-- CreateIndex
CREATE INDEX "idx_ascora_logs_created" ON "ascora_sync_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_ascora_schedules_org" ON "ascora_sync_schedules"("organization_id");

-- CreateIndex
CREATE INDEX "idx_ascora_schedules_next" ON "ascora_sync_schedules"("next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_google_id" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "idx_trial_tokens_user" ON "free_trial_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_trial_tokens_status" ON "free_trial_tokens"("status");

-- CreateIndex
CREATE INDEX "idx_trial_tokens_expires" ON "free_trial_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_fingerprints_fingerprint_hash_key" ON "device_fingerprints"("fingerprint_hash");

-- CreateIndex
CREATE INDEX "idx_fingerprints_hash" ON "device_fingerprints"("fingerprint_hash");

-- CreateIndex
CREATE INDEX "idx_fingerprints_user" ON "device_fingerprints"("user_id");

-- CreateIndex
CREATE INDEX "idx_fingerprints_blocked" ON "device_fingerprints"("is_blocked");

-- CreateIndex
CREATE INDEX "idx_payment_verifications_user" ON "payment_verifications"("user_id");

-- CreateIndex
CREATE INDEX "idx_payment_verifications_fingerprint" ON "payment_verifications"("card_fingerprint");

-- CreateIndex
CREATE INDEX "idx_payment_verifications_status" ON "payment_verifications"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "login_sessions_session_token_key" ON "login_sessions"("session_token");

-- CreateIndex
CREATE INDEX "idx_login_sessions_user" ON "login_sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_login_sessions_token" ON "login_sessions"("session_token");

-- CreateIndex
CREATE INDEX "idx_login_sessions_ip" ON "login_sessions"("ip_address");

-- CreateIndex
CREATE INDEX "idx_login_sessions_active" ON "login_sessions"("is_active");

-- CreateIndex
CREATE INDEX "idx_fraud_flags_user" ON "trial_fraud_flags"("user_id");

-- CreateIndex
CREATE INDEX "idx_fraud_flags_type" ON "trial_fraud_flags"("flag_type");

-- CreateIndex
CREATE INDEX "idx_fraud_flags_severity" ON "trial_fraud_flags"("severity");

-- CreateIndex
CREATE INDEX "idx_fraud_flags_created" ON "trial_fraud_flags"("created_at");

-- CreateIndex
CREATE INDEX "idx_trial_usage_token" ON "trial_usage"("token_id");

-- CreateIndex
CREATE INDEX "idx_trial_usage_user" ON "trial_usage"("user_id");

-- CreateIndex
CREATE INDEX "idx_trial_usage_created" ON "trial_usage"("created_at");

-- CreateIndex
CREATE INDEX "idx_user_subscriptions_user_id" ON "user_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_subscriptions_stripe_customer" ON "user_subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "idx_user_subscriptions_stripe_subscription" ON "user_subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscriptions_user_id_status_key" ON "user_subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_subscription_history_subscription_id" ON "subscription_history"("subscription_id");

-- CreateIndex
CREATE INDEX "idx_subscription_history_user_id" ON "subscription_history"("user_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ascora_integrations" ADD CONSTRAINT "ascora_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ascora_jobs" ADD CONSTRAINT "ascora_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ascora_customers" ADD CONSTRAINT "ascora_customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ascora_invoices" ADD CONSTRAINT "ascora_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ascora_sync_logs" ADD CONSTRAINT "ascora_sync_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ascora_sync_logs" ADD CONSTRAINT "ascora_sync_logs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "ascora_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ascora_sync_schedules" ADD CONSTRAINT "ascora_sync_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ascora_sync_schedules" ADD CONSTRAINT "ascora_sync_schedules_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "ascora_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "free_trial_tokens" ADD CONSTRAINT "free_trial_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_fingerprints" ADD CONSTRAINT "device_fingerprints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_verifications" ADD CONSTRAINT "payment_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_fraud_flags" ADD CONSTRAINT "trial_fraud_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_usage" ADD CONSTRAINT "trial_usage_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "free_trial_tokens"("token_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_usage" ADD CONSTRAINT "trial_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "user_subscriptions"("subscription_id") ON DELETE CASCADE ON UPDATE CASCADE;
