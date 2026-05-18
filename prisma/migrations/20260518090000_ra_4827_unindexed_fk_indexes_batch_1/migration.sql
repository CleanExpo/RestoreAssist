-- RA-4827 perf advisor cleanup batch 1: 23 unindexed FK columns
-- across 16 Prisma-managed tables. Each `CREATE INDEX IF NOT EXISTS` is
-- idempotent — safe to re-run, safe on prod where some may have been
-- added manually via the Supabase dashboard.
--
-- Drops `unindexed_foreign_keys` perf-advisor WARN count from 35 → 12
-- (the remaining 12 are: 3 in tables not yet in Prisma schema —
-- ClientInvite, MobileInspection×2 — plus 9 in non-Prisma snake_case
-- tables: customers/orders/order_items/products/quotes/quote_items/users.
-- Separate tickets cover those.)

CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON public."Account" ("userId");
CREATE INDEX IF NOT EXISTS "AffectedArea_roomId_idx" ON public."AffectedArea" ("roomId");
CREATE INDEX IF NOT EXISTS "AssessmentGeneration_generatedById_idx" ON public."AssessmentGeneration" ("generatedById");
CREATE INDEX IF NOT EXISTS "Citation_documentId_idx" ON public."Citation" ("documentId");
CREATE INDEX IF NOT EXISTS "CostItem_libraryId_idx" ON public."CostItem" ("libraryId");
CREATE INDEX IF NOT EXISTS "Estimate_userId_idx" ON public."Estimate" ("userId");
CREATE INDEX IF NOT EXISTS "InspectionPhoto_roomId_idx" ON public."InspectionPhoto" ("roomId");
CREATE INDEX IF NOT EXISTS "Invoice_originalInvoiceId_idx" ON public."Invoice" ("originalInvoiceId");
CREATE INDEX IF NOT EXISTS "Invoice_recurringInvoiceId_idx" ON public."Invoice" ("recurringInvoiceId");
CREATE INDEX IF NOT EXISTS "Invoice_templateId_idx" ON public."Invoice" ("templateId");
CREATE INDEX IF NOT EXISTS "Organization_ownerId_idx" ON public."Organization" ("ownerId");
CREATE INDEX IF NOT EXISTS "PromptVariant_parentVariantId_idx" ON public."PromptVariant" ("parentVariantId");
CREATE INDEX IF NOT EXISTS "Report_assignedAdminId_idx" ON public."Report" ("assignedAdminId");
CREATE INDEX IF NOT EXISTS "Report_assignedManagerId_idx" ON public."Report" ("assignedManagerId");
CREATE INDEX IF NOT EXISTS "Scope_userId_idx" ON public."Scope" ("userId");
CREATE INDEX IF NOT EXISTS "ScopeItem_roomId_idx" ON public."ScopeItem" ("roomId");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON public."Session" ("userId");
CREATE INDEX IF NOT EXISTS "StandardTemplate_userId_idx" ON public."StandardTemplate" ("userId");
CREATE INDEX IF NOT EXISTS "User_managedById_idx" ON public."User" ("managedById");
CREATE INDEX IF NOT EXISTS "User_organizationId_idx" ON public."User" ("organizationId");
CREATE INDEX IF NOT EXISTS "User_subscriptionTierId_idx" ON public."User" ("subscriptionTierId");
CREATE INDEX IF NOT EXISTS "UserInvite_managedById_idx" ON public."UserInvite" ("managedById");
CREATE INDEX IF NOT EXISTS "UserReleaseSeen_releaseId_idx" ON public."UserReleaseSeen" ("releaseId");
