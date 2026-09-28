ALTER TABLE "SubscriptionYamlCache" ADD COLUMN "failureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionYamlCache" ADD COLUMN "nextRetryAt" TEXT;
ALTER TABLE "SubscriptionYamlCache" ADD COLUMN "lastError" TEXT;
