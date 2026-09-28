CREATE TABLE "SourceImportJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "encryptedRequest" TEXT NOT NULL,
  "encryptedResult" TEXT,
  "httpStatus" INTEGER,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  CONSTRAINT "SourceImportJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "LocalAdmin" ("id") ON DELETE CASCADE
);
CREATE INDEX "SourceImportJob_createdAt_idx" ON "SourceImportJob"("createdAt");
