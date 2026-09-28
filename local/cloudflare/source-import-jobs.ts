import { env } from "cloudflare:workers";
import { buildSourceImportParseResult } from "@subboost/server-core/subscription";
import { decryptJsonObject, encryptJson } from "../src/lib/crypto";
import { apiError, json } from "../src/lib/http";

type SourceRequest = { url: string; userinfoUrl?: string; userinfoUserAgent?: string };
type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<unknown> };
type Database = { prepare(sql: string): Statement };
type Queue = { send(body: unknown): Promise<void> };
const bindings = env as unknown as { DB: Database; YAML_QUEUE: Queue };

type JobRow = {
  status: string;
  encryptedRequest: string;
  encryptedResult: string | null;
  httpStatus: number | null;
};

export async function startSourceImport(ownerId: string, request: SourceRequest): Promise<Response> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await bindings.DB.prepare(`
    INSERT INTO "SourceImportJob" ("id", "ownerId", "status", "encryptedRequest", "createdAt", "updatedAt")
    VALUES (?, ?, 'pending', ?, ?, ?)
  `).bind(id, ownerId, encryptJson(request), now, now).run();
  try {
    await bindings.YAML_QUEUE.send({ kind: "source-import", jobId: id });
  } catch (error) {
    await bindings.DB.prepare(`DELETE FROM "SourceImportJob" WHERE "id" = ?`).bind(id).run();
    throw error;
  }
  return json({ jobId: id, status: "pending" }, 202);
}

export async function getSourceImportJob(ownerId: string, jobId: string): Promise<Response> {
  if (!jobId) return apiError("Source import job ID required.", "BAD_REQUEST", 400);
  const job = await bindings.DB.prepare(`
    SELECT "status", "encryptedRequest", "encryptedResult", "httpStatus"
    FROM "SourceImportJob" WHERE "id" = ? AND "ownerId" = ?
  `).bind(jobId, ownerId).first<JobRow>();
  if (!job) return apiError("Source import job not found.", "NOT_FOUND", 404);
  if (job.status === "pending") return json({ jobId, status: "pending" }, 202);
  const body = decryptJsonObject(job.encryptedResult || "");
  return json(body, job.httpStatus || 500);
}

export async function processSourceImportMessage(message: unknown): Promise<void> {
  if (!message || typeof message !== "object") return;
  const jobId = (message as { jobId?: unknown }).jobId;
  if (typeof jobId !== "string") return;
  const job = await bindings.DB.prepare(`
    SELECT "status", "encryptedRequest" FROM "SourceImportJob" WHERE "id" = ?
  `).bind(jobId).first<JobRow>();
  if (!job || job.status !== "pending") return;
  try {
    const request = decryptJsonObject(job.encryptedRequest) as SourceRequest;
    const { importSourceUrlDirect } = await import("./source-import");
    const result = await importSourceUrlDirect(request);
    const body = result.ok
      ? { content: result.content, headers: result.headers, parseResult: buildSourceImportParseResult(result) }
      : {
          error: result.error,
          code: result.errorInfo.category === "format" ? "BAD_REQUEST" : "INTERNAL_ERROR",
          errorInfo: result.errorInfo,
        };
    const oversized = new TextEncoder().encode(JSON.stringify(body)).byteLength > 1_000_000;
    const storedBody = oversized ? { error: "Imported source exceeds the personal D1 cache limit.", code: "PAYLOAD_TOO_LARGE" } : body;
    const status = oversized ? 413 : result.ok ? 200 : result.responseStatus && result.responseStatus >= 400 ? result.responseStatus : 400;
    await bindings.DB.prepare(`
      UPDATE "SourceImportJob" SET "status" = 'done', "encryptedResult" = ?, "httpStatus" = ?, "updatedAt" = ?
      WHERE "id" = ? AND "status" = 'pending'
    `).bind(encryptJson(storedBody), status, new Date().toISOString(), jobId).run();
  } catch (error) {
    const body = { error: error instanceof Error ? error.message : "Source import failed", code: "INTERNAL_ERROR" };
    await bindings.DB.prepare(`
      UPDATE "SourceImportJob" SET "status" = 'done', "encryptedResult" = ?, "httpStatus" = 500, "updatedAt" = ?
      WHERE "id" = ? AND "status" = 'pending'
    `).bind(encryptJson(body), new Date().toISOString(), jobId).run();
  }
}
