import { env } from "cloudflare:workers";
import { decryptJson } from "../src/lib/crypto";
import { verifyPassword } from "./password";
import { verifyTotp } from "./totp";
import { consumeRecoveryCode } from "./recovery-codes";

type Statement = { first<T>(): Promise<T | null> };
type Database = { prepare(sql: string): Statement };
const db = (env as unknown as { DB: Database }).DB;

type AdminRow = { id: string; username: string; passwordHash: string; totpSecretEncrypted: string | null; recoveryCodes: string | null };

export const singleAdminLogin = true;
export const invalidLoginMessage = "Invalid password or authenticator code.";

export async function authenticateLogin(_username: string, password: string, totpCode: string) {
  const admin = await db.prepare(`SELECT "id", "username", "passwordHash", "totpSecretEncrypted", "recoveryCodes" FROM "LocalAdmin" LIMIT 1`)
    .first<AdminRow>();
  if (!admin || !await verifyPassword(password, admin.passwordHash)) return null;
  if (admin.totpSecretEncrypted) {
    const secret = decryptJson(admin.totpSecretEncrypted, "");
    if (!secret || !(await verifyTotp(secret, totpCode) || await consumeRecoveryCode(admin.id, admin.recoveryCodes, totpCode))) return null;
  }
  return { id: admin.id, username: admin.username };
}
