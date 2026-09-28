ALTER TABLE "LocalAdmin" ADD COLUMN "totpSecretEncrypted" TEXT;
ALTER TABLE "LocalAdmin" ADD COLUMN "totpPendingEncrypted" TEXT;
ALTER TABLE "LocalAdmin" ADD COLUMN "totpPendingAt" TEXT;
