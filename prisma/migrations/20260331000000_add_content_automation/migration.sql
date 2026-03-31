-- CreateTable: ContentJob
CREATE TABLE "ContentJob" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "product"           TEXT NOT NULL,
    "angle"             TEXT NOT NULL,
    "platform"          TEXT NOT NULL,
    "duration"          INTEGER NOT NULL,
    "status"            TEXT NOT NULL DEFAULT 'PENDING',
    "hook"              TEXT,
    "agitation"         TEXT,
    "solution"          TEXT,
    "cta"               TEXT,
    "voiceoverText"     TEXT,
    "caption"           TEXT,
    "hashtags"          TEXT,
    "audioUrl"          TEXT,
    "videoUrl"          TEXT,
    "heygenRenderJobId" TEXT,
    "errorMessage"      TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ContentPost
CREATE TABLE "ContentPost" (
    "id"             TEXT NOT NULL,
    "jobId"          TEXT NOT NULL,
    "platform"       TEXT NOT NULL,
    "externalPostId" TEXT,
    "postUrl"        TEXT,
    "scheduledAt"    TIMESTAMP(3),
    "postedAt"       TIMESTAMP(3),
    "status"         TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ContentAnalytics
CREATE TABLE "ContentAnalytics" (
    "id"         TEXT NOT NULL,
    "postId"     TEXT NOT NULL,
    "views"      INTEGER NOT NULL DEFAULT 0,
    "likes"      INTEGER NOT NULL DEFAULT 0,
    "shares"     INTEGER NOT NULL DEFAULT 0,
    "comments"   INTEGER NOT NULL DEFAULT 0,
    "reach"      INTEGER NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentJob_userId_idx" ON "ContentJob"("userId");
CREATE INDEX "ContentJob_status_idx" ON "ContentJob"("status");
CREATE INDEX "ContentJob_platform_idx" ON "ContentJob"("platform");
CREATE INDEX "ContentJob_createdAt_idx" ON "ContentJob"("createdAt");

CREATE INDEX "ContentPost_jobId_idx" ON "ContentPost"("jobId");
CREATE INDEX "ContentPost_platform_idx" ON "ContentPost"("platform");
CREATE INDEX "ContentPost_status_idx" ON "ContentPost"("status");
CREATE INDEX "ContentPost_scheduledAt_idx" ON "ContentPost"("scheduledAt");

CREATE INDEX "ContentAnalytics_postId_idx" ON "ContentAnalytics"("postId");
CREATE INDEX "ContentAnalytics_recordedAt_idx" ON "ContentAnalytics"("recordedAt");

-- AddForeignKey
ALTER TABLE "ContentJob" ADD CONSTRAINT "ContentJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "ContentJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContentAnalytics" ADD CONSTRAINT "ContentAnalytics_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
