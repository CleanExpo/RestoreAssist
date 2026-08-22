-- CreateTable: SupportTicket (RA-163)
CREATE TABLE "SupportTicket" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT,
  "email"         TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "subject"       TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "category"      TEXT NOT NULL DEFAULT 'general',
  "priority"      TEXT NOT NULL DEFAULT 'normal',
  "status"        TEXT NOT NULL DEFAULT 'open',
  "responseDraft" TEXT,
  "resolvedAt"    TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");
CREATE INDEX "SupportTicket_email_idx"  ON "SupportTicket"("email");

ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
