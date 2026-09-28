CREATE TABLE "ManualRefreshJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "subscriptionId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "resultJson" TEXT,
  "errorText" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  CONSTRAINT "ManualRefreshJob_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE
);
CREATE INDEX "ManualRefreshJob_createdAt_idx" ON "ManualRefreshJob"("createdAt");
