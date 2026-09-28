import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(localDir, "wrangler.production.jsonc");
const keyDir = path.join(homedir(), ".subboost-cf-personal");
const keyPath = path.join(keyDir, "backup.key");
const backupDir = path.join(localDir, "backups");
const wranglerPath = path.join(localDir, "..", "node_modules", "wrangler", "bin", "wrangler.js");
const magic = Buffer.from("SBCFBK01");

function key() {
  mkdirSync(keyDir, { recursive: true });
  if (!existsSync(keyPath)) {
    writeFileSync(keyPath, randomBytes(32).toString("base64url"), { mode: 0o600, flag: "wx" });
    try { chmodSync(keyPath, 0o600); } catch { /* Windows ACLs govern access. */ }
  }
  const value = Buffer.from(readFileSync(keyPath, "utf8").trim(), "base64url");
  if (value.length !== 32) throw new Error("Backup key must be 32 bytes.");
  return value;
}

function temporaryDirectory() {
  return mkdtempSync(path.join(tmpdir(), "subboost-cf-backup-"));
}

function removeTemporaryDirectory(directory) {
  const resolved = realpathSync(directory);
  const parent = realpathSync(tmpdir());
  if (!resolved.startsWith(parent + path.sep) || !path.basename(resolved).startsWith("subboost-cf-backup-")) {
    throw new Error("Refusing to remove an unexpected temporary directory.");
  }
  rmSync(resolved, { recursive: true, force: true });
}

function wrangler(args) {
  const result = spawnSync(process.execPath, [wranglerPath, ...args], {
    cwd: localDir,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Wrangler failed: ${(result.stderr || result.stdout || "unknown error").slice(-900)}`);
  }
  return result.stdout;
}

function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(magic);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), ciphertext]);
}

function decrypt(encrypted) {
  if (encrypted.length < 36 || !encrypted.subarray(0, 8).equals(magic)) throw new Error("Invalid backup format.");
  const decipher = createDecipheriv("aes-256-gcm", key(), encrypted.subarray(8, 20));
  decipher.setAAD(magic);
  decipher.setAuthTag(encrypted.subarray(20, 36));
  return Buffer.concat([decipher.update(encrypted.subarray(36)), decipher.final()]);
}

function databaseName() {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  return config.d1_databases?.[0]?.database_name;
}

function restoreTest(backupPath) {
  const directory = temporaryDirectory();
  try {
    const sql = decrypt(readFileSync(backupPath));
    if (sql.length < 100 || !sql.includes(Buffer.from("Subscription"))) throw new Error("Backup is missing the subscription schema.");
    const sqlPath = path.join(directory, "backup.sql");
    writeFileSync(sqlPath, sql, { mode: 0o600 });
    wrangler(["d1", "execute", databaseName(), "--local", "--config", configPath, "--persist-to", path.join(directory, "state"), "--file", sqlPath, "--yes"]);
    const result = wrangler(["d1", "execute", databaseName(), "--local", "--config", configPath, "--persist-to", path.join(directory, "state"), "--command", "SELECT COUNT(*) AS total FROM Subscription", "--json"]);
    const rows = JSON.parse(result);
    const total = rows?.[0]?.results?.[0]?.total;
    if (!Number.isInteger(total)) throw new Error("Restored subscription count is unavailable.");
    console.log(`Backup restore test passed: ${total} subscriptions.`);
  } finally {
    removeTemporaryDirectory(directory);
  }
}

const [command, inputPath, outputPath] = process.argv.slice(2);
if (command === "backup") {
  if (!existsSync(configPath)) throw new Error(`Missing production config: ${configPath}`);
  const directory = temporaryDirectory();
  try {
    const sqlPath = path.join(directory, "export.sql");
    wrangler(["d1", "export", databaseName(), "--remote", "--config", configPath, "--output", sqlPath, "--skip-confirmation"]);
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const backupPath = path.join(backupDir, `subboost-personal-${stamp}.sbak`);
    writeFileSync(backupPath, encrypt(readFileSync(sqlPath)), { flag: "wx" });
    console.log(`Encrypted backup: ${backupPath}`);
    console.log(`Backup key location: ${keyPath}`);
    restoreTest(backupPath);
  } finally {
    removeTemporaryDirectory(directory);
  }
} else if (command === "test-restore" && inputPath) {
  restoreTest(path.resolve(inputPath));
} else if (command === "decrypt" && inputPath && outputPath) {
  const destination = path.resolve(outputPath);
  if (destination.startsWith(localDir + path.sep)) throw new Error("Refusing to write plaintext backup inside the repository.");
  const sql = decrypt(readFileSync(path.resolve(inputPath)));
  if (sql.length < 100 || !sql.includes(Buffer.from("Subscription"))) throw new Error("Backup SQL is invalid.");
  writeFileSync(destination, sql, { flag: "wx", mode: 0o600 });
  console.log(`Plaintext recovery SQL written to ${destination}. Delete it after importing into a new D1 database.`);
} else {
  throw new Error("Usage: node scripts/cloudflare-backup.mjs backup | test-restore <backup.sbak> | decrypt <backup.sbak> <outside-repo.sql>");
}
