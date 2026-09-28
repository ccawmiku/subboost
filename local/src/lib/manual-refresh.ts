import { apiError, json } from "./http";
import { refreshSubscription } from "./subscription-service";

export async function startManualRefresh(ownerId: string, subscriptionId: string) {
  const result = await refreshSubscription(ownerId, subscriptionId);
  if (!result) return apiError("Subscription not found.", "NOT_FOUND", 404);
  if (!result.ok) return json(result.response.body, result.response.status);
  return json(result.body);
}

export async function getManualRefreshJob(_ownerId: string, _subscriptionId: string, _jobId: string) {
  return apiError("Refresh job not found.", "NOT_FOUND", 404);
}
