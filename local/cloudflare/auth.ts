import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { deriveSessionRevocationIdentity, SESSION_CLOCK_TOLERANCE_SECONDS } from "@subboost/server-core/session-revocation";

type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null> };
const bindings = env as unknown as { DB: { prepare(sql: string): Statement }; JWT_SECRET: string };
export type CurrentAdmin = { id: string; username: string };

export async function adminFromSessionToken(token: string): Promise<CurrentAdmin | null> {
  if (!token || !bindings.JWT_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(bindings.JWT_SECRET), {
      algorithms: ["HS256"], clockTolerance: SESSION_CLOCK_TOLERANCE_SECONDS,
    });
    if (payload.iss !== "subboost-local" || typeof payload.sub !== "string" || typeof payload.username !== "string") return null;
    const identity = deriveSessionRevocationIdentity({ namespace: "subboost-local", token, claims: payload });
    const revoked = await bindings.DB.prepare(`SELECT "revocationKey" FROM "RevokedSession" WHERE "revocationKey" = ?`)
      .bind(identity.key).first<{ revocationKey: string }>();
    if (revoked) return null;
    const admin = await bindings.DB.prepare(`SELECT "id", "username", "authVersion" FROM "LocalAdmin" WHERE "id" = ?`)
      .bind(payload.sub).first<CurrentAdmin & { authVersion: number }>();
    if (!admin || admin.username !== payload.username || admin.authVersion !== (payload.authVersion ?? 0)) return null;
    return { id: admin.id, username: admin.username };
  } catch { return null; }
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const token = (await cookies()).get("subboost_local_session")?.value;
  return token ? adminFromSessionToken(token) : null;
}

export async function isSetupRequired(): Promise<boolean> {
  const row = await bindings.DB.prepare(`SELECT COUNT(*) AS count FROM "LocalAdmin"`).first<{ count: number }>();
  return (row?.count ?? 0) === 0;
}
