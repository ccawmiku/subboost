const fs = require("node:fs");

function getRemoveOptions(platform = process.platform) {
  return {
    recursive: true,
    force: true,
    maxRetries: platform === "win32" ? 30 : 3,
    retryDelay: platform === "win32" ? 200 : 100,
  };
}

function isBusyError(error) {
  return error && ["EBUSY", "EPERM", "ENOTEMPTY"].includes(error.code);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function backupName(date = new Date()) {
  return [
    ".next.bak-",
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function removeDistDir(distDir, deps = {}) {
  const fsModule = deps.fs || fs;
  const platform = deps.platform || process.platform;
  const warn = deps.warn || console.warn;
  try {
    fsModule.rmSync(distDir, getRemoveOptions(platform));
    return;
  } catch (error) {
    if (platform !== "win32" || !isBusyError(error)) throw error;
    if (distDir !== ".next") {
      warn(`[clean-next] skipped locked backup directory ${distDir}`);
      return;
    }
    const fallback = backupName(deps.now);
    fsModule.renameSync(distDir, fallback);
    warn(`[clean-next] moved locked .next to ${fallback}; it will be removed on a later clean run.`);
  }
}

function listDistDirs(cwd = process.cwd(), fsModule = fs) {
  return [
    ".next",
    ...fsModule.readdirSync(cwd, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\.next\.bak-\d{8}-\d{6}$/.test(entry.name))
    .map((entry) => entry.name),
  ];
}

function run(deps = {}) {
  const fsModule = deps.fs || fs;
  const cwd = deps.cwd || process.cwd();
  for (const distDir of listDistDirs(cwd, fsModule)) {
    if (!fsModule.existsSync(distDir)) continue;
    removeDistDir(distDir, deps);
  }
}

run();

module.exports = {
  backupName,
  getRemoveOptions,
  isBusyError,
  listDistDirs,
  removeDistDir,
  run,
};
