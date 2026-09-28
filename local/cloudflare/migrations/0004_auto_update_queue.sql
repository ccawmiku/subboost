CREATE TABLE "AutoUpdateQueueClaim" (
  "subscriptionId" TEXT NOT NULL PRIMARY KEY,
  "nextQueuedAt" TEXT NOT NULL,
  CONSTRAINT "AutoUpdateQueueClaim_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE
);
CREATE INDEX "AutoUpdateQueueClaim_nextQueuedAt_idx" ON "AutoUpdateQueueClaim"("nextQueuedAt");
