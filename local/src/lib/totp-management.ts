import { apiError } from "./http";

export async function getTotpStatus(_ownerId: string): Promise<Response> {
  return apiError("TOTP is available only in the Cloudflare edition.", "NOT_FOUND", 404);
}
export async function beginTotpEnrollment(_ownerId: string, _password: string): Promise<Response> {
  return apiError("TOTP is available only in the Cloudflare edition.", "NOT_FOUND", 404);
}
export async function confirmTotpEnrollment(_ownerId: string, _code: string): Promise<Response> {
  return apiError("TOTP is available only in the Cloudflare edition.", "NOT_FOUND", 404);
}
export async function disableTotp(_ownerId: string, _password: string, _code: string): Promise<Response> {
  return apiError("TOTP is available only in the Cloudflare edition.", "NOT_FOUND", 404);
}
