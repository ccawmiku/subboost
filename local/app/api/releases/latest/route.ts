import { NextResponse } from "next/server";
import { resolveAppVersionInfo } from "@subboost/server-core/app-version";
import { compareStableVersions, parseStableVersion } from "@local/lib/release-version";
import localPackage from "../../../../package.json";

export const revalidate = 3600;

const RELEASE_CACHE_SECONDS = 3600;
const GITHUB_LATEST_RELEASE_URL = "https://api.github.com/repos/ccawmiku/subboost-cf-personal/releases/latest";

const CACHE_HEADERS = {
  "Cache-Control": `public, max-age=${RELEASE_CACHE_SECONDS}, stale-while-revalidate=${RELEASE_CACHE_SECONDS}`,
};

type LatestReleasePayload = {
  currentVersion: string;
  latestVersion: string | null;
  latestTag: string | null;
  releaseUrl: string | null;
  hasUpdate: boolean;
};

function response(payload: LatestReleasePayload) {
  return NextResponse.json(payload, { headers: CACHE_HEADERS });
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readObjectString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return readString((value as Record<string, unknown>)[key]);
}

function buildFallbackPayload(currentVersion: string): LatestReleasePayload {
  return {
    currentVersion,
    latestVersion: null,
    latestTag: null,
    releaseUrl: null,
    hasUpdate: false,
  };
}

export async function GET() {
  const { releaseVersion: currentVersion } = resolveAppVersionInfo({
    env: process.env,
    cwd: process.cwd(),
    fallbackReleaseVersion: localPackage.version,
  });
  const currentStable = parseStableVersion(currentVersion);
  if (!currentStable) return response(buildFallbackPayload(currentVersion));

  try {
    const releaseResponse = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "SubBoost local release check",
      },
      next: { revalidate: RELEASE_CACHE_SECONDS },
    } as RequestInit & { next: { revalidate: number } });

    if (!releaseResponse.ok) return response(buildFallbackPayload(currentVersion));

    const releaseData = (await releaseResponse.json().catch(() => null)) as unknown;
    const latestTag = readObjectString(releaseData, "tag_name");
    const latestStable = parseStableVersion(latestTag);
    if (!latestStable) return response(buildFallbackPayload(currentVersion));

    const releaseUrl =
      readObjectString(releaseData, "html_url") ??
      `https://github.com/ccawmiku/subboost-cf-personal/releases/tag/${latestTag}`;

    return response({
      currentVersion,
      latestVersion: latestStable.version,
      latestTag,
      releaseUrl,
      hasUpdate: compareStableVersions(latestStable, currentStable) > 0,
    });
  } catch {
    return response(buildFallbackPayload(currentVersion));
  }
}
