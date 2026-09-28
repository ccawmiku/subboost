import { buildSourceImportParseResult } from "@subboost/server-core/subscription";
import { importSourceUrlDirect } from "./source-import";
import { json } from "./http";

type SourceRequest = { url: string; userinfoUrl?: string; userinfoUserAgent?: string };

export async function startSourceImport(_ownerId: string, request: SourceRequest): Promise<Response> {
  const result = await importSourceUrlDirect(request);
  if (!result.ok) {
    return json({
      error: result.error,
      code: result.errorInfo.category === "format" ? "BAD_REQUEST" : "INTERNAL_ERROR",
      errorInfo: result.errorInfo,
    }, result.responseStatus && result.responseStatus >= 400 ? result.responseStatus : 400);
  }
  return json({ content: result.content, headers: result.headers, parseResult: buildSourceImportParseResult(result) });
}

export async function getSourceImportJob(_ownerId: string, _jobId: string): Promise<Response> {
  return json({ error: "Source import job not found.", code: "NOT_FOUND" }, 404);
}
