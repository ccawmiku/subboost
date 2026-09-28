import { apiError } from "@local/lib/http";
import { getSubscriptionYamlForDelivery } from "@local/lib/yaml-delivery";
import { buildSubscriptionResponseHeaders } from "@subboost/server-core/subscription";
import {
  consumeLocalRateLimit,
  getTrustedClientRateLimitKey,
  hashLocalRateLimitKey,
  localRateLimitResponse,
} from "@local/lib/rate-limit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { id: token } = await params;
  const clientKey = getTrustedClientRateLimitKey(request);
  if (clientKey) {
    const clientLimit = await consumeLocalRateLimit("subscription-yaml-client", clientKey, {
      limit: 600,
      windowMs: 60_000,
    });
    if (!clientLimit.allowed) {
      return localRateLimitResponse("Too many subscription requests. Try again later.", clientLimit.retryAfterSeconds);
    }
  }
  const tokenLimit = await consumeLocalRateLimit("subscription-yaml-token", hashLocalRateLimitKey(token), {
    limit: 120,
    windowMs: 60_000,
  });
  if (!tokenLimit.allowed) {
    return localRateLimitResponse("Too many subscription requests. Try again later.", tokenLimit.retryAfterSeconds);
  }
  const result = await getSubscriptionYamlForDelivery(token);
  if (result === "pending") {
    const response = apiError("Subscription YAML is being prepared. Retry shortly.", "PREPARING", 503);
    response.headers.set("Retry-After", "3");
    return response;
  }
  if (!result) return apiError("Subscription YAML not found.", "NOT_FOUND", 404);
  return new Response(result.yaml, {
    headers: buildSubscriptionResponseHeaders(result.name, result.subscriptionInfo, {
      cacheControl: "no-store",
      cacheExpirySeconds: result.cacheExpirySeconds,
      autoUpdateIntervalSeconds: result.autoUpdateIntervalSeconds,
      isAdmin: result.isAdmin,
    }),
  });
}
