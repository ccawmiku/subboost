import { buildSubscriptionResponseHeaders } from "@subboost/server-core/subscription";
import { getSubscriptionYamlForDelivery, getYamlGenerationFailure } from "./yaml-delivery";
import { consumeLocalRateLimit, getTrustedClientRateLimitKey, hashLocalRateLimitKey, localRateLimitResponse } from "./rate-limit";

function failure(message: string, code: string, status: number): Response {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function fastYaml(request: Request, token: string): Promise<Response> {
  const clientKey = getTrustedClientRateLimitKey(request);
  if (clientKey) {
    const limit = await consumeLocalRateLimit("subscription-yaml-client", clientKey, { limit: 600, windowMs: 60_000 });
    if (!limit.allowed) return localRateLimitResponse("Too many subscription requests. Try again later.", limit.retryAfterSeconds);
  }
  const tokenLimit = await consumeLocalRateLimit("subscription-yaml-token", hashLocalRateLimitKey(token), { limit: 120, windowMs: 60_000 });
  if (!tokenLimit.allowed) return localRateLimitResponse("Too many subscription requests. Try again later.", tokenLimit.retryAfterSeconds);
  const result = await getSubscriptionYamlForDelivery(token);
  if (result === "pending") {
    const failed = await getYamlGenerationFailure(token);
    const response = failed
      ? failure("Subscription YAML generation failed and will retry automatically.", "GENERATION_FAILED", 503)
      : failure("Subscription YAML is being prepared. Retry shortly.", "PREPARING", 503);
    response.headers.set("Retry-After", String(failed?.retryAfterSeconds ?? 3));
    return response;
  }
  if (!result) return failure("Subscription YAML not found.", "NOT_FOUND", 404);
  const headers = new Headers(buildSubscriptionResponseHeaders(result.name, result.subscriptionInfo, {
    cacheControl: "no-store",
    cacheExpirySeconds: result.cacheExpirySeconds,
    autoUpdateIntervalSeconds: result.autoUpdateIntervalSeconds,
    isAdmin: result.isAdmin,
  }));
  if (result.stale) headers.set("X-SubBoost-Stale", "1");
  return new Response(result.yaml, { headers });
}
