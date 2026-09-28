import { withCurrentAdmin } from "@local/lib/api-auth";
import { getStringField, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { beginTotpEnrollment, confirmTotpEnrollment, disableTotp, getTotpStatus } from "@local/lib/totp-management";

export async function GET() {
  return withCurrentAdmin((admin) => getTotpStatus(admin.id));
}

export async function POST(request: Request) {
  const parsed = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
  if (!parsed.ok) return jsonBodyError(parsed);
  return withCurrentAdmin((admin) => beginTotpEnrollment(admin.id, getStringField(parsed.value, "password")));
}

export async function PUT(request: Request) {
  const parsed = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
  if (!parsed.ok) return jsonBodyError(parsed);
  return withCurrentAdmin((admin) => confirmTotpEnrollment(admin.id, getStringField(parsed.value, "code")));
}

export async function DELETE(request: Request) {
  const parsed = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
  if (!parsed.ok) return jsonBodyError(parsed);
  return withCurrentAdmin((admin) => disableTotp(admin.id, getStringField(parsed.value, "password"), getStringField(parsed.value, "code")));
}
