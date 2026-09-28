import { env } from "cloudflare:workers";
import type { GeneratedSubscriptionYaml } from "../src/lib/subscription-service";

type Row = Record<string, unknown>;
type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Row>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
};
type D1Database = { prepare(sql: string): Statement };
type Queue = { send(body: unknown): Promise<void> };
const bindings = env as unknown as { DB: D1Database; YAML_QUEUE: Queue };

type SubscriptionVersion = { id: string; updatedAt: string };
type CachedYaml = {
  sourceUpdatedAt: string;
  status: string;
  yaml: string | null;
  name: string | null;
  subscriptionInfo: string | null;
  cacheExpirySeconds: number | null;
  autoUpdateIntervalSeconds: number | null;
  isAdmin: number | null;
  failureCount: number;
  nextRetryAt: string | null;
};

async function subscriptionByToken(token: string): Promise<SubscriptionVersion | null> {
  return bindings.DB.prepare(`SELECT "id", "updatedAt" FROM "Subscription" WHERE "token" = ?`).bind(token).first<SubscriptionVersion>();
}

async function claimGeneration(subscription: SubscriptionVersion): Promise<boolean> {
  const now = new Date();
  const retryBefore = new Date(now.getTime() - 60_000).toISOString();
  const result = await bindings.DB.prepare(`
    INSERT INTO "SubscriptionYamlCache" ("subscriptionId", "sourceUpdatedAt", "status", "enqueuedAt", "failureCount")
    VALUES (?, ?, 'pending', ?, 0)
    ON CONFLICT("subscriptionId") DO UPDATE SET
      "sourceUpdatedAt" = excluded."sourceUpdatedAt",
      "status" = 'pending',
      "enqueuedAt" = excluded."enqueuedAt",
      "failureCount" = CASE WHEN "SubscriptionYamlCache"."sourceUpdatedAt" <> excluded."sourceUpdatedAt" THEN 0 ELSE "SubscriptionYamlCache"."failureCount" END,
      "nextRetryAt" = NULL,
      "lastError" = NULL
    WHERE "SubscriptionYamlCache"."sourceUpdatedAt" <> excluded."sourceUpdatedAt"
       OR ("SubscriptionYamlCache"."status" = 'pending' AND "SubscriptionYamlCache"."enqueuedAt" < ?)
       OR ("SubscriptionYamlCache"."status" = 'error' AND "SubscriptionYamlCache"."nextRetryAt" <= ?)
       OR ("SubscriptionYamlCache"."status" = 'ready' AND "SubscriptionYamlCache"."yaml" IS NULL)
  `).bind(subscription.id, subscription.updatedAt, now.toISOString(), retryBefore, now.toISOString()).run();
  return result.meta.changes === 1;
}

function readyResult(cached: CachedYaml, stale: boolean): GeneratedSubscriptionYaml | null {
  if (!cached.yaml || !cached.name) return null;
  return {
    yaml: cached.yaml,
    name: cached.name,
    subscriptionInfo: JSON.parse(cached.subscriptionInfo || "{}"),
    cacheExpirySeconds: cached.cacheExpirySeconds ?? 3600,
    autoUpdateIntervalSeconds: cached.autoUpdateIntervalSeconds,
    isAdmin: Boolean(cached.isAdmin),
    stale,
  };
}

async function recordGenerationFailure(subscriptionId: string, sourceUpdatedAt: string, error: unknown): Promise<void> {
  const row = await bindings.DB.prepare(`SELECT "failureCount" FROM "SubscriptionYamlCache" WHERE "subscriptionId" = ? AND "sourceUpdatedAt" = ?`)
    .bind(subscriptionId, sourceUpdatedAt).first<{ failureCount: number }>();
  if (!row) return;
  const nextCount = Math.min(20, row.failureCount + 1);
  const retrySeconds = Math.min(3600, 60 * 2 ** Math.min(6, nextCount - 1));
  const safeMessage = error instanceof Error ? error.name.slice(0, 80) : "YAML generation failed";
  await bindings.DB.prepare(`
    UPDATE "SubscriptionYamlCache" SET "status" = 'error', "failureCount" = ?, "nextRetryAt" = ?, "lastError" = ?
    WHERE "subscriptionId" = ? AND "sourceUpdatedAt" = ?
  `).bind(nextCount, new Date(Date.now() + retrySeconds * 1000).toISOString(), safeMessage, subscriptionId, sourceUpdatedAt).run();
}

export async function getSubscriptionYamlForDelivery(token: string): Promise<GeneratedSubscriptionYaml | "pending" | null> {
  const subscription = await subscriptionByToken(token);
  if (!subscription) return null;
  const cached = await bindings.DB.prepare(`
    SELECT "sourceUpdatedAt", "status", "yaml", "name", "subscriptionInfo", "cacheExpirySeconds", "autoUpdateIntervalSeconds", "isAdmin", "failureCount", "nextRetryAt"
    FROM "SubscriptionYamlCache" WHERE "subscriptionId" = ?
  `).bind(subscription.id).first<CachedYaml>();
  if (cached?.sourceUpdatedAt === subscription.updatedAt && cached.status === "ready") return readyResult(cached, false);
  if (cached?.sourceUpdatedAt === subscription.updatedAt && cached.status === "empty") return null;
  try { await enqueueVersion(subscription, token); } catch { /* failure and retry time were saved by enqueueVersion */ }
  if (cached) return readyResult(cached, true) ?? "pending";
  return "pending";
}

export async function getYamlGenerationFailure(token: string): Promise<{ retryAfterSeconds: number } | null> {
  const row = await bindings.DB.prepare(`
    SELECT c."nextRetryAt" FROM "SubscriptionYamlCache" c
    JOIN "Subscription" s ON s."id" = c."subscriptionId"
    WHERE s."token" = ? AND c."status" = 'error' AND c."sourceUpdatedAt" = s."updatedAt"
  `).bind(token).first<{ nextRetryAt: string | null }>();
  if (!row) return null;
  return { retryAfterSeconds: Math.max(1, Math.min(3600, Math.ceil((Date.parse(row.nextRetryAt || "") - Date.now()) / 1000) || 60)) };
}

async function enqueueVersion(subscription: SubscriptionVersion, token: string): Promise<void> {
  if (await claimGeneration(subscription)) {
    try {
      await bindings.YAML_QUEUE.send({ subscriptionId: subscription.id, token, sourceUpdatedAt: subscription.updatedAt });
    } catch (error) {
      await recordGenerationFailure(subscription.id, subscription.updatedAt, error);
      throw error;
    }
  }
}

export async function enqueueSubscriptionYaml(token: string): Promise<void> {
  const subscription = await subscriptionByToken(token);
  if (subscription) await enqueueVersion(subscription, token);
}

export async function processYamlGenerationMessage(message: unknown): Promise<void> {
  if (!message || typeof message !== "object") return;
  const job = message as Row;
  if (typeof job.subscriptionId !== "string" || typeof job.token !== "string" || typeof job.sourceUpdatedAt !== "string") return;
  const before = await subscriptionByToken(job.token);
  if (!before || before.id !== job.subscriptionId || before.updatedAt !== job.sourceUpdatedAt) return;
  try {
    const { generateSubscriptionYaml } = await import("../src/lib/subscription-service");
    const generated = await generateSubscriptionYaml(job.token, false);
    const after = await subscriptionByToken(job.token);
    if (!after || after.updatedAt !== before.updatedAt) return;
    if (!generated) {
      await bindings.DB.prepare(`UPDATE "SubscriptionYamlCache" SET "status" = 'empty', "yaml" = NULL, "lastError" = NULL WHERE "subscriptionId" = ? AND "sourceUpdatedAt" = ?`)
        .bind(before.id, before.updatedAt).run();
      return;
    }
    if (new TextEncoder().encode(generated.yaml).byteLength > 1_000_000) {
      throw new Error("Generated YAML exceeds personal D1 cache limit");
    }
    await bindings.DB.prepare(`
      UPDATE "SubscriptionYamlCache" SET
        "status" = 'ready', "yaml" = ?, "name" = ?, "subscriptionInfo" = ?,
        "cacheExpirySeconds" = ?, "autoUpdateIntervalSeconds" = ?, "isAdmin" = ?, "lastError" = NULL, "nextRetryAt" = NULL
      WHERE "subscriptionId" = ? AND "sourceUpdatedAt" = ?
    `).bind(
      generated.yaml, generated.name, JSON.stringify(generated.subscriptionInfo),
      generated.cacheExpirySeconds, generated.autoUpdateIntervalSeconds, Number(generated.isAdmin),
      before.id, before.updatedAt,
    ).run();
  } catch (error) {
    await recordGenerationFailure(before.id, before.updatedAt, error);
    throw error;
  }
}
