import { env } from "cloudflare:workers";

type Statement = { bind(...values: unknown[]): Statement; run(): Promise<{ meta: { changes: number } }> };
const db = (env as unknown as { DB: { prepare(sql: string): Statement } }).DB;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

async function digest(code: string): Promise<string> {
  const normalized = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function generateRecoveryCodes(): Promise<{ codes: string[]; hashes: string }> {
  const codes = Array.from({ length: 10 }, makeCode);
  return { codes, hashes: JSON.stringify(await Promise.all(codes.map(digest))) };
}

export async function consumeRecoveryCode(adminId: string, serialized: string | null, code: string): Promise<boolean> {
  if (!serialized || !/^[A-Za-z0-9-]{12,18}$/.test(code)) return false;
  let hashes: string[];
  try { hashes = JSON.parse(serialized) as string[]; } catch { return false; }
  if (!Array.isArray(hashes)) return false;
  const candidate = await digest(code);
  const index = hashes.findIndex((hash) => hash === candidate);
  if (index < 0) return false;
  hashes.splice(index, 1);
  const result = await db.prepare(`UPDATE "LocalAdmin" SET "recoveryCodes" = ? WHERE "id" = ? AND "recoveryCodes" = ?`)
    .bind(JSON.stringify(hashes), adminId, serialized).run();
  return result.meta.changes === 1;
}
