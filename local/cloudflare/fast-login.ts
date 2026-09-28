import { env } from "cloudflare:workers";
import { SignJWT } from "jose";
import { authenticateLogin, invalidLoginMessage } from "./login-credentials";

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
};
type Database = { prepare(sql: string): Statement };
const bindings = env as unknown as { DB: Database; JWT_SECRET: string };

const WINDOW_MS = 15 * 60_000;

function response(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function hash(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function consume(key: string, limit: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = Date.now();
  const result = await bindings.DB.prepare(`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt") VALUES (?, 1, ?)
    ON CONFLICT("key") DO UPDATE SET
      "count" = CASE WHEN "resetAt" <= ? THEN 1 ELSE "count" + 1 END,
      "resetAt" = CASE WHEN "resetAt" <= ? THEN ? ELSE "resetAt" END
    RETURNING "count", "resetAt"
  `).bind(key, now + WINDOW_MS, now, now, now + WINDOW_MS).first<{ count: number; resetAt: number }>();
  if (!result) throw new Error("Rate limit unavailable");
  return { allowed: result.count <= limit, retryAfter: Math.max(1, Math.ceil((result.resetAt - now) / 1000)) };
}

async function readBody(request: Request): Promise<Record<string, unknown> | "invalid" | "too_large"> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 64 * 1024) return "too_large";
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 64 * 1024) { await reader.cancel(); return "too_large"; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  if (size === 0) return {};
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : "invalid";
  } catch {
    return "invalid";
  }
}

export async function fastLogin(request: Request): Promise<Response> {
  const ip = request.headers.get("cf-connecting-ip")?.trim();
  if (ip) {
    const client = await consume(`auth-login-client:${await hash(ip)}`, 30);
    if (!client.allowed) {
      const denied = response({ error: "Too many login attempts. Try again later.", code: "RATE_LIMITED" }, 429);
      denied.headers.set("Retry-After", String(client.retryAfter));
      return denied;
    }
  }

  const body = await readBody(request);
  if (body === "too_large") return response({ error: "Request body is too large.", code: "PAYLOAD_TOO_LARGE" }, 413);
  if (body === "invalid") return response({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, 400);
  const globalKey = `auth-login-username:${await hash("single-admin")}`;
  const globalLimit = await consume(globalKey, 8);
  if (!globalLimit.allowed) {
    const denied = response({ error: "Too many login attempts. Try again later.", code: "RATE_LIMITED" }, 429);
    denied.headers.set("Retry-After", String(globalLimit.retryAfter));
    return denied;
  }

  const password = typeof body.password === "string" ? body.password : "";
  const totpCode = typeof body.totpCode === "string" ? body.totpCode : "";
  const admin = await authenticateLogin("", password, totpCode);
  if (!admin) return response({ error: invalidLoginMessage, code: "UNAUTHORIZED" }, 401);
  await bindings.DB.prepare(`DELETE FROM "RateLimitBucket" WHERE "key" = ?`).bind(globalKey).run();
  await bindings.DB.prepare(`UPDATE "LocalAdmin" SET "lastLoginAt" = ?, "updatedAt" = ? WHERE "id" = ?`)
    .bind(new Date().toISOString(), new Date().toISOString(), admin.id).run();

  if (!bindings.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  const version = await bindings.DB.prepare(`SELECT "authVersion" FROM "LocalAdmin" WHERE "id" = ?`)
    .bind(admin.id).first<{ authVersion: number }>();
  const token = await new SignJWT({ username: admin.username, authVersion: version?.authVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setIssuer("subboost-local")
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(bindings.JWT_SECRET));
  const result = response({ success: true, user: admin }, 200);
  result.headers.set("Set-Cookie", `subboost_local_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
  return result;
}
