import { createHash } from "node:crypto";
import { env } from "cloudflare:workers";
import { apiError } from "../src/lib/http";

type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<unknown> };
type D1Database = { prepare(sql: string): Statement };
const db = (env as unknown as { DB: D1Database }).DB;

export type LocalRateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function hashLocalRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function consumeLocalRateLimit(scope: string, key: string, options: { limit: number; windowMs: number; now?: number }): Promise<LocalRateLimitResult> {
  const now = options.now ?? Date.now();
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1000, Math.floor(options.windowMs));
  const result = await db.prepare(`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt") VALUES (?, 1, ?)
    ON CONFLICT("key") DO UPDATE SET
      "count" = CASE WHEN "resetAt" <= ? THEN 1 ELSE "count" + 1 END,
      "resetAt" = CASE WHEN "resetAt" <= ? THEN ? ELSE "resetAt" END
    RETURNING "count", "resetAt"
  `).bind(`${scope}:${key}`, now + windowMs, now, now, now + windowMs).first<{ count: number; resetAt: number }>();
  if (!result) throw new Error("Rate limit state unavailable");
  return result.count <= limit
    ? { allowed: true, retryAfterSeconds: 0 }
    : { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((result.resetAt - now) / 1000)) };
}

export function getTrustedClientRateLimitKey(request: Request): string | null {
  const ip = request.headers.get("cf-connecting-ip")?.trim();
  return ip ? hashLocalRateLimitKey(ip) : null;
}

export async function resetLocalRateLimit(scope: string, key: string): Promise<void> {
  await db.prepare(`DELETE FROM "RateLimitBucket" WHERE "key" = ?`).bind(`${scope}:${key}`).run();
}

export function localRateLimitResponse(message: string, retryAfterSeconds: number): Response {
  const response = apiError(message, "RATE_LIMITED", 429);
  response.headers.set("Retry-After", String(Math.max(1, retryAfterSeconds)));
  return response;
}
