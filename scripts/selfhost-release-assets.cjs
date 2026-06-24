#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_IMAGE_REPOSITORY = "ghcr.io/subboost/subboost";
const DEFAULT_OUTPUT = path.join("dist", "release-assets");
const MANAGER_ASSET_NAME = "subboost-manager";
const INSTALLER_DEFAULTS = [
  {
    arg: "--installer-release-url",
    env: "SUBBOOST_INSTALLER_RELEASE_URL",
    key: "installerReleaseUrl",
    name: "DEFAULT_RELEASE_URL",
    value: "https://github.com/SubBoost/subboost/releases/latest/download/release.json",
  },
  {
    arg: "--installer-compose-url",
    env: "SUBBOOST_INSTALLER_COMPOSE_URL",
    key: "installerComposeUrl",
    name: "DEFAULT_COMPOSE_URL",
    value: "https://github.com/SubBoost/subboost/releases/latest/download/docker-compose.image.yml",
  },
  {
    arg: "--installer-manager-url",
    env: "SUBBOOST_INSTALLER_MANAGER_URL",
    key: "installerManagerUrl",
    name: "DEFAULT_MANAGER_URL",
    value: "https://github.com/SubBoost/subboost/releases/latest/download/subboost-manager",
  },
  {
    arg: "--installer-image",
    env: "SUBBOOST_INSTALLER_IMAGE",
    key: "installerImage",
    name: "DEFAULT_IMAGE",
    value: "ghcr.io/subboost/subboost:latest",
  },
];

function usage() {
  return [
    "Usage:",
    "  node scripts/selfhost-release-assets.cjs [--output <dir>] [--image <image>] [--image-tag <image>] [--base-url <url>] [--tag <vX.Y.Z>] [--build-sha <sha>] [--installer-release-url <url>] [--installer-compose-url <url>] [--installer-manager-url <url>] [--installer-image <image>] [--dry-run]",
    "",
    "Creates release.json, install.sh, docker-compose.image.yml, and subboost-manager for GitHub Release assets.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.SUBBOOST_RELEASE_ASSET_BASE_URL || process.env.SUBBOOST_ONECLICK_BASE_URL || "",
    buildSha: process.env.SUBBOOST_BUILD_SHA || "",
    dryRun: false,
    image: process.env.SUBBOOST_IMAGE || "",
    imageRepository: process.env.SUBBOOST_IMAGE_REPOSITORY || DEFAULT_IMAGE_REPOSITORY,
    imageTag: process.env.SUBBOOST_RELEASE_IMAGE_TAG || "",
    output: process.env.SUBBOOST_RELEASE_ASSET_OUTPUT || process.env.SUBBOOST_ONECLICK_OUTPUT || DEFAULT_OUTPUT,
    releaseTag: process.env.GITHUB_REF_NAME || "",
  };
  for (const item of INSTALLER_DEFAULTS) {
    args[item.key] = process.env[item.env] || "";
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      args.baseUrl = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--build-sha") {
      args.buildSha = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--image") {
      args.image = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--image-repository") {
      args.imageRepository = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--image-tag") {
      args.imageTag = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--output") {
      args.output = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--tag" || arg === "--release-tag") {
      args.releaseTag = argv[index + 1] || "";
      index += 1;
    } else {
      const installerDefault = INSTALLER_DEFAULTS.find((item) => item.arg === arg);
      if (installerDefault) {
        args[installerDefault.key] = argv[index + 1] || "";
        index += 1;
      } else if (arg === "--help" || arg === "-h") {
        args.help = true;
      } else {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
  }
  if (!args.help) {
    if (!args.output) throw new Error("--output cannot be empty.");
    if (!args.imageRepository) throw new Error("--image-repository cannot be empty.");
    if (argv.includes("--image") && !args.image) throw new Error("--image cannot be empty.");
    if (argv.includes("--image-tag") && !args.imageTag) throw new Error("--image-tag cannot be empty.");
    if ((argv.includes("--tag") || argv.includes("--release-tag")) && !args.releaseTag) {
      throw new Error("--tag cannot be empty.");
    }
    if (argv.includes("--build-sha") && !args.buildSha) throw new Error("--build-sha cannot be empty.");
    for (const item of INSTALLER_DEFAULTS) {
      if (argv.includes(item.arg) && !args[item.key]) throw new Error(`${item.arg} cannot be empty.`);
    }
  }
  return args;
}

function urlJoin(baseUrl, fileName) {
  if (!baseUrl) return fileName;
  return `${baseUrl.replace(/\/+$/, "")}/${fileName}`;
}

function readPackageVersion(publicRoot) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(publicRoot, "package.json"), "utf8"));
  if (!packageJson.version) throw new Error("package.json is missing version.");
  return String(packageJson.version);
}

function gitRevParse(publicRoot) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: publicRoot, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git rev-parse HEAD failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function buildManifest(publicRoot, args) {
  const version = readPackageVersion(publicRoot);
  const buildSha = args.buildSha || gitRevParse(publicRoot);
  const shortSha = buildSha.slice(0, 12);
  const releaseTag = args.releaseTag || `v${version}`;
  const imageRepository = args.imageRepository || DEFAULT_IMAGE_REPOSITORY;
  const imageTag = args.imageTag || `${imageRepository}:${releaseTag}`;
  const image = args.image || imageTag;
  const buildVersion = `${version}+sha.${shortSha}`;

  return {
    buildSha,
    buildVersion,
    composeUrl: urlJoin(args.baseUrl, "docker-compose.image.yml"),
    image,
    imageTag,
    installerUrl: urlJoin(args.baseUrl, "install.sh"),
    managerUrl: urlJoin(args.baseUrl, MANAGER_ASSET_NAME),
    version,
    versionToken: buildVersion,
  };
}

function copyFile(publicRoot, from, to, options = {}) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const source = path.join(publicRoot, from);
  if (options.normalizeLineEndings) {
    fs.writeFileSync(to, fs.readFileSync(source, "utf8").replace(/\r\n/g, "\n"), "utf8");
    return;
  }
  fs.copyFileSync(source, to);
}

function replaceInstallerDefault(content, item, replacement) {
  const expected = `${item.name}="${item.value}"`;
  const replacementLine = `${item.name}="${replacement}"`;
  const count = content.split(expected).length - 1;
  if (count !== 1) {
    throw new Error(`Expected exactly one ${item.name} assignment in install.sh, found ${count}.`);
  }
  return content.replace(expected, replacementLine);
}

function rewriteInstallerDefaults(content, args) {
  let output = content;
  for (const item of INSTALLER_DEFAULTS) {
    const replacement = args[item.key];
    if (replacement) output = replaceInstallerDefault(output, item, replacement);
  }
  return output;
}

function copyInstallScript(publicRoot, to, args) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const source = path.join(publicRoot, "local/scripts/install.sh");
  const content = fs.readFileSync(source, "utf8").replace(/\r\n/g, "\n");
  fs.writeFileSync(to, rewriteInstallerDefaults(content, args), "utf8");
}

function createBundle(publicRoot, args) {
  const output = path.resolve(publicRoot, args.output);
  const manifest = buildManifest(publicRoot, args);
  if (args.dryRun) return { manifest, output };

  fs.rmSync(output, { force: true, recursive: true });
  fs.mkdirSync(output, { recursive: true });
  copyFile(publicRoot, "local/docker-compose.image.yml", path.join(output, "docker-compose.image.yml"));
  copyInstallScript(publicRoot, path.join(output, "install.sh"), args);
  copyFile(publicRoot, "local/scripts/subboost.sh", path.join(output, MANAGER_ASSET_NAME), { normalizeLineEndings: true });
  fs.chmodSync(path.join(output, "install.sh"), 0o755);
  fs.chmodSync(path.join(output, MANAGER_ASSET_NAME), 0o755);
  fs.writeFileSync(path.join(output, "release.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, output };
}

function main(argv = process.argv.slice(2), dependencies = {}) {
  const publicRoot = dependencies.root || process.cwd();
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  const result = createBundle(publicRoot, args);
  console.log(`[selfhost-release-assets] output=${result.output}`);
  console.log(`[selfhost-release-assets] image=${result.manifest.image}`);
  console.log(`[selfhost-release-assets] imageTag=${result.manifest.imageTag}`);
  console.log(`[selfhost-release-assets] version=${result.manifest.buildVersion}`);
  if (args.dryRun) console.log(JSON.stringify(result.manifest, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[selfhost-release-assets] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = {
  buildManifest,
  createBundle,
  MANAGER_ASSET_NAME,
  main,
  parseArgs,
  rewriteInstallerDefaults,
  usage,
};
