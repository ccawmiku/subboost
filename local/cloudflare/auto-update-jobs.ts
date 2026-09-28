import { env } from "cloudflare:workers";

type Statement = {
  bind(...values: unknown[]): Statement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
type D1Database = { prepare(sql: string): Statement };
type Queue = { send(body: unknown): Promise<void> };
const bindings = env as unknown as { DB: D1Database; YAML_QUEUE: Queue };

export async function enqueueDueAutoUpdates(now = new Date()): Promise<number> {
  if (now.getUTCMinutes() === 0) {
    await bindings.DB.prepare(`DELETE FROM "ManualRefreshJob" WHERE "createdAt" < ?`)
      .bind(new Date(now.getTime() - 24 * 60 * 60_000).toISOString()).run();
    await bindings.DB.prepare(`DELETE FROM "SourceImportJob" WHERE "createdAt" < ?`)
      .bind(new Date(now.getTime() - 24 * 60 * 60_000).toISOString()).run();
    await bindings.DB.prepare(`DELETE FROM "RateLimitBucket" WHERE "resetAt" < ?`)
      .bind(now.getTime()).run();
    await bindings.DB.prepare(`DELETE FROM "RevokedSession" WHERE "expiresAt" < ?`)
      .bind(now.toISOString()).run();
  }
  const nowIso = now.toISOString();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const nextQueuedAt = new Date(now.getTime() + 5 * 60_000).toISOString();
  const rows = await bindings.DB.prepare(`
    SELECT s."id" FROM "Subscription" s
    LEFT JOIN "SubscriptionAutoUpdateState" a ON a."subscriptionId" = s."id"
    LEFT JOIN "AutoUpdateQueueClaim" q ON q."subscriptionId" = s."id"
    WHERE s."autoUpdateInterval" IS NOT NULL
      AND a."disabledAt" IS NULL
      AND (q."nextQueuedAt" IS NULL OR q."nextQueuedAt" <= ?)
      AND CAST((? - strftime('%s', s."createdAt")) / s."autoUpdateInterval" AS INTEGER) >
          CAST((MAX(
            strftime('%s', s."createdAt"),
            COALESCE(strftime('%s', s."lastUpdatedAt"), 0),
            COALESCE(strftime('%s', a."lastAttemptedAt"), 0)
          ) - strftime('%s', s."createdAt")) / s."autoUpdateInterval" AS INTEGER)
    ORDER BY COALESCE(q."nextQueuedAt", '') ASC
    LIMIT 10
  `).bind(nowIso, nowSeconds).all<{ id: string }>();
  for (const row of rows.results) {
    await bindings.YAML_QUEUE.send({ kind: "auto-update", subscriptionId: row.id });
    await bindings.DB.prepare(`
      INSERT INTO "AutoUpdateQueueClaim" ("subscriptionId", "nextQueuedAt") VALUES (?, ?)
      ON CONFLICT("subscriptionId") DO UPDATE SET "nextQueuedAt" = excluded."nextQueuedAt"
    `).bind(row.id, nextQueuedAt).run();
  }
  return rows.results.length;
}

export async function processAutoUpdateMessage(message: unknown): Promise<void> {
  if (!message || typeof message !== "object") return;
  const job = message as { subscriptionId?: unknown };
  if (typeof job.subscriptionId !== "string") return;
  const { runLocalSubscriptionAutoUpdateOne } = await import("../src/lib/auto-update-service");
  await runLocalSubscriptionAutoUpdateOne(job.subscriptionId);
}
