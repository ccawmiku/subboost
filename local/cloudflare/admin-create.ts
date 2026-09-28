import { env } from "cloudflare:workers";

type D1Database = {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<{ meta: { changes: number } }> };
  };
};

export async function createInitialAdmin(username: string, passwordHash: string): Promise<{ id: string; username: string } | null> {
  const db = (env as unknown as { DB: D1Database }).DB;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const result = await db.prepare(`
    INSERT INTO "LocalAdmin" ("id", "username", "passwordHash", "createdAt", "updatedAt", "lastLoginAt")
    SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM "LocalAdmin")
  `).bind(id, username, passwordHash, now, now, now).run();
  return result.meta.changes === 1 ? { id, username } : null;
}
