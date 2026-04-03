-- CreateTable
CREATE TABLE "AppRelease" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "commitSha" TEXT,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserReleaseSeen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReleaseSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppRelease_version_key" ON "AppRelease"("version");

-- CreateIndex
CREATE INDEX "AppRelease_createdAt_idx" ON "AppRelease"("createdAt");

-- CreateIndex
CREATE INDEX "UserReleaseSeen_userId_idx" ON "UserReleaseSeen"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserReleaseSeen_userId_releaseId_key" ON "UserReleaseSeen"("userId", "releaseId");

-- AddForeignKey
ALTER TABLE "UserReleaseSeen" ADD CONSTRAINT "UserReleaseSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReleaseSeen" ADD CONSTRAINT "UserReleaseSeen_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "AppRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
