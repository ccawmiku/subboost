import { isIP } from "node:net";
import { env } from "cloudflare:workers";
import { createSubscriptionImportErrorInfo, inferSubscriptionImportErrorCategory, sanitizePublicErrorText } from "@subboost/core/subscription/import-error";
import {
  importSubscriptionFromUrl,
  SUBSCRIPTION_IMPORT_USER_AGENTS,
  type SourceImportRequest,
  type SourceImportResult,
  type SourceImportTransportRequest,
  type SourceImportTransportResult,
} from "@subboost/server-core/subscription";
import { resolveHostnameByDoh } from "@subboost/server-core/subscription/doh-resolver";
import { isPrivateOrReservedIp } from "@subboost/server-core/subscription/ssrf-ip";

const MAX_REDIRECTS = 3;

async function allowUnsafeSources(): Promise<boolean> {
  const db = (env as unknown as { DB: { prepare(sql: string): { first<T>(): Promise<T | null> } } }).DB;
  const admin = await db.prepare(`SELECT "allowUnsafeSubscriptionSources" FROM "LocalAdmin" LIMIT 1`)
    .first<{ allowUnsafeSubscriptionSources: number }>();
  return Boolean(admin?.allowUnsafeSubscriptionSources);
}

function failure(message: string, status?: number, security = false): SourceImportTransportResult {
  const safe = sanitizePublicErrorText(message) || "获取 url 失败";
  return {
    ok: false,
    error: safe,
    responseStatus: status,
    publicReason: status ? `HTTP ${status}` : safe,
    errorInfo: createSubscriptionImportErrorInfo({
      category: security ? "security" : inferSubscriptionImportErrorCategory(safe),
      message: safe,
      detail: safe,
      httpStatus: status,
    }),
  };
}

async function validateTarget(url: string, allowUnsafe: boolean): Promise<SourceImportTransportResult | null> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return failure("无效的订阅 URL", undefined, true); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return failure("只支持 HTTP 或 HTTPS 订阅 URL", undefined, true);
  if (parsed.username || parsed.password) return failure("订阅 URL 不允许包含用户名或密码", undefined, true);
  if (allowUnsafe) return null;
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateOrReservedIp(hostname)) {
    return failure("禁止访问本机或内网地址", undefined, true);
  }
  if (isIP(hostname)) return null;
  // Cloudflare fetch cannot pin arbitrary public origin IPs. Check public DNS
  // before every request, including redirects, and let the platform resolve it.
  const addresses = await resolveHostnameByDoh(hostname, { timeoutMs: 4000 }).catch(() => []);
  if (addresses.length === 0 || addresses.some(isPrivateOrReservedIp)) return failure("订阅域名无法解析到公网地址", undefined, true);
  return null;
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel("response too large");
      throw new Error("订阅响应过大");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function fetchText(request: SourceImportTransportRequest, allowUnsafe: boolean): Promise<SourceImportTransportResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    let url = request.url;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const invalid = await validateTarget(url, allowUnsafe);
      if (invalid) return invalid;
      const response = await fetch(url, {
        method: request.purpose === "userinfo" ? "HEAD" : "GET",
        headers: { "User-Agent": request.userAgent, Accept: "text/plain, application/yaml, application/x-yaml, */*;q=0.8", "Cache-Control": "no-cache" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
        await response.body?.cancel();
        url = new URL(response.headers.get("location")!, url).toString();
        continue;
      }
      if (!response.ok) return failure(`HTTP ${response.status}`, response.status);
      const length = Number(response.headers.get("content-length") || "0");
      if (length > request.maxBytes) { await response.body?.cancel(); return failure("订阅响应过大", 413); }
      const headers = Object.fromEntries(response.headers.entries());
      const content = request.purpose === "userinfo" ? "" : await readLimited(response, request.maxBytes);
      return { ok: true, content, headers, responseStatus: response.status };
    }
    return failure("订阅重定向次数过多", 310);
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

export async function importSourceUrlDirect(request: SourceImportRequest): Promise<SourceImportResult> {
  const allowUnsafe = await allowUnsafeSources();
  return importSubscriptionFromUrl(request, {
    timeoutMs: 15000, maxBytes: 512 * 1024,
    fetchText: (transportRequest) => fetchText(transportRequest, allowUnsafe),
  });
}

export async function fetchSourceUserInfoHeadersDirect(source: { userinfoUrl?: string; userinfoUserAgent?: string }): Promise<Record<string, string> | undefined> {
  if (!source.userinfoUrl) return undefined;
  const allowUnsafe = await allowUnsafeSources();
  const result = await fetchText({
    url: source.userinfoUrl,
    userAgent: source.userinfoUserAgent?.trim() || SUBSCRIPTION_IMPORT_USER_AGENTS[0],
    purpose: "userinfo",
    timeoutMs: 8000,
    maxBytes: 256 * 1024,
  }, allowUnsafe);
  return result.ok ? result.headers : undefined;
}
