CREATE TABLE "SubscriptionYamlCache" (
  "subscriptionId" TEXT NOT NULL PRIMARY KEY,
  "sourceUpdatedAt" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "enqueuedAt" TEXT NOT NULL,
  "yaml" TEXT,
  "name" TEXT,
  "subscriptionInfo" TEXT,
  "cacheExpirySeconds" INTEGER,
  "autoUpdateIntervalSeconds" INTEGER,
  "isAdmin" BOOLEAN,
  CONSTRAINT "SubscriptionYamlCache_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE
);
