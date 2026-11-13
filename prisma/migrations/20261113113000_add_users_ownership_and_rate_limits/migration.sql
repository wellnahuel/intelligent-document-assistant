-- Sprint 6: users, document ownership and persistent rate limits.
--
-- Existing documents predate authentication. They are preserved under a
-- legacy owner with a deliberately invalid password hash: Argon2 verification
-- fails for it, so nobody can sign in as this account. Reassign a legacy
-- document manually only after deciding its real owner, for example:
--
--   UPDATE "Document" SET "userId" = '<real-user-id>' WHERE "id" = '<document-id>';
--
-- The app never exposes the legacy owner as a selectable session.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- Preserve existing documents before the ownership column becomes required.
INSERT INTO "User" ("id", "email", "passwordHash", "name", "createdAt", "updatedAt")
VALUES (
    'legacy-owner-0000000000000000',
    'legacy-owner@local.invalid',
    '!legacy-account-no-login',
    'Legacy owner',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "userId" TEXT;

UPDATE "Document"
SET "userId" = 'legacy-owner-0000000000000000'
WHERE "userId" IS NULL;

ALTER TABLE "Document" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Document_userId_createdAt_idx" ON "Document"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
