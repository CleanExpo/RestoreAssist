-- DropTable: Remove video generation pipeline models
-- Drops ContentAnalytics first (references ContentPost), then ContentPost (references ContentJob)

DROP TABLE IF EXISTS "ContentAnalytics";
DROP TABLE IF EXISTS "ContentPost";
DROP TABLE IF EXISTS "ContentJob";
DROP TABLE IF EXISTS "ContentTopic";
