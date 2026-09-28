import { env } from "cloudflare:workers";
import { decryptJson, encryptJson } from "../src/lib/crypto";
import { apiError, json } from "../src/lib/http";
import { verifyPassword } from "./password";
import { createTotpSecret, totpUri, verifyTotp } from "./totp";
import { consumeLocalRateLimit, localRateLimitResponse, resetLocalRateLimit } from "./rate-limit";
import { generateRecoveryCodes } from "./recovery-codes";

type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<{ meta: { changes: number } }> };
type Database = { prepare(sql: string): Statement };
const db = (env as unknown as { DB: Database }).DB;

type AdminRow = {
  username: string;
  passwordHash: string;
  totpSecretEncrypted: string | null;
  totpPendingEncrypted: string | null;
  totpPendingAt: string | null;
};

async function loadAdmin(ownerId: string): Promise<AdminRow | null> {
  return db.prepare(`
    SELECT "username", "passwordHash", "totpSecretEncrypted", "totpPendingEncrypted", "totpPendingAt"
    FROM "LocalAdmin" WHERE "id" = ?
  `).bind(ownerId).first<AdminRow>();
}

function privateJson(value: unknown, status = 200): Response {
  const response = json(value, status);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function getTotpStatus(ownerId: string): Promise<Response> {
  const admin = await loadAdmin(ownerId);
  if (!admin) return apiError("Administrator not found.", "NOT_FOUND", 404);
  return privateJson({ available: true, enabled: Boolean(admin.totpSecretEncrypted), pending: Boolean(admin.totpPendingEncrypted) });
}

export async function beginTotpEnrollment(ownerId: string, password: string): Promise<Response> {
  const admin = await loadAdmin(ownerId);
  if (!admin || !await verifyPassword(password, admin.passwordHash)) {
    return apiError("Invalid password.", "UNAUTHORIZED", 401);
  }
  if (admin.totpSecretEncrypted) return apiError("TOTP is already enabled.", "CONFLICT", 409);
  const secret = createTotpSecret();
  const now = new Date().toISOString();
  const updated = await db.prepare(`
    UPDATE "LocalAdmin" SET "totpPendingEncrypted" = ?, "totpPendingAt" = ?, "updatedAt" = ?
    WHERE "id" = ? AND "totpSecretEncrypted" IS NULL
  `).bind(encryptJson(secret), now, now, ownerId).run();
  if (updated.meta.changes !== 1) return apiError("TOTP settings changed. Retry.", "CONFLICT", 409);
  return privateJson({ secret, uri: totpUri(admin.username, secret), expiresInSeconds: 600 });
}

export async function confirmTotpEnrollment(ownerId: string, code: string): Promise<Response> {
  const limit = await consumeLocalRateLimit("totp-management", ownerId, { limit: 10, windowMs: 15 * 60_000 });
  if (!limit.allowed) return localRateLimitResponse("Too many TOTP attempts. Try again later.", limit.retryAfterSeconds);
  const admin = await loadAdmin(ownerId);
  if (!admin?.totpPendingEncrypted || !admin.totpPendingAt || admin.totpSecretEncrypted) {
    return apiError("No pending TOTP setup.", "BAD_REQUEST", 400);
  }
  const pendingAt = Date.parse(admin.totpPendingAt);
  if (!Number.isFinite(pendingAt) || Date.now() - pendingAt > 600_000 || pendingAt > Date.now() + 60_000) {
    return apiError("TOTP setup expired. Start again.", "BAD_REQUEST", 400);
  }
  const secret = decryptJson(admin.totpPendingEncrypted, "");
  if (!secret || !await verifyTotp(secret, code)) return apiError("Invalid authenticator code.", "UNAUTHORIZED", 401);
  const recovery = await generateRecoveryCodes();
  const updated = await db.prepare(`
    UPDATE "LocalAdmin" SET "totpSecretEncrypted" = "totpPendingEncrypted",
      "totpPendingEncrypted" = NULL, "totpPendingAt" = NULL, "recoveryCodes" = ?, "updatedAt" = ?
    WHERE "id" = ? AND "totpPendingEncrypted" = ? AND "totpSecretEncrypted" IS NULL
  `).bind(recovery.hashes, new Date().toISOString(), ownerId, admin.totpPendingEncrypted).run();
  if (updated.meta.changes !== 1) return apiError("TOTP setup changed. Start again.", "CONFLICT", 409);
  await resetLocalRateLimit("totp-management", ownerId);
  return privateJson({ enabled: true, recoveryCodes: recovery.codes });
}

export async function disableTotp(ownerId: string, password: string, code: string): Promise<Response> {
  const limit = await consumeLocalRateLimit("totp-management", ownerId, { limit: 10, windowMs: 15 * 60_000 });
  if (!limit.allowed) return localRateLimitResponse("Too many TOTP attempts. Try again later.", limit.retryAfterSeconds);
  const admin = await loadAdmin(ownerId);
  if (!admin?.totpSecretEncrypted) return apiError("TOTP is not enabled.", "BAD_REQUEST", 400);
  if (!await verifyPassword(password, admin.passwordHash)) return apiError("Invalid password or authenticator code.", "UNAUTHORIZED", 401);
  const secret = decryptJson(admin.totpSecretEncrypted, "");
  if (!secret || !await verifyTotp(secret, code)) return apiError("Invalid password or authenticator code.", "UNAUTHORIZED", 401);
  const updated = await db.prepare(`
    UPDATE "LocalAdmin" SET "totpSecretEncrypted" = NULL, "totpPendingEncrypted" = NULL, "recoveryCodes" = NULL,
      "totpPendingAt" = NULL, "updatedAt" = ?
    WHERE "id" = ? AND "totpSecretEncrypted" = ?
  `).bind(new Date().toISOString(), ownerId, admin.totpSecretEncrypted).run();
  if (updated.meta.changes !== 1) return apiError("TOTP settings changed. Retry.", "CONFLICT", 409);
  await resetLocalRateLimit("totp-management", ownerId);
  return privateJson({ enabled: false });
}
