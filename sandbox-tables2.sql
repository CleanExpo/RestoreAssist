    "standardReference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePolicyRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostDatabase" (
    "id" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "minRate" DOUBLE PRECISION NOT NULL,
    "maxRate" DOUBLE PRECISION NOT NULL,
    "averageRate" DOUBLE PRECISION NOT NULL,
    "region" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "updateFrequency" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostDatabase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionPhoto" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "location" TEXT,
    "description" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "gpsLatitude" DOUBLE PRECISION,
    "gpsLongitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "scanId" TEXT,
    "voiceNoteId" TEXT,
    "eventType" "UsageEventType" NOT NULL,
    "eventData" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "units" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "stripeMeterEventId" TEXT,
    "billingStatus" TEXT NOT NULL DEFAULT 'pending',
    "billedAt" TIMESTAMP(3),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "subject" TEXT,
    "htmlBody" TEXT,
    "textBody" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttempt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "deliveryType" TEXT NOT NULL,

    CONSTRAINT "EmailAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formType" "FormType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "FormCategory" NOT NULL,
    "status" "FormTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isSystemTemplate" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "formSchema" TEXT NOT NULL,
    "requiresSignatures" BOOLEAN NOT NULL DEFAULT false,
    "signatureConfig" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "workspaceId" TEXT,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT,
    "submissionNumber" TEXT NOT NULL,
    "status" "FormSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "formData" TEXT NOT NULL,
    "completenessScore" INTEGER DEFAULT 0,
    "validationErrors" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSignature" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "signatureFieldId" TEXT NOT NULL,
    "signatureType" "SignatureType" NOT NULL,
    "signatureData" TEXT,
    "signatureUrl" TEXT,
    "signatoryName" TEXT NOT NULL,
    "signatoryRole" "SignatoryRole" NOT NULL,
    "signatoryEmail" TEXT,
    "signatureRequestSent" BOOLEAN NOT NULL DEFAULT false,
    "signatureRequestSentAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "gpsLocation" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "publicId" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fieldId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAuditLog" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "action" "FormAuditAction" NOT NULL,
    "fieldId" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeNotes" TEXT,
    "changedBy" TEXT NOT NULL,
    "schemaSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityFormTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "formContent" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorityFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityFormInstance" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyLogo" TEXT,
    "companyABN" TEXT,
    "companyPhone" TEXT,
    "companyEmail" TEXT,
    "companyWebsite" TEXT,
    "companyAddress" TEXT,
    "clientName" TEXT NOT NULL,
    "clientAddress" TEXT NOT NULL,
    "incidentBrief" TEXT,
    "incidentDate" TIMESTAMP(3),
    "authorityDescription" TEXT NOT NULL,
    "status" "AuthorityFormStatus" NOT NULL DEFAULT 'DRAFT',
    "pdfUrl" TEXT,
    "draftPdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AuthorityFormInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityFormSignature" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "signatoryName" TEXT NOT NULL,
    "signatoryRole" "AuthoritySignatoryRole" NOT NULL,
    "signatoryEmail" TEXT,
    "signatoryPhone" TEXT,
    "signatureData" TEXT,
    "signatureUrl" TEXT,
    "signatureRequestSent" BOOLEAN NOT NULL DEFAULT false,
    "signatureRequestSentAt" TIMESTAMP(3),
    "signatureRequestToken" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorityFormSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionTier" (
    "id" TEXT NOT NULL,
    "tierName" "SubscriptionTierLevel" NOT NULL,
    "monthlyPrice" DOUBLE PRECISION NOT NULL,
    "features" TEXT,
    "standardsCoverage" TEXT[],
    "maxFormsPerMonth" INTEGER,
    "maxQuestionsPerInterview" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "helperText" TEXT,
    "exampleAnswer" TEXT,
    "sequenceNumber" INTEGER,
    "standardsReference" TEXT[],
    "standardsJustification" TEXT NOT NULL,
    "targetFormFields" TEXT[],
    "fieldMappings" TEXT NOT NULL,
    "condition" TEXT,
    "skipLogic" TEXT,
    "conditionalShows" TEXT,
    "fieldGuidance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minTierLevel" "SubscriptionTierLevel" NOT NULL DEFAULT 'STANDARD',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "averageTimeSeconds" INTEGER,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formTemplateId" TEXT NOT NULL,
    "formSubmissionId" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),
    "totalQuestionsAsked" INTEGER NOT NULL DEFAULT 0,
    "totalAnswersGiven" INTEGER NOT NULL DEFAULT 0,
    "estimatedTimeMinutes" INTEGER NOT NULL DEFAULT 5,
    "actualTimeMinutes" INTEGER,
    "answers" TEXT,
    "autoPopulatedFields" TEXT,
    "standardsReferences" TEXT,
    "equipmentRecommendations" TEXT,
    "estimatedEquipmentCost" DOUBLE PRECISION,
    "userTierLevel" "SubscriptionTierLevel" NOT NULL,
    "technicianExperience" TEXT,
    "reportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewResponse" (
    "id" TEXT NOT NULL,
    "interviewSessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answerValue" TEXT,
    "answerType" "QuestionType" NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeSpentSeconds" INTEGER,
    "populatedFields" TEXT,
    "standardsReference" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewStandardsMapping" (
    "id" TEXT NOT NULL,
    "interviewSessionId" TEXT NOT NULL,
    "standardCode" TEXT NOT NULL,
    "standardTitle" TEXT NOT NULL,
    "questionsUsing" TEXT[],
    "fieldsAffected" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewStandardsMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LidarScan" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "rawDataUrl" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "pointCount" INTEGER,
    "roomName" TEXT,
    "scanDuration" INTEGER,
    "dimensions" TEXT,
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LidarScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlan" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "svgUrl" TEXT,
    "thumbnailUrl" TEXT,
    "svgData" TEXT,
    "canvasJSON" TEXT,
    "scale" DOUBLE PRECISION,
    "dimensions" TEXT,
    "annotations" TEXT,
    "generatedBy" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceNote" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "audioFormat" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "roomName" TEXT,
    "description" TEXT,
    "transcriptionStatus" TEXT NOT NULL DEFAULT 'pending',
    "transcribedAt" TIMESTAMP(3),
    "transcriptionError" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceTranscript" (
    "id" TEXT NOT NULL,
    "voiceNoteId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "confidence" DOUBLE PRECISION,
    "words" JSONB,
    "speakers" JSONB,
    "extractedData" JSONB,
    "aiProcessed" BOOLEAN NOT NULL DEFAULT false,
    "aiProcessedAt" TIMESTAMP(3),
    "transcriptionService" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyLookup" (
    "id" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "propertyPostcode" TEXT NOT NULL,
    "lookupDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "apiResponseStatus" INTEGER NOT NULL,
    "dataSource" TEXT NOT NULL DEFAULT 'corelogic',
    "lookupCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "propertyData" JSONB,
    "inspectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyLookup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
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

-- CreateTable
CREATE TABLE "Notification" (
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

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "userId" TEXT,
    "email" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "capabilities" TEXT NOT NULL,
    "inputSchema" TEXT NOT NULL,
    "outputSchema" TEXT NOT NULL,
    "defaultProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "defaultModel" TEXT,
    "maxTokens" INTEGER NOT NULL DEFAULT 8000,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "dependsOn" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWorkflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "reportId" TEXT,
    "inspectionId" TEXT,
    "taskGraph" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "failedTasks" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "config" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL DEFAULT 0,
    "parallelGroup" INTEGER NOT NULL DEFAULT 0,
    "dependsOnTaskIds" TEXT[],
    "input" TEXT NOT NULL,
    "output" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTaskLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTaskLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronJobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "metadata" TEXT,

    CONSTRAINT "CronJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'RA',
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
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
    "workspaceId" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
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

-- CreateTable
CREATE TABLE "InvoicePayment" (
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

-- CreateTable
CREATE TABLE "InvoicePaymentAllocation" (
    "id" TEXT NOT NULL,
    "allocatedAmount" INTEGER NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
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

-- CreateTable
CREATE TABLE "CreditNoteLineItem" (
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

-- CreateTable
CREATE TABLE "InvoiceTemplate" (
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

-- CreateTable
CREATE TABLE "RecurringInvoice" (
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

-- CreateTable
CREATE TABLE "InvoiceAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "userId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceEmail" (
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

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" TEXT NOT NULL,
    "reminderType" "ReminderType" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotObservation" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "observationType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'nir',
    "inspectionId" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "context" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "claimType" TEXT,
    "items" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "hook" TEXT,
    "agitation" TEXT,
    "solution" TEXT,
    "cta" TEXT,
    "voiceoverText" TEXT,
    "caption" TEXT,
    "hashtags" TEXT,
    "audioUrl" TEXT,
    "videoUrl" TEXT,
    "heygenRenderJobId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalPostId" TEXT,
    "postUrl" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAnalytics" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTopic" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "responseDraft" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable (Sprint G: RA-408 — storage provider column on Organization)
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "storageProvider" "StorageProviderType" NOT NULL DEFAULT 'SUPABASE',
  ADD COLUMN IF NOT EXISTS "storageBucketUrl" TEXT;

-- CreateTable (Sprint G: guided evidence capture workflow)
CREATE TABLE "InspectionWorkflow" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "experienceLevel" TEXT NOT NULL DEFAULT 'APPRENTICE',
  "currentStepOrder" INTEGER NOT NULL DEFAULT 0,
  "totalSteps" INTEGER NOT NULL DEFAULT 0,
  "completedSteps" INTEGER NOT NULL DEFAULT 0,
  "skippedSteps" INTEGER NOT NULL DEFAULT 0,
  "isReadyToSubmit" BOOLEAN NOT NULL DEFAULT false,
  "submissionScore" DOUBLE PRECISION,
  "lastValidatedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InspectionWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable (Sprint G: individual step within a workflow)
CREATE TABLE "WorkflowStep" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "stepKey" TEXT NOT NULL,
  "stepTitle" TEXT NOT NULL,
  "stepDescription" TEXT,
  "stepDescriptionShort" TEXT,
  "requiredEvidenceClasses" TEXT NOT NULL,
  "optionalEvidenceClasses" TEXT,
  "minimumEvidenceCount" INTEGER NOT NULL DEFAULT 1,
  "isMandatory" BOOLEAN NOT NULL DEFAULT true,
  "riskTier" INTEGER NOT NULL DEFAULT 1,
  "escalationNote" TEXT,
  "status" "WorkflowStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable (Sprint G: evidence item with chain-of-custody — IICRC S500:2025)
CREATE TABLE "EvidenceItem" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "evidenceClass" "EvidenceClass" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "capturedById" TEXT NOT NULL,
  "capturedByName" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "capturedLat" DOUBLE PRECISION,
  "capturedLng" DOUBLE PRECISION,
  "deviceId" TEXT,
  "deviceType" TEXT,
  "fileUrl" TEXT,
  "fileMimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "thumbnailUrl" TEXT,
  "structuredData" TEXT,
  "workflowStepId" TEXT,
  "affectedAreaId" TEXT,
  "hashSha256" TEXT,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable (Sprint G: exception reason when required evidence skipped)
CREATE TABLE "ExceptionReason" (
  "id" TEXT NOT NULL,
  "evidenceItemId" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "reasonText" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "notifiedAdminAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExceptionReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable (RA-414: workspace-scoped AI provider credential store)
CREATE TABLE "ProviderConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" "AiProvider" NOT NULL,
  "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "encryptedCredentials" TEXT NOT NULL,
  "lastValidatedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdByMemberId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable (RA-416: EXIF metadata for inspection photos/videos)
CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "evidenceId" TEXT,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "altitude" DOUBLE PRECISION,
  "accuracy" DOUBLE PRECISION,
  "capturedAt" TIMESTAMP(3),
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "timezone" TEXT,
  "deviceMake" TEXT,
  "deviceModel" TEXT,
  "software" TEXT,
  "lensModel" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "orientation" INTEGER,
  "colorSpace" TEXT,
  "dpiX" DOUBLE PRECISION,
  "dpiY" DOUBLE PRECISION,
  "focalLength" DOUBLE PRECISION,
  "aperture" DOUBLE PRECISION,
  "exposureTime" TEXT,
  "iso" INTEGER,
  "flash" BOOLEAN,
  "durationSeconds" DOUBLE PRECISION,
  "videoWidth" INTEGER,
  "videoHeight" INTEGER,
  "videoCodec" TEXT,
  "frameRate" DOUBLE PRECISION,
  "rawExifData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable (RA-414: immutable per-call AI usage log)
CREATE TABLE "AiUsageLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "memberId" TEXT,
  "provider" "AiProvider" NOT NULL,
  "model" TEXT NOT NULL,
  "taskType" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "estimatedCostUsd" DOUBLE PRECISION NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "errorType" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);


-- CreateTable (RA-417: MediaAssetTag — auto-cataloging by dimension)
CREATE TABLE "MediaAssetTag" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "assetId"      TEXT NOT NULL,
  "workspaceId"  TEXT NOT NULL,
  "category"     TEXT NOT NULL,
  "value"        TEXT NOT NULL,
  "inspectionId" TEXT,
  "evidenceId"   TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAssetTag_pkey" PRIMARY KEY ("id")
);
