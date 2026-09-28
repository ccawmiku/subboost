import { env } from "cloudflare:workers";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_SOURCES = 10;
const MAX_SUBSCRIPTIONS = 20;

type Statement = { first<T>(): Promise<T | null> };
const db = (env as unknown as { DB: { prepare(sql: string): Statement } }).DB;

function rejected(message: string, status = 413): Response {
  return new Response(JSON.stringify({ error: message, code: status === 413 ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR" }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function guardSubscriptionMutation(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!/^\/api\/(subscriptions(?:\/[^/]+)?|templates(?:\/[^/]+)?)$/.test(path)) return null;
  if (request.method !== "POST" && request.method !== "PATCH" && request.method !== "PUT") return null;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return rejected("Configuration exceeds the 1 MiB personal plan limit.");
  const reader = request.clone().body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return rejected("Configuration exceeds the 1 MiB personal plan limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!path.startsWith("/api/subscriptions")) return null;
  let body: Record<string, unknown>;
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch { return null; }
  if (Array.isArray(body.urls) && body.urls.length > MAX_SOURCES) return rejected(`A subscription can have at most ${MAX_SOURCES} source URLs.`, 400);
  if (request.method === "POST" && path === "/api/subscriptions") {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM "Subscription"`).first<{ count: number }>();
    if ((row?.count ?? 0) >= MAX_SUBSCRIPTIONS) return rejected(`This personal instance can have at most ${MAX_SUBSCRIPTIONS} subscriptions.`, 400);
  }
  return null;
}
