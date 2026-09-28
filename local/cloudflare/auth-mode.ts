import { env } from "cloudflare:workers";

type Statement = { first<T>(): Promise<T | null> };
type Database = { prepare(sql: string): Statement };
const db = (env as unknown as { DB: Database }).DB;

export async function authModeFields() {
  const admin = await db.prepare(`SELECT "totpSecretEncrypted" FROM "LocalAdmin" LIMIT 1`)
    .first<{ totpSecretEncrypted: string | null }>();
  return { singleAdminLogin: true, totpEnabled: Boolean(admin?.totpSecretEncrypted) };
}
