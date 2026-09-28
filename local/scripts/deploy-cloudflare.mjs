import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
const initial = process.argv.includes("--initial");
if (!["staging", "production"].includes(target) || process.argv.some((arg, index) => index > 2 && arg !== "--initial")) {
  throw new Error("Usage: node scripts/deploy-cloudflare.mjs staging|production [--initial]");
}
const sourcePath = path.join(localDir, `wrangler.${target}.jsonc`);
const secretsPath = path.join(localDir, `.${target}-secrets`);
const generatedPath = path.join(localDir, "dist", "server", "wrangler.json");
const devVars = path.join(localDir, ".dev.vars");
const hiddenVars = path.join(localDir, ".dev.vars.deploy-hidden");
const wranglerPath = path.join(localDir, "..", "node_modules", "wrangler", "bin", "wrangler.js");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: localDir, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${path.basename(command)} ${args[0]} failed with ${result.status}`);
}

if (!existsSync(sourcePath)) throw new Error(`Missing ${sourcePath}. Copy wrangler.example.jsonc and set your own Worker, D1, and Queue names.`);
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const database = source.d1_databases?.[0];
const queue = source.queues?.producers?.[0]?.queue;
if (!source.name || !database?.database_name || !database.database_id || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(database.database_id) || !queue || source.queues?.consumers?.[0]?.queue !== queue) {
  throw new Error("Set a real Worker name, D1 name and ID, and matching Queue producer/consumer names in the private Wrangler config.");
}
if (initial) {
  if (!existsSync(secretsPath)) throw new Error(`Missing ${secretsPath}. Run create-cloudflare-secrets.mjs first.`);
  const secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
  for (const name of ["JWT_SECRET", "AUTH_PEPPER", "ENCRYPTION_KEY", "LOCAL_SETUP_TOKEN"]) {
    if (typeof secrets[name] !== "string" || secrets[name].length < 32) throw new Error(`Missing or weak ${name} in the private secrets file.`);
  }
  if (typeof secrets.APP_URL !== "string" || !secrets.APP_URL.startsWith("https://")) {
    throw new Error("APP_URL must be an HTTPS origin in the private secrets file.");
  }
  const check = spawnSync(process.execPath, [wranglerPath, "d1", "execute", database.database_name, "--remote", "--config", sourcePath,
    "--command", "SELECT name FROM sqlite_master WHERE name IN ('LocalAdmin', 'd1_migrations')", "--json"],
  { cwd: localDir, encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (check.status !== 0) throw new Error(`Could not verify the new D1 database: ${(check.stderr || check.stdout || "").slice(-500)}`);
  const rows = JSON.parse(check.stdout);
  if (!Array.isArray(rows?.[0]?.results) || rows[0].results.length > 0) {
    throw new Error("--initial is only for an empty D1 database. Use the normal update command for an existing instance.");
  }
} else if (target === "production") {
  run(process.execPath, ["scripts/cloudflare-backup.mjs", "backup"]);
}

if (existsSync(hiddenVars)) throw new Error("Hidden .dev.vars exists from an interrupted build; restore it before continuing.");
const hadVars = existsSync(devVars);
if (hadVars) renameSync(devVars, hiddenVars);
try {
  run(process.execPath, [path.join(localDir, "node_modules", "vinext", "dist", "cli.js"), "build"]);
} finally {
  if (hadVars) renameSync(hiddenVars, devVars);
}

const generated = JSON.parse(readFileSync(generatedPath, "utf8"));
generated.name = source.name;
generated.topLevelName = source.name;
generated.compatibility_date = source.compatibility_date;
generated.compatibility_flags = source.compatibility_flags;
generated.triggers = source.triggers;
generated.queues = source.queues;
generated.d1_databases = source.d1_databases.map((database) => ({ ...database, migrations_dir: "../../cloudflare/migrations" }));
writeFileSync(generatedPath, JSON.stringify(generated));
run(process.execPath, [wranglerPath, "d1", "migrations", "apply", source.d1_databases[0].database_name, "--remote", "--config", sourcePath]);
run(process.execPath, [wranglerPath, "deploy", "--config", generatedPath, ...(initial ? ["--secrets-file", secretsPath] : [])]);
let url = process.env.SUBBOOST_PUBLIC_URL;
if (!url && existsSync(secretsPath)) {
  try { url = JSON.parse(readFileSync(secretsPath, "utf8")).APP_URL; } catch { /* Older local secret formats need an explicit URL. */ }
}
if (url) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/health/live`);
  if (!response.ok) throw new Error(`Deployed health check failed: ${response.status}`);
}
console.log(`Deployed ${target} Worker ${source.name}${url ? ` at ${url}` : ". Check the URL printed by Wrangler."}`);
