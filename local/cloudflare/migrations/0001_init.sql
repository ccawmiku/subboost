-- CreateTable
CREATE TABLE "LocalAdmin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLoginAt" DATETIME,
    "allowUnsafeSubscriptionSources" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "LocalTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "encryptedConfig" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LocalTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "LocalAdmin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "encryptedUrls" TEXT NOT NULL,
    "encryptedNodes" TEXT NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "encryptedSubscriptionInfo" TEXT,
    "autoUpdateInterval" INTEGER,
    "cacheExpiresAt" DATETIME,
    "lastAccessedAt" DATETIME,
    "lastUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "LocalAdmin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubscriptionAutoUpdateState" (
    "subscriptionId" TEXT NOT NULL PRIMARY KEY,
    "externalFailureCount" INTEGER NOT NULL DEFAULT 0,
    "failureSourceState" TEXT,
    "lastFailedAt" DATETIME,
    "lastAttemptedAt" DATETIME,
    "nodeQuotaFailureCount" INTEGER NOT NULL DEFAULT 0,
    "lastNodeQuotaExceededAt" DATETIME,
    "lastNodeQuotaActual" INTEGER,
    "lastNodeQuotaLimit" INTEGER,
    "disabledAt" DATETIME,
    "disabledReason" TEXT,
    "disabledPreviousInterval" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubscriptionAutoUpdateState_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobLeaseLock" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "ownerToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RevokedSession" (
    "revocationKey" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalAdmin_username_key" ON "LocalAdmin"("username");

-- CreateIndex
CREATE INDEX "LocalTemplate_ownerId_idx" ON "LocalTemplate"("ownerId");

-- CreateIndex
CREATE INDEX "LocalTemplate_updatedAt_idx" ON "LocalTemplate"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_token_key" ON "Subscription"("token");

-- CreateIndex
CREATE INDEX "Subscription_ownerId_idx" ON "Subscription"("ownerId");

-- CreateIndex
CREATE INDEX "Subscription_lastUpdatedAt_idx" ON "Subscription"("lastUpdatedAt");

-- CreateIndex
CREATE INDEX "JobLeaseLock_expiresAt_idx" ON "JobLeaseLock"("expiresAt");

-- CreateIndex
CREATE INDEX "RevokedSession_expiresAt_idx" ON "RevokedSession"("expiresAt");
