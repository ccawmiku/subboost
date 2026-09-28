import { env } from "cloudflare:workers";
import { adminFromSessionToken } from "./auth";
import { verifyPassword, hashPassword } from "./password";
import { verifyTotp } from "./totp";
import { decryptJson } from "../src/lib/crypto";
import { consumeLocalRateLimit, localRateLimitResponse } from "./rate-limit";

type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<{ meta: { changes: number } }> };
const db = (env as unknown as { DB: { prepare(sql: string): Statement } }).DB;

function reply(error: string, status: number): Response {
  return new Response(JSON.stringify({ error, code: status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST" }), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function changePassword(request: Request): Promise<Response> {
  const token = /(?:^|;\s*)subboost_local_session=([^;]+)/.exec(request.headers.get("cookie") || "")?.[1] || "";
  const admin = await adminFromSessionToken(token);
  if (!admin) return reply("Authentication required.", 401);
  const limit = await consumeLocalRateLimit("password-change", admin.id, { limit: 5, windowMs: 15 * 60_000 });
  if (!limit.allowed) return localRateLimitResponse("Too many attempts. Try again later.", limit.retryAfterSeconds);
  const declared = Number(request.headers.get("content-length"));
  if (declared > 64 * 1024) return reply("Request body too large.", 400);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 64 * 1024) return reply("Request body too large.", 400);
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch { return reply("Invalid JSON body.", 400); }
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (newPassword.length < 10 || newPassword.length > 256) return reply("New password must contain 10 to 256 characters.", 400);
  if (currentPassword === newPassword) return reply("Choose a different password.", 400);
  const row = await db.prepare(`SELECT "passwordHash", "totpSecretEncrypted" FROM "LocalAdmin" WHERE "id" = ?`)
    .bind(admin.id).first<{ passwordHash: string; totpSecretEncrypted: string | null }>();
  if (!row || !await verifyPassword(currentPassword, row.passwordHash)) return reply("Invalid current password or authenticator code.", 401);
  if (row.totpSecretEncrypted) {
    const secret = decryptJson(row.totpSecretEncrypted, "");
    if (!secret || !await verifyTotp(secret, code)) return reply("Invalid current password or authenticator code.", 401);
  }
  const replacement = await hashPassword(newPassword);
  const result = await db.prepare(`
    UPDATE "LocalAdmin" SET "passwordHash" = ?, "authVersion" = "authVersion" + 1, "updatedAt" = ?
    WHERE "id" = ? AND "passwordHash" = ?
  `).bind(replacement, new Date().toISOString(), admin.id, row.passwordHash).run();
  if (result.meta.changes !== 1) return reply("Account changed. Retry.", 400);
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "Set-Cookie": "subboost_local_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure" },
  });
}
