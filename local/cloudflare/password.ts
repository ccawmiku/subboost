import { env } from "cloudflare:workers";

const encoder = new TextEncoder();

async function digest(password: string, salt: string): Promise<string> {
  const pepper = (env as unknown as { AUTH_PEPPER?: string }).AUTH_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("AUTH_PEPPER must contain at least 32 characters");
  const key = await crypto.subtle.importKey("raw", encoder.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${salt}:${password}`)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID();
  return `cf-hmac-sha256:${salt}:${await digest(password, salt)}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parts = hash.split(":");
  if (parts.length !== 3 || parts[0] !== "cf-hmac-sha256") return false;
  const expected = await digest(password, parts[1]);
  let difference = expected.length ^ parts[2].length;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ (parts[2].charCodeAt(index) || 0);
  return difference === 0;
}
