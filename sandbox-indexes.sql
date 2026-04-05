-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_subscriptionId_key" ON "User"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "RestorationDocument_userId_idx" ON "RestorationDocument"("userId");

-- CreateIndex
CREATE INDEX "RestorationDocument_reportId_idx" ON "RestorationDocument"("reportId");

-- CreateIndex
CREATE INDEX "RestorationDocument_userId_documentType_idx" ON "RestorationDocument"("userId", "documentType");

-- CreateIndex
CREATE INDEX "RestorationDocument_createdAt_idx" ON "RestorationDocument"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

-- CreateIndex
CREATE INDEX "Client_search_vector_idx" ON "Client" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "Client_userId_name_idx" ON "Client"("userId", "name");

-- CreateIndex
CREATE INDEX "Client_userId_email_idx" ON "Client"("userId", "email");

-- CreateIndex
CREATE INDEX "Client_userId_createdAt_idx" ON "Client"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientUser_email_key" ON "ClientUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientUser_clientId_key" ON "ClientUser"("clientId");

-- CreateIndex
CREATE INDEX "ClientUser_email_idx" ON "ClientUser"("email");

-- CreateIndex
CREATE INDEX "ClientUser_clientId_idx" ON "ClientUser"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalInvitation_token_key" ON "PortalInvitation"("token");

-- CreateIndex
CREATE INDEX "PortalInvitation_token_idx" ON "PortalInvitation"("token");

-- CreateIndex
CREATE INDEX "PortalInvitation_email_idx" ON "PortalInvitation"("email");

-- CreateIndex
CREATE INDEX "PortalInvitation_clientId_idx" ON "PortalInvitation"("clientId");

-- CreateIndex
CREATE INDEX "PortalInvitation_userId_idx" ON "PortalInvitation"("userId");

-- CreateIndex
CREATE INDEX "PortalInvitation_status_expiresAt_idx" ON "PortalInvitation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ReportApproval_reportId_approvalType_idx" ON "ReportApproval"("reportId", "approvalType");

-- CreateIndex
CREATE INDEX "ReportApproval_status_idx" ON "ReportApproval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorProfile_userId_key" ON "ContractorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorProfile_slug_key" ON "ContractorProfile"("slug");

-- CreateIndex
CREATE INDEX "ContractorProfile_isPubliclyVisible_isVerified_idx" ON "ContractorProfile"("isPubliclyVisible", "isVerified");

-- CreateIndex
CREATE INDEX "ContractorProfile_averageRating_idx" ON "ContractorProfile"("averageRating");

-- CreateIndex
CREATE INDEX "ContractorProfile_slug_idx" ON "ContractorProfile"("slug");

-- CreateIndex
CREATE INDEX "ContractorCertification_profileId_verificationStatus_idx" ON "ContractorCertification"("profileId", "verificationStatus");

-- CreateIndex
CREATE INDEX "ContractorCertification_expiryDate_idx" ON "ContractorCertification"("expiryDate");

-- CreateIndex
CREATE INDEX "ContractorCertification_certificationType_idx" ON "ContractorCertification"("certificationType");

-- CreateIndex
CREATE INDEX "ContractorServiceArea_postcode_isActive_idx" ON "ContractorServiceArea"("postcode", "isActive");

-- CreateIndex
CREATE INDEX "ContractorServiceArea_state_isActive_idx" ON "ContractorServiceArea"("state", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorServiceArea_profileId_postcode_key" ON "ContractorServiceArea"("profileId", "postcode");

-- CreateIndex
CREATE INDEX "ContractorReview_profileId_status_idx" ON "ContractorReview"("profileId", "status");

-- CreateIndex
CREATE INDEX "ContractorReview_clientUserId_idx" ON "ContractorReview"("clientUserId");

-- CreateIndex
CREATE INDEX "ContractorReview_reportId_idx" ON "ContractorReview"("reportId");

-- CreateIndex
CREATE INDEX "ContractorReview_createdAt_idx" ON "ContractorReview"("createdAt");

-- CreateIndex
CREATE INDEX "ContractorReview_overallRating_idx" ON "ContractorReview"("overallRating");

-- CreateIndex
CREATE INDEX "Report_search_vector_idx" ON "Report" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "Report_userId_createdAt_idx" ON "Report"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_userId_hazardType_idx" ON "Report"("userId", "hazardType");

-- CreateIndex
CREATE INDEX "Report_userId_status_idx" ON "Report"("userId", "status");

-- CreateIndex
CREATE INDEX "Report_clientId_createdAt_idx" ON "Report"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_includeRegulatoryCitations_idx" ON "Report"("includeRegulatoryCitations");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_token_key" ON "UserInvite"("token");

-- CreateIndex
CREATE INDEX "UserInvite_email_idx" ON "UserInvite"("email");

-- CreateIndex
CREATE INDEX "UserInvite_organizationId_idx" ON "UserInvite"("organizationId");

-- CreateIndex
CREATE INDEX "UserInvite_createdById_idx" ON "UserInvite"("createdById");

-- CreateIndex
CREATE INDEX "Integration_userId_idx" ON "Integration"("userId");

-- CreateIndex
CREATE INDEX "Integration_provider_idx" ON "Integration"("provider");

-- CreateIndex
CREATE INDEX "Integration_status_idx" ON "Integration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_userId_provider_key" ON "Integration"("userId", "provider");

-- CreateIndex
CREATE INDEX "ExternalClient_integrationId_idx" ON "ExternalClient"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalClient_integrationId_externalId_key" ON "ExternalClient"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "ExternalJob_integrationId_idx" ON "ExternalJob"("integrationId");

-- CreateIndex
CREATE INDEX "ExternalJob_claimId_idx" ON "ExternalJob"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalJob_integrationId_externalId_key" ON "ExternalJob"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "IntegrationSyncLog_integrationId_idx" ON "IntegrationSyncLog"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationSyncLog_startedAt_idx" ON "IntegrationSyncLog"("startedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_eventType_idx" ON "WebhookEvent"("provider", "eventType");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_createdAt_idx" ON "WebhookEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_integrationId_status_idx" ON "WebhookEvent"("integrationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Scope_reportId_key" ON "Scope"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_scopeId_key" ON "Estimate"("scopeId");

-- CreateIndex
CREATE INDEX "Estimate_reportId_createdAt_idx" ON "Estimate"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "EstimateLineItem_estimateId_idx" ON "EstimateLineItem"("estimateId");

-- CreateIndex
CREATE INDEX "EstimateLineItem_category_idx" ON "EstimateLineItem"("category");

-- CreateIndex
CREATE INDEX "EstimateVersion_estimateId_idx" ON "EstimateVersion"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateVersion_estimateId_version_key" ON "EstimateVersion"("estimateId", "version");

-- CreateIndex
CREATE INDEX "EstimateVariation_estimateId_idx" ON "EstimateVariation"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateVariation_estimateId_variationNumber_key" ON "EstimateVariation"("estimateId", "variationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPricingConfig_userId_key" ON "CompanyPricingConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AddonPurchase_stripeSessionId_key" ON "AddonPurchase"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AddonPurchase_stripePaymentIntentId_key" ON "AddonPurchase"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "AddonPurchase_userId_idx" ON "AddonPurchase"("userId");

-- CreateIndex
CREATE INDEX "AddonPurchase_status_idx" ON "AddonPurchase"("status");

-- CreateIndex
CREATE INDEX "AddonPurchase_purchasedAt_idx" ON "AddonPurchase"("purchasedAt");

-- CreateIndex
CREATE INDEX "ClaimAnalysisBatch_userId_idx" ON "ClaimAnalysisBatch"("userId");

-- CreateIndex
CREATE INDEX "ClaimAnalysisBatch_status_idx" ON "ClaimAnalysisBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimAnalysis_googleDriveFileId_key" ON "ClaimAnalysis"("googleDriveFileId");

-- CreateIndex
CREATE INDEX "ClaimAnalysis_batchId_idx" ON "ClaimAnalysis"("batchId");

-- CreateIndex
CREATE INDEX "ClaimAnalysis_technicianName_idx" ON "ClaimAnalysis"("technicianName");

-- CreateIndex
CREATE INDEX "ClaimAnalysis_status_idx" ON "ClaimAnalysis"("status");

-- CreateIndex
CREATE INDEX "ClaimAnalysis_completenessScore_idx" ON "ClaimAnalysis"("completenessScore");

-- CreateIndex
CREATE INDEX "MissingElement_analysisId_idx" ON "MissingElement"("analysisId");

-- CreateIndex
CREATE INDEX "MissingElement_category_idx" ON "MissingElement"("category");

-- CreateIndex
CREATE INDEX "MissingElement_severity_idx" ON "MissingElement"("severity");

-- CreateIndex
CREATE INDEX "MissingElement_isBillable_idx" ON "MissingElement"("isBillable");

-- CreateIndex
CREATE INDEX "StandardTemplate_templateType_idx" ON "StandardTemplate"("templateType");

-- CreateIndex
CREATE INDEX "StandardTemplate_isActive_idx" ON "StandardTemplate"("isActive");

-- CreateIndex
CREATE INDEX "StandardTemplate_isDefault_idx" ON "StandardTemplate"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_reportId_key" ON "Inspection"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_inspectionNumber_key" ON "Inspection"("inspectionNumber");

-- CreateIndex
CREATE INDEX "Inspection_userId_idx" ON "Inspection"("userId");

-- CreateIndex
CREATE INDEX "Inspection_status_idx" ON "Inspection"("status");

-- CreateIndex
CREATE INDEX "Inspection_inspectionDate_idx" ON "Inspection"("inspectionDate");

-- CreateIndex
CREATE INDEX "Inspection_propertyPostcode_idx" ON "Inspection"("propertyPostcode");

-- CreateIndex
CREATE INDEX "Inspection_search_vector_idx" ON "Inspection" USING GIN ("search_vector");

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentalData_inspectionId_key" ON "EnvironmentalData"("inspectionId");

-- CreateIndex
CREATE INDEX "MoistureReading_inspectionId_idx" ON "MoistureReading"("inspectionId");

-- CreateIndex
CREATE INDEX "MoistureReading_surfaceType_idx" ON "MoistureReading"("surfaceType");

-- CreateIndex
CREATE INDEX "AffectedArea_inspectionId_idx" ON "AffectedArea"("inspectionId");

-- CreateIndex
CREATE INDEX "AffectedArea_category_idx" ON "AffectedArea"("category");

-- CreateIndex
CREATE INDEX "AffectedArea_class_idx" ON "AffectedArea"("class");

-- CreateIndex
CREATE INDEX "ScopeItem_inspectionId_idx" ON "ScopeItem"("inspectionId");

-- CreateIndex
CREATE INDEX "ScopeItem_itemType_idx" ON "ScopeItem"("itemType");

-- CreateIndex
CREATE INDEX "ScopeItem_autoDetermined_idx" ON "ScopeItem"("autoDetermined");

-- CreateIndex
CREATE INDEX "CostEstimate_inspectionId_idx" ON "CostEstimate"("inspectionId");

-- CreateIndex
CREATE INDEX "CostEstimate_category_idx" ON "CostEstimate"("category");

-- CreateIndex
CREATE INDEX "Classification_inspectionId_idx" ON "Classification"("inspectionId");

-- CreateIndex
CREATE INDEX "Classification_category_idx" ON "Classification"("category");

-- CreateIndex
CREATE INDEX "Classification_class_idx" ON "Classification"("class");

-- CreateIndex
CREATE INDEX "AuditLog_inspectionId_idx" ON "AuditLog"("inspectionId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "BuildingCode_state_idx" ON "BuildingCode"("state");

-- CreateIndex
CREATE INDEX "BuildingCode_postcode_idx" ON "BuildingCode"("postcode");

-- CreateIndex
CREATE INDEX "BuildingCode_regulatoryDocumentId_idx" ON "BuildingCode"("regulatoryDocumentId");

-- CreateIndex
CREATE INDEX "RegulatoryDocument_documentType_jurisdiction_idx" ON "RegulatoryDocument"("documentType", "jurisdiction");

-- CreateIndex
CREATE INDEX "RegulatoryDocument_documentCode_idx" ON "RegulatoryDocument"("documentCode");

-- CreateIndex
CREATE INDEX "RegulatorySection_documentId_sectionNumber_idx" ON "RegulatorySection"("documentId", "sectionNumber");

-- CreateIndex
CREATE INDEX "RegulatorySection_topics_idx" ON "RegulatorySection"("topics");

-- CreateIndex
CREATE INDEX "Citation_shortReference_idx" ON "Citation"("shortReference");

-- CreateIndex
CREATE INDEX "InsurancePolicyRequirement_insurerName_idx" ON "InsurancePolicyRequirement"("insurerName");

-- CreateIndex
CREATE INDEX "CostDatabase_itemType_idx" ON "CostDatabase"("itemType");

-- CreateIndex
CREATE INDEX "CostDatabase_category_idx" ON "CostDatabase"("category");

-- CreateIndex
CREATE INDEX "CostDatabase_region_idx" ON "CostDatabase"("region");

-- CreateIndex
CREATE INDEX "CostDatabase_isActive_idx" ON "CostDatabase"("isActive");

-- CreateIndex
CREATE INDEX "InspectionPhoto_inspectionId_idx" ON "InspectionPhoto"("inspectionId");

-- CreateIndex
CREATE INDEX "InspectionPhoto_timestamp_idx" ON "InspectionPhoto"("timestamp");

-- CreateIndex
CREATE INDEX "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_timestamp_idx" ON "UsageEvent"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "UsageEvent_inspectionId_idx" ON "UsageEvent"("inspectionId");

-- CreateIndex
CREATE INDEX "UsageEvent_scanId_idx" ON "UsageEvent"("scanId");

-- CreateIndex
CREATE INDEX "UsageEvent_voiceNoteId_idx" ON "UsageEvent"("voiceNoteId");

-- CreateIndex
CREATE INDEX "UsageEvent_billingStatus_idx" ON "UsageEvent"("billingStatus");

-- CreateIndex
CREATE INDEX "UsageEvent_eventType_idx" ON "UsageEvent"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "EmailConnection_userId_key" ON "EmailConnection"("userId");

-- CreateIndex
CREATE INDEX "EmailConnection_userId_idx" ON "EmailConnection"("userId");

-- CreateIndex
CREATE INDEX "EmailConnection_provider_idx" ON "EmailConnection"("provider");

-- CreateIndex
CREATE INDEX "ScheduledEmail_userId_idx" ON "ScheduledEmail"("userId");

-- CreateIndex
CREATE INDEX "ScheduledEmail_reportId_idx" ON "ScheduledEmail"("reportId");

-- CreateIndex
CREATE INDEX "ScheduledEmail_status_scheduledAt_idx" ON "ScheduledEmail"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledEmail_scheduledAt_idx" ON "ScheduledEmail"("scheduledAt");

-- CreateIndex
CREATE INDEX "EmailAudit_userId_idx" ON "EmailAudit"("userId");

-- CreateIndex
CREATE INDEX "EmailAudit_reportId_idx" ON "EmailAudit"("reportId");

-- CreateIndex
CREATE INDEX "EmailAudit_sentAt_idx" ON "EmailAudit"("sentAt");

-- CreateIndex
CREATE INDEX "FormTemplate_userId_idx" ON "FormTemplate"("userId");

-- CreateIndex
CREATE INDEX "FormTemplate_formType_idx" ON "FormTemplate"("formType");

-- CreateIndex
CREATE INDEX "FormTemplate_category_idx" ON "FormTemplate"("category");

-- CreateIndex
CREATE INDEX "FormTemplate_status_idx" ON "FormTemplate"("status");

-- CreateIndex
CREATE INDEX "FormTemplate_isSystemTemplate_idx" ON "FormTemplate"("isSystemTemplate");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmission_submissionNumber_key" ON "FormSubmission"("submissionNumber");

-- CreateIndex
CREATE INDEX "FormSubmission_templateId_idx" ON "FormSubmission"("templateId");

-- CreateIndex
CREATE INDEX "FormSubmission_userId_idx" ON "FormSubmission"("userId");

-- CreateIndex
CREATE INDEX "FormSubmission_reportId_idx" ON "FormSubmission"("reportId");

-- CreateIndex
CREATE INDEX "FormSubmission_status_idx" ON "FormSubmission"("status");

-- CreateIndex
CREATE INDEX "FormSubmission_submittedAt_idx" ON "FormSubmission"("submittedAt");

-- CreateIndex
CREATE INDEX "FormSignature_submissionId_idx" ON "FormSignature"("submissionId");

-- CreateIndex
CREATE INDEX "FormSignature_signatoryRole_idx" ON "FormSignature"("signatoryRole");

-- CreateIndex
CREATE INDEX "FormAttachment_submissionId_idx" ON "FormAttachment"("submissionId");

-- CreateIndex
CREATE INDEX "FormAuditLog_submissionId_idx" ON "FormAuditLog"("submissionId");

-- CreateIndex
CREATE INDEX "FormAuditLog_userId_idx" ON "FormAuditLog"("userId");

-- CreateIndex
CREATE INDEX "FormAuditLog_timestamp_idx" ON "FormAuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "FormTemplateVersion_templateId_idx" ON "FormTemplateVersion"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "FormTemplateVersion_templateId_version_key" ON "FormTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorityFormTemplate_code_key" ON "AuthorityFormTemplate"("code");

-- CreateIndex
CREATE INDEX "AuthorityFormTemplate_code_idx" ON "AuthorityFormTemplate"("code");

-- CreateIndex
CREATE INDEX "AuthorityFormTemplate_isActive_idx" ON "AuthorityFormTemplate"("isActive");

-- CreateIndex
CREATE INDEX "AuthorityFormInstance_reportId_idx" ON "AuthorityFormInstance"("reportId");

-- CreateIndex
CREATE INDEX "AuthorityFormInstance_templateId_idx" ON "AuthorityFormInstance"("templateId");

-- CreateIndex
CREATE INDEX "AuthorityFormInstance_status_idx" ON "AuthorityFormInstance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorityFormSignature_signatureRequestToken_key" ON "AuthorityFormSignature"("signatureRequestToken");

-- CreateIndex
CREATE INDEX "AuthorityFormSignature_instanceId_idx" ON "AuthorityFormSignature"("instanceId");

-- CreateIndex
CREATE INDEX "AuthorityFormSignature_signatoryRole_idx" ON "AuthorityFormSignature"("signatoryRole");

-- CreateIndex
CREATE INDEX "AuthorityFormSignature_signatureRequestToken_idx" ON "AuthorityFormSignature"("signatureRequestToken");

-- CreateIndex
CREATE INDEX "SubscriptionTier_tierName_idx" ON "SubscriptionTier"("tierName");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionTier_tierName_key" ON "SubscriptionTier"("tierName");

-- CreateIndex
CREATE INDEX "InterviewQuestion_sequenceNumber_idx" ON "InterviewQuestion"("sequenceNumber");

-- CreateIndex
CREATE INDEX "InterviewQuestion_minTierLevel_idx" ON "InterviewQuestion"("minTierLevel");

-- CreateIndex
CREATE INDEX "InterviewQuestion_isActive_idx" ON "InterviewQuestion"("isActive");

-- CreateIndex
CREATE INDEX "InterviewSession_userId_idx" ON "InterviewSession"("userId");

-- CreateIndex
CREATE INDEX "InterviewSession_status_idx" ON "InterviewSession"("status");

-- CreateIndex
CREATE INDEX "InterviewSession_createdAt_idx" ON "InterviewSession"("createdAt");

-- CreateIndex
CREATE INDEX "InterviewSession_formTemplateId_idx" ON "InterviewSession"("formTemplateId");

-- CreateIndex
CREATE INDEX "InterviewSession_reportId_idx" ON "InterviewSession"("reportId");

-- CreateIndex
CREATE INDEX "InterviewResponse_interviewSessionId_idx" ON "InterviewResponse"("interviewSessionId");

-- CreateIndex
CREATE INDEX "InterviewResponse_questionId_idx" ON "InterviewResponse"("questionId");

-- CreateIndex
CREATE INDEX "InterviewStandardsMapping_interviewSessionId_idx" ON "InterviewStandardsMapping"("interviewSessionId");

-- CreateIndex
CREATE INDEX "InterviewStandardsMapping_standardCode_idx" ON "InterviewStandardsMapping"("standardCode");

-- CreateIndex
CREATE INDEX "LidarScan_inspectionId_idx" ON "LidarScan"("inspectionId");

-- CreateIndex
CREATE INDEX "LidarScan_processingStatus_idx" ON "LidarScan"("processingStatus");

-- CreateIndex
CREATE INDEX "LidarScan_uploadedBy_idx" ON "LidarScan"("uploadedBy");

-- CreateIndex
CREATE UNIQUE INDEX "FloorPlan_scanId_key" ON "FloorPlan"("scanId");

-- CreateIndex
CREATE INDEX "FloorPlan_scanId_idx" ON "FloorPlan"("scanId");

-- CreateIndex
CREATE INDEX "VoiceNote_inspectionId_idx" ON "VoiceNote"("inspectionId");

-- CreateIndex
CREATE INDEX "VoiceNote_transcriptionStatus_idx" ON "VoiceNote"("transcriptionStatus");

-- CreateIndex
CREATE INDEX "VoiceNote_recordedBy_idx" ON "VoiceNote"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceTranscript_voiceNoteId_key" ON "VoiceTranscript"("voiceNoteId");

-- CreateIndex
CREATE INDEX "VoiceTranscript_voiceNoteId_idx" ON "VoiceTranscript"("voiceNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyLookup_inspectionId_key" ON "PropertyLookup"("inspectionId");

-- CreateIndex
CREATE INDEX "PropertyLookup_expiresAt_idx" ON "PropertyLookup"("expiresAt");

-- CreateIndex
CREATE INDEX "PropertyLookup_inspectionId_idx" ON "PropertyLookup"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyLookup_propertyAddress_propertyPostcode_key" ON "PropertyLookup"("propertyAddress", "propertyPostcode");

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_stripeEventId_idx" ON "StripeWebhookEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_eventType_idx" ON "StripeWebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_status_idx" ON "StripeWebhookEvent"("status");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_receivedAt_idx" ON "StripeWebhookEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_userId_idx" ON "StripeWebhookEvent"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_eventType_idx" ON "SecurityEvent"("eventType");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_idx" ON "SecurityEvent"("userId");

-- CreateIndex
CREATE INDEX "SecurityEvent_email_idx" ON "SecurityEvent"("email");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_idx" ON "SecurityEvent"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDefinition_slug_key" ON "AgentDefinition"("slug");

-- CreateIndex
CREATE INDEX "AgentDefinition_slug_idx" ON "AgentDefinition"("slug");

-- CreateIndex
CREATE INDEX "AgentDefinition_isActive_idx" ON "AgentDefinition"("isActive");

-- CreateIndex
CREATE INDEX "AgentWorkflow_userId_idx" ON "AgentWorkflow"("userId");

-- CreateIndex
CREATE INDEX "AgentWorkflow_reportId_idx" ON "AgentWorkflow"("reportId");

-- CreateIndex
CREATE INDEX "AgentWorkflow_status_idx" ON "AgentWorkflow"("status");

-- CreateIndex
CREATE INDEX "AgentWorkflow_createdAt_idx" ON "AgentWorkflow"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTask_idempotencyKey_key" ON "AgentTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentTask_workflowId_idx" ON "AgentTask"("workflowId");

-- CreateIndex
CREATE INDEX "AgentTask_agentSlug_idx" ON "AgentTask"("agentSlug");

-- CreateIndex
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");

-- CreateIndex
CREATE INDEX "AgentTask_workflowId_status_idx" ON "AgentTask"("workflowId", "status");

-- CreateIndex
CREATE INDEX "AgentTask_workflowId_parallelGroup_sequenceOrder_idx" ON "AgentTask"("workflowId", "parallelGroup", "sequenceOrder");

-- CreateIndex
CREATE INDEX "AgentTaskLog_taskId_idx" ON "AgentTaskLog"("taskId");

-- CreateIndex
CREATE INDEX "AgentTaskLog_taskId_timestamp_idx" ON "AgentTaskLog"("taskId", "timestamp");

-- CreateIndex
CREATE INDEX "CronJobRun_jobName_startedAt_idx" ON "CronJobRun"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "CronJobRun_status_idx" ON "CronJobRun"("status");

-- CreateIndex
CREATE INDEX "InvoiceSequence_userId_year_idx" ON "InvoiceSequence"("userId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSequence_userId_year_key" ON "InvoiceSequence"("userId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_publicToken_key" ON "Invoice"("publicToken");

-- CreateIndex
CREATE INDEX "Invoice_userId_invoiceNumber_idx" ON "Invoice"("userId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_userId_status_idx" ON "Invoice"("userId", "status");

-- CreateIndex
CREATE INDEX "Invoice_userId_invoiceDate_idx" ON "Invoice"("userId", "invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_userId_dueDate_idx" ON "Invoice"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_reportId_idx" ON "Invoice"("reportId");

-- CreateIndex
CREATE INDEX "Invoice_estimateId_idx" ON "Invoice"("estimateId");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_externalInvoiceId_idx" ON "Invoice"("externalInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_publicToken_idx" ON "Invoice"("publicToken");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_sortOrder_idx" ON "InvoiceLineItem"("invoiceId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_stripePaymentIntentId_key" ON "InvoicePayment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "InvoicePayment_userId_paymentDate_idx" ON "InvoicePayment"("userId", "paymentDate");

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_paymentDate_idx" ON "InvoicePayment"("invoiceId", "paymentDate");

-- CreateIndex
CREATE INDEX "InvoicePayment_stripePaymentIntentId_idx" ON "InvoicePayment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "InvoicePayment_paymentMethod_idx" ON "InvoicePayment"("paymentMethod");

-- CreateIndex
CREATE INDEX "InvoicePayment_externalPaymentId_idx" ON "InvoicePayment"("externalPaymentId");

-- CreateIndex
CREATE INDEX "InvoicePaymentAllocation_paymentId_idx" ON "InvoicePaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "InvoicePaymentAllocation_invoiceId_idx" ON "InvoicePaymentAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePaymentAllocation_paymentId_invoiceId_key" ON "InvoicePaymentAllocation"("paymentId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_creditNoteNumber_key" ON "CreditNote"("creditNoteNumber");

-- CreateIndex
CREATE INDEX "CreditNote_userId_creditNoteNumber_idx" ON "CreditNote"("userId", "creditNoteNumber");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditNote_status_idx" ON "CreditNote"("status");

-- CreateIndex
CREATE INDEX "CreditNoteLineItem_creditNoteId_sortOrder_idx" ON "CreditNoteLineItem"("creditNoteId", "sortOrder");

-- CreateIndex
CREATE INDEX "InvoiceTemplate_userId_isDefault_idx" ON "InvoiceTemplate"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "InvoiceTemplate_userId_createdAt_idx" ON "InvoiceTemplate"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RecurringInvoice_userId_status_idx" ON "RecurringInvoice"("userId", "status");

-- CreateIndex
CREATE INDEX "RecurringInvoice_status_nextInvoiceDate_idx" ON "RecurringInvoice"("status", "nextInvoiceDate");

-- CreateIndex
CREATE INDEX "RecurringInvoice_clientId_idx" ON "RecurringInvoice"("clientId");

-- CreateIndex
CREATE INDEX "InvoiceAuditLog_invoiceId_createdAt_idx" ON "InvoiceAuditLog"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceAuditLog_userId_idx" ON "InvoiceAuditLog"("userId");

-- CreateIndex
CREATE INDEX "InvoiceEmail_invoiceId_sentAt_idx" ON "InvoiceEmail"("invoiceId", "sentAt");

-- CreateIndex
CREATE INDEX "InvoiceEmail_resendEmailId_idx" ON "InvoiceEmail"("resendEmailId");

-- CreateIndex
CREATE INDEX "PaymentReminder_status_scheduledFor_idx" ON "PaymentReminder"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "PaymentReminder_invoiceId_idx" ON "PaymentReminder"("invoiceId");

-- CreateIndex
CREATE INDEX "PilotObservation_claimId_idx" ON "PilotObservation"("claimId");

-- CreateIndex
CREATE INDEX "PilotObservation_observationType_idx" ON "PilotObservation"("observationType");

-- CreateIndex
CREATE INDEX "PilotObservation_group_idx" ON "PilotObservation"("group");

-- CreateIndex
CREATE INDEX "PilotObservation_inspectionId_idx" ON "PilotObservation"("inspectionId");

-- CreateIndex
CREATE INDEX "PilotObservation_createdAt_idx" ON "PilotObservation"("createdAt");

-- CreateIndex
CREATE INDEX "ScopeTemplate_userId_idx" ON "ScopeTemplate"("userId");

-- CreateIndex
CREATE INDEX "ScopeTemplate_claimType_idx" ON "ScopeTemplate"("claimType");

-- CreateIndex
CREATE INDEX "ContentJob_userId_idx" ON "ContentJob"("userId");

-- CreateIndex
CREATE INDEX "ContentJob_status_idx" ON "ContentJob"("status");

-- CreateIndex
CREATE INDEX "ContentJob_platform_idx" ON "ContentJob"("platform");

-- CreateIndex
CREATE INDEX "ContentJob_createdAt_idx" ON "ContentJob"("createdAt");

-- CreateIndex
CREATE INDEX "ContentPost_jobId_idx" ON "ContentPost"("jobId");

-- CreateIndex
CREATE INDEX "ContentPost_platform_idx" ON "ContentPost"("platform");

-- CreateIndex
CREATE INDEX "ContentPost_status_idx" ON "ContentPost"("status");

-- CreateIndex
CREATE INDEX "ContentPost_scheduledAt_idx" ON "ContentPost"("scheduledAt");

-- CreateIndex
CREATE INDEX "ContentAnalytics_postId_idx" ON "ContentAnalytics"("postId");

-- CreateIndex
CREATE INDEX "ContentAnalytics_recordedAt_idx" ON "ContentAnalytics"("recordedAt");

-- CreateIndex
CREATE INDEX "ContentTopic_enabled_lastUsedAt_idx" ON "ContentTopic"("enabled", "lastUsedAt");

-- CreateIndex
CREATE INDEX "ContentTopic_category_idx" ON "ContentTopic"("category");

-- CreateIndex
CREATE INDEX "ContentTopic_platform_idx" ON "ContentTopic"("platform");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_email_idx" ON "SupportTicket"("email");

-- CreateIndex (Sprint G: InspectionWorkflow)
CREATE UNIQUE INDEX "InspectionWorkflow_inspectionId_key" ON "InspectionWorkflow"("inspectionId");
CREATE INDEX "InspectionWorkflow_inspectionId_idx" ON "InspectionWorkflow"("inspectionId");
CREATE INDEX "InspectionWorkflow_jobType_idx" ON "InspectionWorkflow"("jobType");

-- CreateIndex (Sprint G: WorkflowStep)
CREATE UNIQUE INDEX "WorkflowStep_workflowId_stepOrder_key" ON "WorkflowStep"("workflowId", "stepOrder");
CREATE UNIQUE INDEX "WorkflowStep_workflowId_stepKey_key" ON "WorkflowStep"("workflowId", "stepKey");
CREATE INDEX "WorkflowStep_workflowId_idx" ON "WorkflowStep"("workflowId");
CREATE INDEX "WorkflowStep_status_idx" ON "WorkflowStep"("status");

-- CreateIndex (Sprint G: EvidenceItem)
CREATE INDEX "EvidenceItem_inspectionId_idx" ON "EvidenceItem"("inspectionId");
CREATE INDEX "EvidenceItem_evidenceClass_idx" ON "EvidenceItem"("evidenceClass");
CREATE INDEX "EvidenceItem_capturedById_idx" ON "EvidenceItem"("capturedById");
CREATE INDEX "EvidenceItem_capturedAt_idx" ON "EvidenceItem"("capturedAt");
CREATE INDEX "EvidenceItem_workflowStepId_idx" ON "EvidenceItem"("workflowStepId");
CREATE INDEX "EvidenceItem_inspectionId_evidenceClass_idx" ON "EvidenceItem"("inspectionId", "evidenceClass");

-- CreateIndex (Sprint G: ExceptionReason)
CREATE UNIQUE INDEX "ExceptionReason_evidenceItemId_key" ON "ExceptionReason"("evidenceItemId");
CREATE INDEX "ExceptionReason_reasonCode_idx" ON "ExceptionReason"("reasonCode");
CREATE INDEX "ExceptionReason_approvedById_idx" ON "ExceptionReason"("approvedById");

-- CreateIndex (RA-413: workspace scoping)
CREATE INDEX "Client_workspaceId_idx" ON "Client"("workspaceId");
CREATE INDEX "Report_workspaceId_idx" ON "Report"("workspaceId");
CREATE INDEX "Inspection_workspaceId_idx" ON "Inspection"("workspaceId");
CREATE INDEX "Invoice_workspaceId_idx" ON "Invoice"("workspaceId");
CREATE INDEX "Integration_workspaceId_idx" ON "Integration"("workspaceId");
CREATE INDEX "CostLibrary_workspaceId_idx" ON "CostLibrary"("workspaceId");
CREATE INDEX "FormTemplate_workspaceId_idx" ON "FormTemplate"("workspaceId");

-- CreateIndex (RA-416: MediaAsset)
CREATE INDEX "MediaAsset_workspaceId_idx" ON "MediaAsset"("workspaceId");
CREATE INDEX "MediaAsset_inspectionId_idx" ON "MediaAsset"("inspectionId");
CREATE INDEX "MediaAsset_evidenceId_idx" ON "MediaAsset"("evidenceId");
CREATE INDEX "MediaAsset_capturedAt_idx" ON "MediaAsset"("capturedAt");
CREATE INDEX "MediaAsset_latitude_longitude_idx" ON "MediaAsset"("latitude", "longitude");
CREATE INDEX "MediaAsset_mimeType_idx" ON "MediaAsset"("mimeType");

-- CreateIndex (RA-414: ProviderConnection + AiUsageLog)
CREATE UNIQUE INDEX "ProviderConnection_workspaceId_provider_key" ON "ProviderConnection"("workspaceId", "provider");
CREATE INDEX "ProviderConnection_workspaceId_idx" ON "ProviderConnection"("workspaceId");
CREATE INDEX "ProviderConnection_provider_idx" ON "ProviderConnection"("provider");
CREATE INDEX "ProviderConnection_status_idx" ON "ProviderConnection"("status");
CREATE INDEX "AiUsageLog_workspaceId_createdAt_idx" ON "AiUsageLog"("workspaceId", "createdAt");
CREATE INDEX "AiUsageLog_memberId_idx" ON "AiUsageLog"("memberId");
CREATE INDEX "AiUsageLog_provider_idx" ON "AiUsageLog"("provider");
CREATE INDEX "AiUsageLog_taskType_idx" ON "AiUsageLog"("taskType");
CREATE INDEX "AiUsageLog_success_idx" ON "AiUsageLog"("success");
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

