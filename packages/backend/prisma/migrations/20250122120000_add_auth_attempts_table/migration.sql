-- CreateTable
CREATE TABLE "auth_attempts" (
    "attempt_id" UUID NOT NULL,
    "user_email" VARCHAR(255),
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT NOT NULL,
    "oauth_error_code" VARCHAR(100),
    "oauth_error_message" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("attempt_id")
);

-- CreateIndex
CREATE INDEX "idx_auth_attempts_email" ON "auth_attempts"("user_email");

-- CreateIndex
CREATE INDEX "idx_auth_attempts_ip" ON "auth_attempts"("ip_address");

-- CreateIndex
CREATE INDEX "idx_auth_attempts_attempted_at" ON "auth_attempts"("attempted_at" DESC);

-- CreateIndex
CREATE INDEX "idx_auth_attempts_success" ON "auth_attempts"("success");
