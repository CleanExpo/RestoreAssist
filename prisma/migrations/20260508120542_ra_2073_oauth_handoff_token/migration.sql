-- RA-2073: short-lived handoff token for ferrying NextAuth session cookie
-- from SFSafariViewController's cookie jar into the parent WKWebView's jar
-- on iOS Capacitor. Tokens are single-use, 60-second TTL. The encoded JWT
-- is persisted alongside the token hash so /auth/redeem can re-emit it as
-- a Set-Cookie header from a WKWebView-issued fetch.

CREATE TABLE "OAuthHandoffToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encodedJwt" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthHandoffToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthHandoffToken_tokenHash_key" ON "OAuthHandoffToken"("tokenHash");
CREATE INDEX "OAuthHandoffToken_tokenHash_idx" ON "OAuthHandoffToken"("tokenHash");
CREATE INDEX "OAuthHandoffToken_expiresAt_idx" ON "OAuthHandoffToken"("expiresAt");
CREATE INDEX "OAuthHandoffToken_userId_idx" ON "OAuthHandoffToken"("userId");

ALTER TABLE "OAuthHandoffToken" ADD CONSTRAINT "OAuthHandoffToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
