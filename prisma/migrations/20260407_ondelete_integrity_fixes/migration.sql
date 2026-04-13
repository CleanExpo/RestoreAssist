-- Data integrity: add missing onDelete behaviours to prevent FK Restrict errors
-- that would silently block user deletion in production.

-- ContentJob → User (Cascade): user deletion must cascade to their video jobs
ALTER TABLE "ContentJob" DROP CONSTRAINT IF EXISTS "ContentJob_userId_fkey";
ALTER TABLE "ContentJob" ADD CONSTRAINT "ContentJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ContentPost → ContentJob (Cascade): job deletion must cascade to posts
ALTER TABLE "ContentPost" DROP CONSTRAINT IF EXISTS "ContentPost_jobId_fkey";
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "ContentJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ContentAnalytics → ContentPost (Cascade): post deletion cascades to analytics
ALTER TABLE "ContentAnalytics" DROP CONSTRAINT IF EXISTS "ContentAnalytics_postId_fkey";
ALTER TABLE "ContentAnalytics" ADD CONSTRAINT "ContentAnalytics_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BuildingCode → RegulatoryDocument (SetNull): document deletion nulls the FK, not blocked
ALTER TABLE "BuildingCode" DROP CONSTRAINT IF EXISTS "BuildingCode_regulatoryDocumentId_fkey";
ALTER TABLE "BuildingCode" ADD CONSTRAINT "BuildingCode_regulatoryDocumentId_fkey"
    FOREIGN KEY ("regulatoryDocumentId") REFERENCES "RegulatoryDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AgentTask → AgentDefinition (SetNull): renaming/removing a slug does not cascade-delete tasks
ALTER TABLE "AgentTask" DROP CONSTRAINT IF EXISTS "AgentTask_agentSlug_fkey";
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentSlug_fkey"
    FOREIGN KEY ("agentSlug") REFERENCES "AgentDefinition"("slug") ON DELETE SET NULL ON UPDATE CASCADE;
