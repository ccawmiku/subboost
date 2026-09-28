import { afterEach, describe, expect, it, vi } from "vitest";
import { compareStableVersions, parseStableVersion } from "@local/lib/release-version";
import { GET } from "./route";

const originalAppReleaseVersion = process.env.APP_RELEASE_VERSION;

type LatestReleasePayload = {
  currentVersion: string;
  latestVersion: string | null;
  latestTag: string | null;
  releaseUrl: string | null;
  hasUpdate: boolean;
};

function releaseResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

async function readPayload(): Promise<LatestReleasePayload> {
  const response = await GET();
  expect(response.status).toBe(200);
  return (await response.json()) as LatestReleasePayload;
}

describe("local latest release route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalAppReleaseVersion === undefined) delete process.env.APP_RELEASE_VERSION;
    else process.env.APP_RELEASE_VERSION = originalAppReleaseVersion;
  });

  it("reports an update when the latest stable GitHub release is newer", async () => {
    process.env.APP_RELEASE_VERSION = "2.3.20";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        releaseResponse({
          tag_name: "v2.3.21",
          html_url: "https://github.com/ccawmiku/subboost-cf-personal/releases/tag/v2.3.21",
        })
      )
    );

    await expect(readPayload()).resolves.toEqual({
      currentVersion: "2.3.20",
      latestVersion: "2.3.21",
      latestTag: "v2.3.21",
      releaseUrl: "https://github.com/ccawmiku/subboost-cf-personal/releases/tag/v2.3.21",
      hasUpdate: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/ccawmiku/subboost-cf-personal/releases/latest",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/vnd.github+json" }),
      })
    );
  });

  it("hides the update badge when the current release is already latest", async () => {
    process.env.APP_RELEASE_VERSION = "2.3.21";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        releaseResponse({
          tag_name: "v2.3.21",
          html_url: "https://github.com/ccawmiku/subboost-cf-personal/releases/tag/v2.3.21",
        })
      )
    );

    await expect(readPayload()).resolves.toMatchObject({
      currentVersion: "2.3.21",
      latestVersion: "2.3.21",
      latestTag: "v2.3.21",
      hasUpdate: false,
    });
  });

  it("uses the canonical GitHub release URL when html_url is missing", async () => {
    process.env.APP_RELEASE_VERSION = "2.3.20";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        releaseResponse({
          tag_name: "v2.3.21",
        })
      )
    );

    await expect(readPayload()).resolves.toMatchObject({
      currentVersion: "2.3.20",
      latestVersion: "2.3.21",
      latestTag: "v2.3.21",
      releaseUrl: "https://github.com/ccawmiku/subboost-cf-personal/releases/tag/v2.3.21",
      hasUpdate: true,
    });
  });

  it("fails closed before calling GitHub when the current version is not stable", async () => {
    process.env.APP_RELEASE_VERSION = "2.3.21-beta.1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(readPayload()).resolves.toEqual({
      currentVersion: "2.3.21-beta.1",
      latestVersion: null,
      latestTag: null,
      releaseUrl: null,
      hasUpdate: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when GitHub is unavailable", async () => {
    process.env.APP_RELEASE_VERSION = "2.3.20";
    vi.stubGlobal("fetch", vi.fn(async () => releaseResponse({ message: "rate limited" }, 403)));

    await expect(readPayload()).resolves.toEqual({
      currentVersion: "2.3.20",
      latestVersion: null,
      latestTag: null,
      releaseUrl: null,
      hasUpdate: false,
    });
  });

  it("fails closed when the GitHub request rejects", async () => {
    process.env.APP_RELEASE_VERSION = "2.3.20";
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("network down"))));

    await expect(readPayload()).resolves.toEqual({
      currentVersion: "2.3.20",
      latestVersion: null,
      latestTag: null,
      releaseUrl: null,
      hasUpdate: false,
    });
  });

  it("fails closed when GitHub returns malformed JSON", async () => {
    process.env.APP_RELEASE_VERSION = "2.3.20";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{not json", { status: 200 })));

    await expect(readPayload()).resolves.toEqual({
      currentVersion: "2.3.20",
      latestVersion: null,
      latestTag: null,
      releaseUrl: null,
      hasUpdate: false,
    });
  });

  it("ignores invalid latest release tags", async () => {
    process.env.APP_RELEASE_VERSION = "2.3.20";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        releaseResponse({
          tag_name: "v2.3.21-beta.1",
          html_url: "https://github.com/ccawmiku/subboost-cf-personal/releases/tag/v2.3.21-beta.1",
        })
      )
    );

    await expect(readPayload()).resolves.toEqual({
      currentVersion: "2.3.20",
      latestVersion: null,
      latestTag: null,
      releaseUrl: null,
      hasUpdate: false,
    });
  });

  it("compares only stable v-prefixed or plain semver versions", () => {
    expect(parseStableVersion("v1.2.3")?.version).toBe("1.2.3");
    expect(parseStableVersion("1.2.3")?.version).toBe("1.2.3");
    expect(parseStableVersion("1.2.3-beta.1")).toBeNull();

    const newer = parseStableVersion("1.3.0");
    const older = parseStableVersion("1.2.9");
    expect(newer).not.toBeNull();
    expect(older).not.toBeNull();
    if (!newer || !older) throw new Error("expected stable versions");
    expect(compareStableVersions(newer, older)).toBeGreaterThan(0);
  });
});
