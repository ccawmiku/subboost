import { withCurrentAdmin } from "@local/lib/api-auth";
import { apiError, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { getSourceImportJob, startSourceImport } from "@local/lib/source-import-jobs";

function getStringField(body: unknown, key: string): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  return withCurrentAdmin(async (admin) => {
    const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
    if (!parsedBody.ok) return jsonBodyError(parsedBody);
    const body = parsedBody.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Invalid JSON body.", "BAD_REQUEST", 400);
    }

    return startSourceImport(admin.id, {
      url: getStringField(body, "url"),
      userinfoUrl: getStringField(body, "userinfoUrl") || undefined,
      userinfoUserAgent: getStringField(body, "userinfoUserAgent") || undefined,
    });
  });
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() || "";
  return withCurrentAdmin((admin) => getSourceImportJob(admin.id, jobId));
}
