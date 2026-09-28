import { env } from "cloudflare:workers";
import { adminFromSessionToken } from "./auth";

type Statement = { first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> };
const db = (env as unknown as { DB: { prepare(sql: string): Statement } }).DB;

export async function usageSnapshot(request: Request): Promise<Response> {
  const token = /(?:^|;\s*)subboost_local_session=([^;]+)/.exec(request.headers.get("cookie") || "")?.[1] || "";
  if (!await adminFromSessionToken(token)) return new Response(null, { status: 401 });
  const [subscriptions, yaml, failures, imports, rules] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM "Subscription"`).first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN "status" = 'ready' THEN 1 ELSE 0 END) AS ready, SUM(CASE WHEN "status" = 'error' THEN 1 ELSE 0 END) AS errors FROM "SubscriptionYamlCache"`).first<{ total: number; ready: number | null; errors: number | null }>(),
    db.prepare(`SELECT s."name", c."lastError", c."nextRetryAt" FROM "SubscriptionYamlCache" c JOIN "Subscription" s ON s."id" = c."subscriptionId" WHERE c."status" = 'error' LIMIT 20`).all<{ name: string; lastError: string | null; nextRetryAt: string | null }>(),
    db.prepare(`SELECT COUNT(*) AS pending FROM "SourceImportJob" WHERE "status" = 'pending'`).first<{ pending: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM "RuleCatalogCache"`).first<{ count: number }>(),
  ]);
  return new Response(JSON.stringify({ subscriptions: subscriptions?.count ?? 0, subscriptionLimit: 20, yamlReady: yaml?.ready ?? 0, yamlErrors: yaml?.errors ?? 0, yamlFailures: failures.results ?? [], pendingImports: imports?.pending ?? 0, ruleCacheEntries: rules?.count ?? 0 }), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
