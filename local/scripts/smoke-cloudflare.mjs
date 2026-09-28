import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const target = process.argv[2];
const roundtrip = process.argv.includes("--account-roundtrip");
if (!(["staging", "production"].includes(target))) throw new Error("Usage: node scripts/smoke-cloudflare.mjs staging|production [site-url] [--account-roundtrip]");
if (roundtrip && target !== "staging") throw new Error("Account roundtrip is staging-only.");
const secretsPath = new URL(`../.${target}-secrets`, import.meta.url);
const configuredUrl = existsSync(secretsPath) ? JSON.parse(readFileSync(secretsPath, "utf8")).APP_URL : "";
const base = (process.argv[3]?.startsWith("https://") ? process.argv[3] : process.env.SUBBOOST_PUBLIC_URL || configuredUrl).replace(/\/+$/, "");
if (!base) throw new Error("Provide the site URL or set SUBBOOST_PUBLIC_URL.");
const adminPath = new URL(`../.${target}-admin`, import.meta.url);
const password = process.env.SUBBOOST_ADMIN_PASSWORD || (existsSync(adminPath) ? readFileSync(adminPath, "utf8").trim() : "");

async function call(path, options = {}) {
  return fetch(`${base}${path}`, options);
}

async function login(pass, code = "") {
  const response = await call("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: pass, totpCode: code }),
  });
  return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0] || "" };
}

async function post(path, cookie, body) {
  const response = await call(path, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

function assert(condition, message) { if (!condition) throw new Error(message); }
for (const path of ["/api/health/live", "/api/health/ready"]) assert((await call(path)).status === 200, `${path} failed`);
if (!password) {
  console.log(`${target}: public health checks passed. Set SUBBOOST_ADMIN_PASSWORD to test authenticated paths.`);
  process.exit(0);
}
let session = await login(password);
assert(session.status === 200, "Login failed");
const cookie = session.cookie;
assert((await call("/api/usage", { headers: { Cookie: cookie } })).status === 200, "Usage failed");
const list = await call("/api/subscriptions", { headers: { Cookie: cookie } });
assert(list.status === 200, "Subscription list failed");
const subscriptions = (await list.json()).subscriptions;
for (const subscription of subscriptions) {
  const response = await call(`/api/subscriptions/${encodeURIComponent(subscription.token)}/config.yaml`);
  assert(response.status === 200 || response.status === 503, "Unexpected YAML response");
}
assert((await call("/api/rules/search?keyword=google&size=5")).status === 200, "Rule search failed");
assert((await call("/api/rules/cn-candidates")).status === 200, "CN candidates failed");
assert((await call("/api/rules/cn-candidates?modules=google")).status === 200, "Filtered CN candidates failed");
console.log(`${target}: health, login, usage, ${subscriptions.length} subscriptions, YAML and rules passed.`);

if (roundtrip) {
  const temporary = randomBytes(32).toString("base64url");
  const changed = await post("/api/auth/password", cookie, { currentPassword: password, newPassword: temporary });
  assert(changed.status === 200, "Password change failed");
  assert((await call("/api/usage", { headers: { Cookie: cookie } })).status === 401, "Old session remained valid");
  assert((await login(password)).status === 401, "Old password remained valid");
  session = await login(temporary);
  assert(session.status === 200, "New password failed");
  const restored = await post("/api/auth/password", session.cookie, { currentPassword: temporary, newPassword: password });
  assert(restored.status === 200, "Password restore failed");
  session = await login(password);
  assert(session.status === 200, "Restored password failed");
  console.log("staging: password change and global session invalidation passed.");

  const enrollment = await post("/api/auth/totp", session.cookie, { password });
  assert(enrollment.status === 200 && typeof enrollment.body.secret === "string", "TOTP enrollment failed");
  const secret = enrollment.body.secret;
  try {
    const confirmedResponse = await call("/api/auth/totp", {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: session.cookie },
      body: JSON.stringify({ code: totp(secret) }),
    });
    const confirmed = await confirmedResponse.json();
    assert(confirmedResponse.status === 200 && confirmed.recoveryCodes?.length === 10, "Recovery codes not issued");
    const first = confirmed.recoveryCodes[0];
    assert((await login(password, first)).status === 200, "Recovery code login failed");
    assert((await login(password, first)).status === 401, "Recovery code was reused");
    assert((await login(password, totp(secret))).status === 200, "TOTP login failed");
    console.log("staging: TOTP and single-use recovery code passed.");
  } finally {
    const disabled = await call("/api/auth/totp", {
      method: "DELETE", headers: { "Content-Type": "application/json", Cookie: session.cookie },
      body: JSON.stringify({ password, code: totp(secret) }),
    });
    assert(disabled.status === 200, "TOTP cleanup failed");
  }
}
