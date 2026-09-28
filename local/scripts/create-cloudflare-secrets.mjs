import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [target, rawUrl] = process.argv.slice(2);
if (!["production", "staging"].includes(target) || !rawUrl) {
  throw new Error("Usage: node scripts/create-cloudflare-secrets.mjs production|staging https://your-worker.example");
}
const url = new URL(rawUrl);
if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
  throw new Error("Use only the HTTPS site origin, with no path, query, credentials, or fragment.");
}
const origin = url.origin;
const secret = () => randomBytes(48).toString("base64url");
const values = {
  JWT_SECRET: secret(),
  AUTH_PEPPER: secret(),
  ENCRYPTION_KEY: secret(),
  LOCAL_SETUP_TOKEN: secret(),
  APP_URL: origin,
};
const destination = path.join(localDir, `.${target}-secrets`);
writeFileSync(destination, JSON.stringify(values, null, 2), { flag: "wx", mode: 0o600 });
try { chmodSync(destination, 0o600); } catch { /* Windows permissions are controlled by ACLs. */ }
console.log(`Created ${destination}. Back it up privately; never commit or share it.`);
console.log(`One-time admin setup URL: ${origin}/login#setup-token=${values.LOCAL_SETUP_TOKEN}`);
