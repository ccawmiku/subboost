import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(localDir, "..", "node_modules", "wrangler", "bin", "wrangler.js");
const base = process.env.SUBBOOST_PUBLIC_URL?.replace(/\/+$/, "");
if (!base) throw new Error("Set SUBBOOST_PUBLIC_URL to the staging site URL.");
const config = JSON.parse(readFileSync(path.join(localDir, "wrangler.staging.jsonc"), "utf8"));
const queueName = config.queues?.producers?.[0]?.queue;
if (!queueName) throw new Error("Missing staging Queue name.");
const password = readFileSync(path.join(localDir, ".staging-admin"), "utf8").trim();

function queue(action) {
  const result = spawnSync(process.execPath, [wrangler, "queues", action, queueName], { cwd: localDir, stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Queue ${action} failed: ${(result.stderr || result.stdout).slice(-300)}`);
}

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
});
if (!login.ok) throw new Error("Staging login failed");
const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
const list = await fetch(`${base}/api/subscriptions`, { headers: { Cookie: cookie } });
const subscriptions = (await list.json()).subscriptions;
let selected;
for (const subscription of subscriptions) {
  const yaml = await fetch(`${base}/api/subscriptions/${encodeURIComponent(subscription.token)}/config.yaml`);
  if (yaml.status === 200) { selected = subscription; break; }
}
if (!selected) throw new Error("No ready staging subscription");
const patch = async (name) => fetch(`${base}/api/subscriptions/${encodeURIComponent(selected.id)}`, {
  method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ name }),
});
let changed = false;
queue("pause-delivery");
try {
  const updated = await patch(`${selected.name} [cache test]`);
  if (!updated.ok) throw new Error(`Staging update failed: ${updated.status}`);
  changed = true;
  const yaml = await fetch(`${base}/api/subscriptions/${encodeURIComponent(selected.token)}/config.yaml`);
  if (yaml.status !== 200 || yaml.headers.get("x-subboost-stale") !== "1") {
    throw new Error(`Expected stale YAML, got ${yaml.status} with stale=${yaml.headers.get("x-subboost-stale")}`);
  }
  console.log("Staging stale YAML fallback passed while Queue delivery was paused.");
} finally {
  try {
    if (changed) {
      const restored = await patch(selected.name);
      if (!restored.ok) throw new Error(`Could not restore subscription name: ${restored.status}`);
    }
  } finally {
    queue("resume-delivery");
  }
}
