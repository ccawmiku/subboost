import { refreshSubscriptionJobResponse, refreshSubscriptionResponse } from "@local/lib/subscription-route-handlers";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  return refreshSubscriptionResponse(id);
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() || "";
  return refreshSubscriptionJobResponse(id, jobId);
}
