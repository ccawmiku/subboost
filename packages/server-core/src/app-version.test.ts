import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAppVersionInfo } from "./app-version";

const rootPackage = JSON.stringify({ name: "subboost", version: "2.2.4" });
const appPackage = JSON.stringify({ name: "@subboost/app", version: "0.1.0" });
const localPackage = JSON.stringify({ name: "@subboost/local", version: "0.1.0" });

function createReadFile(files: Record<string, string>) {
  return (filePath: string) => {
    const normalized = filePath.replace(/\\/g, "/");
    const content = files[normalized];
    if (content === undefined) throw new Error(`Missing fixture: ${normalized}`);
    return content;
  };
}

describe("app version resolution", () => {
  it("uses operator-supplied APP_VERSION as the build version without exposing it as the public token", () => {
    const info = resolveAppVersionInfo({
        env: { APP_VERSION: "1.0.0+sha.abc123" },
        cwd: "/repo/app",
        readFile: createReadFile({}),
      });

    expect(info).toMatchObject({
      releaseVersion: "1.0.0",
      buildSha: null,
      buildVersion: "1.0.0+sha.abc123",
    });
    expect(info.version).toMatch(/^1\.0\.0\+build\.[a-f0-9]{12}$/);
    expect(info.versionToken).toBe(info.version);
  });

  it("builds a SemVer runtime version from release version and build sha", () => {
    const info = resolveAppVersionInfo({
        env: {
          APP_RELEASE_VERSION: "1.0.0",
          APP_BUILD_SHA: "abcdef1234567890abcdef1234567890abcdef12",
        },
        cwd: "/repo/app",
        readFile: createReadFile({}),
      });

    expect(info).toMatchObject({
      releaseVersion: "1.0.0",
      buildSha: "abcdef1234567890abcdef1234567890abcdef12",
      buildVersion: "1.0.0+sha.abcdef123456",
    });
    expect(info.version).toMatch(/^1\.0\.0\+build\.[a-f0-9]{12}$/);
    expect(info.versionToken).toBe(info.version);
  });

  it("uses APP_VERSION_TOKEN for the public app-version value", () => {
    expect(
      resolveAppVersionInfo({
        env: {
          APP_RELEASE_VERSION: "1.0.0",
          APP_BUILD_SHA: "abcdef1234567890abcdef1234567890abcdef12",
          APP_VERSION_TOKEN: "1.0.0+build.public123",
        },
        cwd: "/repo/app",
        readFile: createReadFile({}),
      })
    ).toEqual({
      version: "1.0.0+build.public123",
      releaseVersion: "1.0.0",
      buildSha: "abcdef1234567890abcdef1234567890abcdef12",
      buildVersion: "1.0.0+sha.abcdef123456",
      versionToken: "1.0.0+build.public123",
    });
  });

  it("uses explicit release metadata before internal local package fallback", () => {
    const readFile = createReadFile({
      [join("/repo/local", "package.json").replace(/\\/g, "/")]: localPackage,
    });

    const info = resolveAppVersionInfo({
        env: {
          APP_RELEASE_VERSION: "2.3.13",
          APP_BUILD_SHA: "abcdef1234567890abcdef1234567890abcdef12",
        },
        cwd: "/repo/local",
        readFile,
      });

    expect(info).toMatchObject({
      releaseVersion: "2.3.13",
      buildSha: "abcdef1234567890abcdef1234567890abcdef12",
      buildVersion: "2.3.13+sha.abcdef123456",
    });
    expect(info.version).toMatch(/^2\.3\.13\+build\.[a-f0-9]{12}$/);
    expect(info.versionToken).toBe(info.version);
  });

  it("falls back from invalid explicit metadata to a prerelease APP_VERSION", () => {
    const info = resolveAppVersionInfo({
      env: {
        APP_RELEASE_VERSION: "latest",
        APP_VERSION: "2.3.21-beta.1+build.local",
        APP_BUILD_SHA: "not-a-sha",
      },
      cwd: "/repo/app",
      readFile: createReadFile({}),
    });

    expect(info).toMatchObject({
      releaseVersion: "2.3.21-beta.1",
      buildSha: null,
      buildVersion: "2.3.21-beta.1+build.local",
    });
    expect(info.versionToken).toMatch(/^2\.3\.21-beta\.1\+build\.[a-f0-9]{12}$/);
  });

  it("accepts build sha values from common deployment environment names", () => {
    expect(
      resolveAppVersionInfo({
        env: { APP_RELEASE_VERSION: "2.3.21", GITHUB_SHA: "abcdef1" },
        cwd: "/repo/app",
        readFile: createReadFile({}),
      }).buildVersion
    ).toBe("2.3.21+sha.abcdef1");

    expect(
      resolveAppVersionInfo({
        env: { APP_RELEASE_VERSION: "2.3.21", VERCEL_GIT_COMMIT_SHA: "fedcba9876543210" },
        cwd: "/repo/app",
        readFile: createReadFile({}),
      }).buildVersion
    ).toBe("2.3.21+sha.fedcba987654");
  });

  it("treats a raw sha APP_VERSION as build metadata when no explicit release is present", () => {
    const info = resolveAppVersionInfo({
      env: { APP_VERSION: "abcdef123456" },
      cwd: "/repo/app",
      readFile: createReadFile({
        [join("/repo/app", "package.json").replace(/\\/g, "/")]: appPackage,
      }),
    });

    expect(info).toMatchObject({
      releaseVersion: "0.1.0",
      buildSha: "abcdef123456",
      buildVersion: "abcdef123456",
    });
    expect(info.versionToken).toMatch(/^0\.1\.0\+build\.[a-f0-9]{12}$/);
  });

  it("prefers the root package version from app and local runtime cwd", () => {
    const readFile = createReadFile({
      [join("/repo/app", "package.json").replace(/\\/g, "/")]: appPackage,
      [join("/repo/local", "package.json").replace(/\\/g, "/")]: localPackage,
      [join("/repo", "package.json").replace(/\\/g, "/")]: rootPackage,
    });

    expect(resolveAppVersionInfo({ env: {}, cwd: "/repo/app", readFile }).releaseVersion).toBe("2.2.4");
    expect(resolveAppVersionInfo({ env: {}, cwd: "/repo/local", readFile }).releaseVersion).toBe("2.2.4");
  });

  it("skips unreadable, malformed, array, and invalid package files before using fallback versions", () => {
    const readFile = createReadFile({
      [join("/repo/app", "package.json").replace(/\\/g, "/")]: "{not json",
      [join("/repo/app", "..", "package.json").replace(/\\/g, "/")]: JSON.stringify([]),
      [join("/repo/app", "..", "..", "package.json").replace(/\\/g, "/")]: JSON.stringify({
        name: "@subboost/fallback",
        version: "2.4.0",
      }),
    });

    expect(resolveAppVersionInfo({ env: {}, cwd: "/repo/app", readFile }).releaseVersion).toBe("2.4.0");
  });

  it("uses 0.0.0 when neither env nor package metadata has a release version", () => {
    const readFile = createReadFile({
      [join("/repo/app", "package.json").replace(/\\/g, "/")]: JSON.stringify({
        name: "@subboost/app",
        version: "next",
      }),
      [join("/repo/app", "..", "package.json").replace(/\\/g, "/")]: JSON.stringify({
        name: "@subboost/root",
        version: "",
      }),
      [join("/repo/app", "..", "..", "package.json").replace(/\\/g, "/")]: JSON.stringify({
        name: "@subboost/parent",
        version: "01.0.0",
      }),
    });

    expect(resolveAppVersionInfo({ env: { APP_VERSION: " " }, cwd: "/repo/app", readFile }).releaseVersion).toBe("0.0.0");
  });

  it("uses bundled package metadata when runtime package files are unavailable", () => {
    const info = resolveAppVersionInfo({
      env: {},
      cwd: "/worker",
      readFile: createReadFile({}),
      fallbackReleaseVersion: "2.8.1",
    });

    expect(info.releaseVersion).toBe("2.8.1");
    expect(info.buildVersion).toBe("2.8.1");
  });
});
