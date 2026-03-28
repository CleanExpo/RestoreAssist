-- ============================================================
-- COMBINED PENDING MIGRATIONS (7 unapplied)
-- Generated: 2026-03-28
-- Run in Supabase SQL Editor for project: oxeiaavuspvpvanzcrjc
-- ============================================================

-- -------------------------------------------------------
-- 1. 20260127000000_add_moisture_mapping_fields
-- -------------------------------------------------------
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "floorPlanImageUrl" TEXT;
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "mapX" DOUBLE PRECISION;
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "mapY" DOUBLE PRECISION;

-- -------------------------------------------------------
-- 2. 20260130072417_update_schema (large migration)
-- -------------------------------------------------------

-- New ENUMs (CREATE TYPE IF NOT EXISTS not supported in older PG; use DO block)
DO $$ BEGIN
  CREATE TYPE "CertificationType" AS ENUM ('IICRC_WRT','IICRC_AMRT','IICRC_FSRT','IICRC_CCT','TRADE_PLUMBING','TRADE_ELECTRICAL','TRADE_BUILDING','TRADE_CARPENTRY','INSURANCE_PUBLIC_LIABILITY','INSURANCE_PROFESSIONAL_INDEMNITY','INSURANCE_WORKERS_COMP','BUSINESS_ABN_REGISTRATION','BUSINESS_GST_REGISTRATION','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "VerificationStatus" AS ENUM ('PENDING','VERIFIED','REJECTED','EXPIRED','RENEWAL_NEEDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED','DISPUTED','HIDDEN','REMOVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewDisputeStatus" AS ENUM ('NONE','PENDING_REVIEW','UNDER_INVESTIGATION','RESOLVED_KEPT','RESOLVED_AMENDED','RESOLVED_REMOVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WebhookEventStatus" AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED','SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('INFO','SUCCESS','WARNING','ERROR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT','SENT','VIEWED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED','WRITTEN_OFF','REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE','BANK_TRANSFER','CASH','CHEQUE','CREDIT_CARD','PAYPAL','EXTERNAL','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT','ISSUED','APPLIED','REFUNDED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CreditNoteReason" AS ENUM ('CUSTOMER_REFUND','PRICING_ERROR','DUPLICATE_INVOICE','SERVICE_ISSUE','GOODWILL','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RecurringFrequency" AS ENUM ('WEEKLY','FORTNIGHTLY','MONTHLY','QUARTERLY','SEMI_ANNUALLY','ANNUALLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RecurringInvoiceStatus" AS ENUM ('ACTIVE','PAUSED','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceEmailType" AS ENUM ('SENT','REMINDER','THANK_YOU','OVERDUE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReminderType" AS ENUM ('BEFORE_DUE','ON_DUE_DATE','OVERDUE_1','OVERDUE_2','OVERDUE_3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReminderStatus" AS ENUM ('PENDING','SENT','FAILED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ExternalSyncStatus" AS ENUM ('PENDING','SYNCED','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Drop index if exists before dropping column
DROP INDEX IF EXISTS "ExternalClient_contactId_idx";

-- Drop columns if they exist (migration 1 added mapX/mapY, migration 2 removes them — net = never added)
ALTER TABLE "ExternalClient" DROP COLUMN IF EXISTS "contactId";
ALTER TABLE "MoistureReading" DROP COLUMN IF EXISTS "mapX";
ALTER TABLE "MoistureReading" DROP COLUMN IF EXISTS "mapY";

-- User new columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deepseekApiKey" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "quickFillCreditsRemaining" INTEGER DEFAULT 1;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totalQuickFillUsed" INTEGER DEFAULT 0;

-- ContractorProfile
CREATE TABLE IF NOT EXISTS "ContractorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicDescription" TEXT,
    "yearsInBusiness" INTEGER,
    "teamSize" INTEGER,
    "insuranceCertificate" TEXT,
    "isPubliclyVisible" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "specializations" TEXT[],
    "servicesOffered" TEXT,
    "averageRating" DOUBLE PRECISION DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "responseRatePercent" DOUBLE PRECISION,
    "averageResponseHours" DOUBLE PRECISION,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "searchKeywords" TEXT[],
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContractorProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContractorCertification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "certificationType" "CertificationType" NOT NULL,
    "certificationName" TEXT NOT NULL,
    "issuingBody" TEXT NOT NULL,
    "certificationNumber" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verificationNotes" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContractorCertification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContractorServiceArea" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "suburb" TEXT,
    "state" TEXT NOT NULL,
    "radius" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContractorServiceArea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContractorReview" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "reportId" TEXT,
    "overallRating" INTEGER NOT NULL,
    "qualityRating" INTEGER,
    "timelinessRating" INTEGER,
    "communicationRating" INTEGER,
    "valueRating" INTEGER,
    "reviewTitle" TEXT,
    "reviewText" TEXT NOT NULL,
    "contractorResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "disputeStatus" "ReviewDisputeStatus" NOT NULL DEFAULT 'NONE',
    "disputeReason" TEXT,
    "disputeSubmittedAt" TIMESTAMP(3),
    "disputeResolvedAt" TIMESTAMP(3),
    "disputeResolution" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "isVerifiedJob" BOOLEAN NOT NULL DEFAULT false,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContractorReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "integrationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" TEXT NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InvoiceSequence" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'RA',
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "sentDate" TIMESTAMP(3),
    "viewedDate" TIMESTAMP(3),
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "customerABN" TEXT,
    "subtotalExGST" INTEGER NOT NULL,
    "gstAmount" INTEGER NOT NULL,
    "totalIncGST" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "amountDue" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "exchangeRate" DOUBLE PRECISION DEFAULT 1.0,
    "discountAmount" INTEGER DEFAULT 0,
    "discountPercentage" DOUBLE PRECISION,
    "shippingAmount" INTEGER DEFAULT 0,
    "adjustmentAmount" INTEGER DEFAULT 0,
    "adjustmentNote" TEXT,
    "notes" TEXT,
    "terms" TEXT,
    "footer" TEXT,
    "reportId" TEXT,
    "estimateId" TEXT,
    "clientId" TEXT,
    "userId" TEXT NOT NULL,
    "originalInvoiceId" TEXT,
    "recurringInvoiceId" TEXT,
    "templateId" TEXT,
    "externalInvoiceId" TEXT,
    "externalSyncProvider" TEXT,
    "externalSyncStatus" "ExternalSyncStatus",
    "externalSyncedAt" TIMESTAMP(3),
    "externalSyncError" TEXT,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "publicToken" TEXT,
    "publicViewCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "poNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "gstAmount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "discountAmount" INTEGER DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "invoiceId" TEXT NOT NULL,
    "estimateLineItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InvoicePayment" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "externalPaymentId" TEXT,
    "externalProvider" "IntegrationProvider",
    "webhookEventId" TEXT,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledAt" TIMESTAMP(3),
    "reconciledBy" TEXT,
    "invoiceId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InvoicePaymentAllocation" (
    "id" TEXT NOT NULL,
    "allocatedAmount" INTEGER NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoicePaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CreditNote" (
    "id" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "creditDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedDate" TIMESTAMP(3),
    "subtotalExGST" INTEGER NOT NULL,
    "gstAmount" INTEGER NOT NULL,
    "totalIncGST" INTEGER NOT NULL,
    "reason" "CreditNoteReason" NOT NULL,
    "reasonNotes" TEXT,
    "refundMethod" "PaymentMethod",
    "refundReference" TEXT,
    "refundedAt" TIMESTAMP(3),
    "invoiceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CreditNoteLineItem" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "gstAmount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "creditNoteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditNoteLineItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InvoiceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "primaryColor" TEXT DEFAULT '#0EA5E9',
    "secondaryColor" TEXT DEFAULT '#1E293B',
    "accentColor" TEXT DEFAULT '#10B981',
    "logoUrl" TEXT,
    "logoPosition" TEXT DEFAULT 'left',
    "fontFamily" TEXT DEFAULT 'Inter',
    "fontSize" TEXT DEFAULT 'medium',
    "headerFont" TEXT DEFAULT 'bold',
    "pageSize" TEXT DEFAULT 'A4',
    "marginTop" INTEGER DEFAULT 50,
    "marginBottom" INTEGER DEFAULT 50,
    "marginLeft" INTEGER DEFAULT 40,
    "marginRight" INTEGER DEFAULT 40,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showCompanyName" BOOLEAN NOT NULL DEFAULT true,
    "showCompanyAddress" BOOLEAN NOT NULL DEFAULT true,
    "showCompanyPhone" BOOLEAN NOT NULL DEFAULT true,
    "showCompanyEmail" BOOLEAN NOT NULL DEFAULT true,
    "showCompanyABN" BOOLEAN NOT NULL DEFAULT true,
    "headerText" TEXT,
    "footerText" TEXT,
    "showInvoiceNumber" BOOLEAN NOT NULL DEFAULT true,
    "showInvoiceDate" BOOLEAN NOT NULL DEFAULT true,
    "showDueDate" BOOLEAN NOT NULL DEFAULT true,
    "showPaymentTerms" BOOLEAN NOT NULL DEFAULT true,
    "showLineItemImages" BOOLEAN NOT NULL DEFAULT false,
    "showItemCategory" BOOLEAN NOT NULL DEFAULT true,
    "showItemDescription" BOOLEAN NOT NULL DEFAULT true,
    "showQuantity" BOOLEAN NOT NULL DEFAULT true,
    "showUnitPrice" BOOLEAN NOT NULL DEFAULT true,
    "showGST" BOOLEAN NOT NULL DEFAULT true,
    "showSubtotal" BOOLEAN NOT NULL DEFAULT true,
    "showDiscount" BOOLEAN NOT NULL DEFAULT true,
    "showShipping" BOOLEAN NOT NULL DEFAULT true,
    "showGSTBreakdown" BOOLEAN NOT NULL DEFAULT true,
    "paymentInstructions" TEXT,
    "bankAccountName" TEXT,
    "bankAccountBSB" TEXT,
    "bankAccountNumber" TEXT,
    "paymentQRCode" TEXT,
    "customCSS" TEXT,
    "customHTML" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "InvoiceTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecurringInvoice" (
    "id" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "description" TEXT,
    "frequency" "RecurringFrequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextInvoiceDate" TIMESTAMP(3) NOT NULL,
    "lastInvoiceDate" TIMESTAMP(3),
    "status" "RecurringInvoiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "pausedAt" TIMESTAMP(3),
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "subtotalExGST" INTEGER NOT NULL,
    "gstAmount" INTEGER NOT NULL,
    "totalIncGST" INTEGER NOT NULL,
    "lineItemsTemplate" JSONB NOT NULL,
    "dueInDays" INTEGER NOT NULL DEFAULT 30,
    "terms" TEXT,
    "notes" TEXT,
    "clientId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecurringInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InvoiceAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "userId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InvoiceEmail" (
    "id" TEXT NOT NULL,
    "emailType" "InvoiceEmailType" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "resendEmailId" TEXT,
    "invoiceId" TEXT NOT NULL,
    CONSTRAINT "InvoiceEmail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaymentReminder" (
    "id" TEXT NOT NULL,
    "reminderType" "ReminderType" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- Indexes (IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS "ContractorProfile_userId_key" ON "ContractorProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ContractorProfile_slug_key" ON "ContractorProfile"("slug");
CREATE INDEX IF NOT EXISTS "ContractorProfile_isPubliclyVisible_isVerified_idx" ON "ContractorProfile"("isPubliclyVisible", "isVerified");
CREATE INDEX IF NOT EXISTS "ContractorProfile_averageRating_idx" ON "ContractorProfile"("averageRating");
CREATE INDEX IF NOT EXISTS "ContractorProfile_slug_idx" ON "ContractorProfile"("slug");
CREATE INDEX IF NOT EXISTS "ContractorCertification_profileId_verificationStatus_idx" ON "ContractorCertification"("profileId", "verificationStatus");
CREATE INDEX IF NOT EXISTS "ContractorCertification_expiryDate_idx" ON "ContractorCertification"("expiryDate");
CREATE INDEX IF NOT EXISTS "ContractorCertification_certificationType_idx" ON "ContractorCertification"("certificationType");
CREATE INDEX IF NOT EXISTS "ContractorServiceArea_postcode_isActive_idx" ON "ContractorServiceArea"("postcode", "isActive");
CREATE INDEX IF NOT EXISTS "ContractorServiceArea_state_isActive_idx" ON "ContractorServiceArea"("state", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "ContractorServiceArea_profileId_postcode_key" ON "ContractorServiceArea"("profileId", "postcode");
CREATE INDEX IF NOT EXISTS "ContractorReview_profileId_status_idx" ON "ContractorReview"("profileId", "status");
CREATE INDEX IF NOT EXISTS "ContractorReview_clientUserId_idx" ON "ContractorReview"("clientUserId");
CREATE INDEX IF NOT EXISTS "ContractorReview_reportId_idx" ON "ContractorReview"("reportId");
CREATE INDEX IF NOT EXISTS "ContractorReview_createdAt_idx" ON "ContractorReview"("createdAt");
CREATE INDEX IF NOT EXISTS "ContractorReview_overallRating_idx" ON "ContractorReview"("overallRating");
CREATE INDEX IF NOT EXISTS "WebhookEvent_provider_eventType_idx" ON "WebhookEvent"("provider", "eventType");
CREATE INDEX IF NOT EXISTS "WebhookEvent_status_createdAt_idx" ON "WebhookEvent"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WebhookEvent_integrationId_status_idx" ON "WebhookEvent"("integrationId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_stripeEventId_idx" ON "StripeWebhookEvent"("stripeEventId");
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_eventType_idx" ON "StripeWebhookEvent"("eventType");
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_status_idx" ON "StripeWebhookEvent"("status");
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_receivedAt_idx" ON "StripeWebhookEvent"("receivedAt");
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_userId_idx" ON "StripeWebhookEvent"("userId");
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "InvoiceSequence_userId_year_idx" ON "InvoiceSequence"("userId", "year");
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSequence_userId_year_key" ON "InvoiceSequence"("userId", "year");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_publicToken_key" ON "Invoice"("publicToken");
CREATE INDEX IF NOT EXISTS "Invoice_userId_invoiceNumber_idx" ON "Invoice"("userId", "invoiceNumber");
CREATE INDEX IF NOT EXISTS "Invoice_userId_status_idx" ON "Invoice"("userId", "status");
CREATE INDEX IF NOT EXISTS "Invoice_userId_invoiceDate_idx" ON "Invoice"("userId", "invoiceDate");
CREATE INDEX IF NOT EXISTS "Invoice_userId_dueDate_idx" ON "Invoice"("userId", "dueDate");
CREATE INDEX IF NOT EXISTS "Invoice_clientId_idx" ON "Invoice"("clientId");
CREATE INDEX IF NOT EXISTS "Invoice_reportId_idx" ON "Invoice"("reportId");
CREATE INDEX IF NOT EXISTS "Invoice_estimateId_idx" ON "Invoice"("estimateId");
CREATE INDEX IF NOT EXISTS "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");
CREATE INDEX IF NOT EXISTS "Invoice_externalInvoiceId_idx" ON "Invoice"("externalInvoiceId");
CREATE INDEX IF NOT EXISTS "Invoice_publicToken_idx" ON "Invoice"("publicToken");
CREATE INDEX IF NOT EXISTS "InvoiceLineItem_invoiceId_sortOrder_idx" ON "InvoiceLineItem"("invoiceId", "sortOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "InvoicePayment_stripePaymentIntentId_key" ON "InvoicePayment"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "InvoicePayment_userId_paymentDate_idx" ON "InvoicePayment"("userId", "paymentDate");
CREATE INDEX IF NOT EXISTS "InvoicePayment_invoiceId_paymentDate_idx" ON "InvoicePayment"("invoiceId", "paymentDate");
CREATE INDEX IF NOT EXISTS "InvoicePayment_stripePaymentIntentId_idx" ON "InvoicePayment"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "InvoicePayment_paymentMethod_idx" ON "InvoicePayment"("paymentMethod");
CREATE INDEX IF NOT EXISTS "InvoicePayment_externalPaymentId_idx" ON "InvoicePayment"("externalPaymentId");
CREATE INDEX IF NOT EXISTS "InvoicePaymentAllocation_paymentId_idx" ON "InvoicePaymentAllocation"("paymentId");
CREATE INDEX IF NOT EXISTS "InvoicePaymentAllocation_invoiceId_idx" ON "InvoicePaymentAllocation"("invoiceId");
CREATE UNIQUE INDEX IF NOT EXISTS "InvoicePaymentAllocation_paymentId_invoiceId_key" ON "InvoicePaymentAllocation"("paymentId", "invoiceId");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_creditNoteNumber_key" ON "CreditNote"("creditNoteNumber");
CREATE INDEX IF NOT EXISTS "CreditNote_userId_creditNoteNumber_idx" ON "CreditNote"("userId", "creditNoteNumber");
CREATE INDEX IF NOT EXISTS "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");
CREATE INDEX IF NOT EXISTS "CreditNote_status_idx" ON "CreditNote"("status");
CREATE INDEX IF NOT EXISTS "CreditNoteLineItem_creditNoteId_sortOrder_idx" ON "CreditNoteLineItem"("creditNoteId", "sortOrder");
CREATE INDEX IF NOT EXISTS "InvoiceTemplate_userId_isDefault_idx" ON "InvoiceTemplate"("userId", "isDefault");
CREATE INDEX IF NOT EXISTS "InvoiceTemplate_userId_createdAt_idx" ON "InvoiceTemplate"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "RecurringInvoice_userId_status_idx" ON "RecurringInvoice"("userId", "status");
CREATE INDEX IF NOT EXISTS "RecurringInvoice_status_nextInvoiceDate_idx" ON "RecurringInvoice"("status", "nextInvoiceDate");
CREATE INDEX IF NOT EXISTS "RecurringInvoice_clientId_idx" ON "RecurringInvoice"("clientId");
CREATE INDEX IF NOT EXISTS "InvoiceAuditLog_invoiceId_createdAt_idx" ON "InvoiceAuditLog"("invoiceId", "createdAt");
CREATE INDEX IF NOT EXISTS "InvoiceAuditLog_userId_idx" ON "InvoiceAuditLog"("userId");
CREATE INDEX IF NOT EXISTS "InvoiceEmail_invoiceId_sentAt_idx" ON "InvoiceEmail"("invoiceId", "sentAt");
CREATE INDEX IF NOT EXISTS "InvoiceEmail_resendEmailId_idx" ON "InvoiceEmail"("resendEmailId");
CREATE INDEX IF NOT EXISTS "PaymentReminder_status_scheduledFor_idx" ON "PaymentReminder"("status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "PaymentReminder_invoiceId_idx" ON "PaymentReminder"("invoiceId");
CREATE INDEX IF NOT EXISTS "Client_userId_name_idx" ON "Client"("userId", "name");
CREATE INDEX IF NOT EXISTS "Client_userId_email_idx" ON "Client"("userId", "email");
CREATE INDEX IF NOT EXISTS "Client_userId_createdAt_idx" ON "Client"("userId", "createdAt");

-- Foreign Keys (only add if constraint doesn't already exist)
DO $$ BEGIN
  ALTER TABLE "ContractorProfile" ADD CONSTRAINT "ContractorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContractorCertification" ADD CONSTRAINT "ContractorCertification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContractorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContractorServiceArea" ADD CONSTRAINT "ContractorServiceArea_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContractorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContractorReview" ADD CONSTRAINT "ContractorReview_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContractorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContractorReview" ADD CONSTRAINT "ContractorReview_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "ClientUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContractorReview" ADD CONSTRAINT "ContractorReview_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InvoiceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InvoicePaymentAllocation" ADD CONSTRAINT "InvoicePaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "InvoicePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InvoicePaymentAllocation" ADD CONSTRAINT "InvoicePaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CreditNoteLineItem" ADD CONSTRAINT "CreditNoteLineItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InvoiceTemplate" ADD CONSTRAINT "InvoiceTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InvoiceAuditLog" ADD CONSTRAINT "InvoiceAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InvoiceAuditLog" ADD CONSTRAINT "InvoiceAuditLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InvoiceEmail" ADD CONSTRAINT "InvoiceEmail_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- 3. 20260202105359_add_interview_session_report_id
-- (Skipped: InterviewSession table does not exist in this DB instance due to migration drift)
-- -------------------------------------------------------

-- -------------------------------------------------------
-- 4. 20260206000000_add_feedback
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER,
    "whatDoing" TEXT,
    "whatHappened" TEXT,
    "page" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Feedback_userId_idx" ON "Feedback"("userId");
CREATE INDEX IF NOT EXISTS "Feedback_createdAt_idx" ON "Feedback"("createdAt");
DO $$ BEGIN
  ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- 5. 20260207000000_add_lifetime_access
-- -------------------------------------------------------
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lifetimeAccess" BOOLEAN DEFAULT false;

-- -------------------------------------------------------
-- 6. 20260221060300_add_life_time_access_variable
-- -------------------------------------------------------
-- (empty migration — no SQL needed)

-- -------------------------------------------------------
-- 7. 20260227120000_add_restoration_document
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "RestorationDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RestorationDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RestorationDocument_userId_idx" ON "RestorationDocument"("userId");
CREATE INDEX IF NOT EXISTS "RestorationDocument_reportId_idx" ON "RestorationDocument"("reportId");
CREATE INDEX IF NOT EXISTS "RestorationDocument_userId_documentType_idx" ON "RestorationDocument"("userId", "documentType");
CREATE INDEX IF NOT EXISTS "RestorationDocument_createdAt_idx" ON "RestorationDocument"("createdAt");
DO $$ BEGIN
  ALTER TABLE "RestorationDocument" ADD CONSTRAINT "RestorationDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RestorationDocument" ADD CONSTRAINT "RestorationDocument_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Mark all 7 migrations as applied in _prisma_migrations table
-- ============================================================
-- Mark migrations as applied using WHERE NOT EXISTS (no unique index on migration_name)
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
SELECT gen_random_uuid()::text,'manual',NOW(),'20260127000000_add_moisture_mapping_fields',NULL,NULL,NOW(),1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20260127000000_add_moisture_mapping_fields');

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
SELECT gen_random_uuid()::text,'manual',NOW(),'20260130072417_update_schema',NULL,NULL,NOW(),1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20260130072417_update_schema');

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
SELECT gen_random_uuid()::text,'manual',NOW(),'20260202105359_add_interview_session_report_id',NULL,NULL,NOW(),1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20260202105359_add_interview_session_report_id');

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
SELECT gen_random_uuid()::text,'manual',NOW(),'20260206000000_add_feedback',NULL,NULL,NOW(),1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20260206000000_add_feedback');

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
SELECT gen_random_uuid()::text,'manual',NOW(),'20260207000000_add_lifetime_access',NULL,NULL,NOW(),1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20260207000000_add_lifetime_access');

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
SELECT gen_random_uuid()::text,'manual',NOW(),'20260221060300_add_life_time_access_variable',NULL,NULL,NOW(),1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20260221060300_add_life_time_access_variable');

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
SELECT gen_random_uuid()::text,'manual',NOW(),'20260227120000_add_restoration_document',NULL,NULL,NOW(),1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20260227120000_add_restoration_document');
