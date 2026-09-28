import { env } from "cloudflare:workers";
import { apiError, json } from "../src/lib/http";

type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<unknown> };
type D1Database = { prepare(sql: string): Statement };
type Queue = { send(body: unknown): Promise<void> };
const bindings = env as unknown as { DB: D1Database; YAML_QUEUE: Queue };

type JobRow = { status: string; resultJson: string | null; errorText: string | null };

export async function startManualRefresh(ownerId: string, subscriptionId: string) {
  const subscription = await bindings.DB.prepare(`SELECT "id" FROM "Subscription" WHERE "id" = ? AND "ownerId" = ?`)
    .bind(subscriptionId, ownerId).first<{ id: string }>();
  if (!subscription) return apiError("Subscription not found.", "NOT_FOUND", 404);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await bindings.DB.prepare(`
    INSERT INTO "ManualRefreshJob" ("id", "subscriptionId", "ownerId", "status", "createdAt", "updatedAt")
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).bind(id, subscriptionId, ownerId, now, now).run();
  try {
    await bindings.YAML_QUEUE.send({ kind: "manual-refresh", jobId: id });
  } catch (error) {
    await bindings.DB.prepare(`UPDATE "ManualRefreshJob" SET "status" = 'error', "errorText" = ?, "updatedAt" = ? WHERE "id" = ?`)
      .bind("Unable to queue refresh", new Date().toISOString(), id).run();
    throw error;
  }
  return json({ jobId: id, status: "pending" }, 202);
}

export async function getManualRefreshJob(ownerId: string, subscriptionId: string, jobId: string) {
  const job = await bindings.DB.prepare(`
    SELECT "status", "resultJson", "errorText" FROM "ManualRefreshJob"
    WHERE "id" = ? AND "ownerId" = ? AND "subscriptionId" = ?
  `).bind(jobId, ownerId, subscriptionId).first<JobRow>();
  if (!job) return apiError("Refresh job not found.", "NOT_FOUND", 404);
  if (job.status === "done") return json({ status: "done", result: JSON.parse(job.resultJson || "{}") });
  if (job.status === "error") return json({ status: "error", error: job.errorText || "Refresh failed" });
  return json({ status: "pending" });
}

export async function processManualRefreshMessage(message: unknown): Promise<void> {
  if (!message || typeof message !== "object") return;
  const jobId = (message as { jobId?: unknown }).jobId;
  if (typeof jobId !== "string") return;
  const job = await bindings.DB.prepare(`SELECT "subscriptionId", "ownerId", "status" FROM "ManualRefreshJob" WHERE "id" = ?`)
    .bind(jobId).first<{ subscriptionId: string; ownerId: string; status: string }>();
  if (!job || job.status !== "pending") return;
  try {
    const { refreshSubscription } = await import("../src/lib/subscription-service");
    const result = await refreshSubscription(job.ownerId, job.subscriptionId);
    if (!result) throw new Error("Subscription not found");
    if (!result.ok) throw new Error(String(result.response.body.error || "Refresh failed"));
    await bindings.DB.prepare(`UPDATE "ManualRefreshJob" SET "status" = 'done', "resultJson" = ?, "updatedAt" = ? WHERE "id" = ?`)
      .bind(JSON.stringify(result.body), new Date().toISOString(), jobId).run();
  } catch (error) {
    await bindings.DB.prepare(`UPDATE "ManualRefreshJob" SET "status" = 'error', "errorText" = ?, "updatedAt" = ? WHERE "id" = ?`)
      .bind(error instanceof Error ? error.message : "Refresh failed", new Date().toISOString(), jobId).run();
  }
}
