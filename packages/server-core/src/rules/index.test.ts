import { describe, expect, it, vi } from "vitest";
import {
  buildCnRuleCandidateResponse,
  buildCnRuleCandidateUnavailableResponse,
  buildRuleCatalogDiff,
  createRuleCatalogService,
  extractRemoteRuleNames,
  normalizeRuleSearchType,
  parseCnRuleCandidateQuery,
  RuleIndexUnavailableError,
} from "./index";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

function createTreeFetch(paths: string[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/git/trees/meta")) {
      return jsonResponse({ sha: "meta", tree: [{ path: "geo", type: "tree", sha: "geo-sha" }] });
    }
    if (url.includes("/git/trees/geo-sha")) {
      return jsonResponse({
        sha: "geo-sha",
        tree: paths.map((rulePath) => ({ path: rulePath, type: "blob", sha: `sha-${rulePath}` })),
      });
    }
    if (url.endsWith("/geosite/geolocation-cn.list")) {
      return textResponse("+.covered.cn\n");
    }
    if (url.endsWith("/geosite/google-cn.list")) {
      return textResponse("+.google.cn\n");
    }
    return textResponse("", 404);
  }) as unknown as typeof fetch;
}

describe("rule catalog service", () => {
  it("parses CN candidate route query params with defaults, validation, and dedupe", () => {
    const explicit = parseCnRuleCandidateQuery(
      new URLSearchParams("modules=cn,ad,missing,cn&excluded=media:netflix,,bad,media:netflix&debug=1")
    );

    expect(explicit).toEqual({
      moduleIds: ["cn", "ad"],
      excludedRuleKeys: ["media:netflix"],
      debug: true,
    });

    const defaults = parseCnRuleCandidateQuery(new URLSearchParams());

    expect(defaults.moduleIds).toContain("cn");
    expect(defaults.excludedRuleKeys).toEqual([]);
    expect(defaults.debug).toBe(false);
  });

  it("builds CN candidate responses without changing the route wire shape", () => {
    const candidate = {
      id: "google-cn",
      name: "google-cn",
      behavior: "domain" as const,
      format: "mrs" as const,
      path: "geosite/google-cn.mrs",
      parentRuleId: "google",
      parentModuleId: "google",
      variantKind: "dash-cn" as const,
      canonicalId: "google-cn",
      coveredByGeolocationCn: false,
      empty: false,
      actionable: true,
    };

    const result = {
      items: [candidate],
      allItems: [candidate],
      parents: [],
      fetchedAt: 100,
      expiresAt: 200,
      source: "remote" as const,
    };

    expect(buildCnRuleCandidateResponse(result)).toEqual({
      items: [candidate],
      source: "remote",
      cache: {
        fetchedAt: 100,
        expiresAt: 200,
        ttlMs: expect.any(Number),
      },
    });
    expect(buildCnRuleCandidateResponse(result, { debug: true })).toEqual({
      items: [candidate],
      source: "remote",
      cache: {
        fetchedAt: 100,
        expiresAt: 200,
        ttlMs: expect.any(Number),
      },
      allItems: [candidate],
    });
    expect(buildCnRuleCandidateUnavailableResponse()).toEqual({
      items: [],
      source: "unavailable",
      error: "规则库暂不可用，请稍后重试",
      code: "RULE_INDEX_UNAVAILABLE",
    });
  });

  it("extracts remote rule names from supported tree paths only", () => {
    const tree = [
      { path: "geo/geosite/google.mrs", type: "blob", sha: "1" },
      { path: "geosite/youtube.mrs", type: "blob", sha: "2" },
      { path: "geo/geosite/nested/ignored.mrs", type: "blob", sha: "3" },
      { path: "geo/geosite/readme.txt", type: "blob", sha: "4" },
      { path: "geo/geoip/cn.mrs", type: "blob", sha: "5" },
      { path: "geo/geosite/tree.mrs", type: "tree", sha: "6" },
    ] as const;

    expect(extractRemoteRuleNames([...tree], "geosite")).toEqual(["google", "youtube"]);
    expect(extractRemoteRuleNames([...tree], "geoip")).toEqual(["cn"]);
    expect(normalizeRuleSearchType("geoip")).toBe("geoip");
    expect(normalizeRuleSearchType("bogus")).toBe("all");
    expect(normalizeRuleSearchType(undefined)).toBe("all");
  });

  it("builds catalog diffs from remote keys", () => {
    const diff = buildRuleCatalogDiff({
      fetchedAt: 123,
      expiresAt: 456,
      geosite: ["subboost-extra-test-rule"],
      geoip: ["subboost-extra-test-ip"],
      source: "remote",
    });

    expect(diff.fetchedAt).toBe(123);
    expect(diff.totalRemoteRules).toBe(2);
    expect(diff.remoteOnlySample).toEqual(["geoip/subboost-extra-test-ip.mrs", "geosite/subboost-extra-test-rule.mrs"]);
    expect(diff.missingCuratedRules.length).toBeGreaterThan(0);
    expect(diff.missingModuleRuleRefs.length).toBeGreaterThan(0);
  });

  it("fails closed when the remote index is unavailable and no cache exists", async () => {
    const service = createRuleCatalogService({
      fetchImpl: vi.fn(async () => textResponse("nope", 500)) as unknown as typeof fetch,
    });

    await expect(service.getRemoteRuleIndex({ allowStale: false })).rejects.toBeInstanceOf(
      RuleIndexUnavailableError
    );
    await expect(service.getRemoteRuleIndex()).rejects.toMatchObject({
      name: "RuleIndexUnavailableError",
      message: expect.stringContaining("GitHub API 500"),
    });
  });

  it("returns a stale index when refresh fails after a successful fetch", async () => {
    let now = 1_000;
    let fail = false;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (fail) return textResponse("nope", 500);
      return createTreeFetch(["geosite/google.mrs", "geoip/cn.mrs"])(input);
    }) as unknown as typeof fetch;
    const service = createRuleCatalogService({ fetchImpl, now: () => now, cacheTtlMs: 10 });

    const first = await service.getRemoteRuleIndex();
    expect(first.source).toBe("remote");
    expect(first.geosite).toEqual(["google"]);

    fail = true;
    now = 2_000;
    const second = await service.getRemoteRuleIndex();
    expect(second.source).toBe("stale");
    expect(second.geosite).toEqual(["google"]);
    expect(service.getCachedRuleIndex()?.source).toBe("stale");
  });

  it("skips refresh while the index is fresh and exposes cached source state", async () => {
    let now = 1_000;
    const fetchImpl = createTreeFetch(["geosite/google.mrs", "geoip/cn.mrs"]);
    const service = createRuleCatalogService({ fetchImpl, now: () => now, cacheTtlMs: 1_000 });

    const first = await service.refreshRuleIndex();
    expect(first.status).toBe("refreshed");
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const second = await service.refreshRuleIndex();
    expect(second.status).toBe("skipped");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(service.getCachedRuleIndex()?.source).toBe("remote");

    now = 3_000;
    expect(service.getCachedRuleIndex()?.source).toBe("stale");
  });

  it("falls back to recursive ref fetch when geo tree sha is absent", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/git/trees/meta") && !url.includes("recursive=1")) {
        return jsonResponse({ sha: "meta", tree: [] });
      }
      if (url.includes("/git/trees/meta?recursive=1")) {
        return jsonResponse({
          sha: "meta",
          tree: [{ path: "geo/geosite/fallback.mrs", type: "blob", sha: "fallback" }],
        });
      }
      return textResponse("", 404);
    }) as unknown as typeof fetch;
    const service = createRuleCatalogService({ fetchImpl });

    const index = await service.getRemoteRuleIndex();

    expect(index.geosite).toEqual(["fallback"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports unavailable refresh when GitHub returns a truncated tree", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/git/trees/meta")) {
        return jsonResponse({ sha: "meta", tree: [{ path: "geo", type: "tree", sha: "geo-sha" }] });
      }
      return jsonResponse({ sha: "geo-sha", truncated: true, tree: [] });
    }) as unknown as typeof fetch;
    const service = createRuleCatalogService({ fetchImpl });

    await expect(service.getRemoteRuleIndex()).rejects.toBeInstanceOf(RuleIndexUnavailableError);
    await expect(service.refreshRuleIndex()).resolves.toMatchObject({
      status: "unavailable",
      error: expect.stringContaining("truncated"),
    });
  });

  it("searches only rules present in the verified remote index", async () => {
    const service = createRuleCatalogService({
      fetchImpl: createTreeFetch(["geosite/google-gemini.mrs", "geosite/netflix.mrs", "geoip/cn.mrs"]),
    });

    const missing = await service.searchRules({ keyword: "bard", page: 1, size: 20 });
    expect(missing.items).toEqual([]);

    const empty = await service.searchRules({ keyword: "   ", type: "geosite", page: 0.2, size: 0.2 });
    expect(empty).toMatchObject({
      items: [],
      keyword: "   ",
      page: 1,
      size: 1,
      source: "remote",
      totalMatched: 0,
      totalRules: 3,
      type: "geosite",
    });

    const present = await service.searchRules({ keyword: "gemini", page: 1, size: 20 });
    expect(present.items.map((item) => item.url)).toEqual([
      "https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/google-gemini.mrs",
    ]);

    const geoip = await service.searchRules({ keyword: "cn", type: "geoip", page: 1, size: 1 });
    expect(geoip.items).toEqual([
      expect.objectContaining({
        behavior: "ipcidr",
        id: "cn-ip",
        url: "https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geoip/cn.mrs",
      }),
    ]);
    expect(geoip.totalMatched).toBe(1);
    expect(service.hasRemoteRule(await service.getRemoteRuleIndex(), { type: "geoip", name: "cn" })).toBe(true);
  });

  it("builds fallback metadata for remote rules that are not in the featured catalog", async () => {
    const service = createRuleCatalogService({
      fetchImpl: createTreeFetch(["geosite/subboost-remote-only.mrs", "geoip/subboost-remote-only.mrs"]),
    });

    const domain = await service.searchRules({ keyword: "subboost", type: "geosite", page: 1, size: 10 });
    expect(domain.items).toEqual([
      expect.objectContaining({
        id: "subboost-remote-only",
        behavior: "domain",
        category: "other",
      }),
    ]);

    const ip = await service.searchRules({ keyword: "subboost", type: "geoip", page: 1, size: 10 });
    expect(ip.items).toEqual([
      expect.objectContaining({
        id: "subboost-remote-only-ip",
        behavior: "ipcidr",
        category: "other",
      }),
    ]);
  });

  it("discovers CN candidates only from remote variants that exist", async () => {
    const service = createRuleCatalogService({
      fetchImpl: createTreeFetch(["geosite/google.mrs", "geosite/google-cn.mrs", "geosite/geolocation-cn.mrs"]),
    });

    const discovery = await service.getCnRuleCandidateDiscovery({
      moduleIds: ["google"],
      excludedRuleKeys: [],
    });

    expect(discovery.allItems.map((item) => item.id)).toEqual(["google-cn"]);
    expect(discovery.items.map((item) => item.id)).toEqual(["google-cn"]);
  });

  it("returns empty CN discovery without remote fetches when there are no parents", async () => {
    const fetchImpl = createTreeFetch(["geosite/google-cn.mrs"]);
    const service = createRuleCatalogService({ fetchImpl, now: () => 1_000, cacheTtlMs: 10_000 });

    const discovery = await service.getCnRuleCandidateDiscovery({ moduleIds: ["unknown-module"] });

    expect(discovery).toMatchObject({
      items: [],
      allItems: [],
      parents: [],
      fetchedAt: 1_000,
      expiresAt: 11_000,
      source: "remote",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("deduplicates inflight index refreshes and sends GitHub headers", async () => {
    const seenHeaders: HeadersInit[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seenHeaders.push(init?.headers ?? {});
      return createTreeFetch(["geosite/google.mrs", "geoip/cn.mrs"])(input);
    }) as unknown as typeof fetch;
    const service = createRuleCatalogService({
      fetchImpl,
      getGitHubToken: () => "token-1",
      userAgent: "SubBoost Test",
    });

    const [first, second] = await Promise.all([service.getRemoteRuleIndex(), service.getRemoteRuleIndex()]);

    expect(first.geosite).toEqual(["google"]);
    expect(second.geoip).toEqual(["cn"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(seenHeaders[0]).toMatchObject({
      Authorization: "Bearer token-1",
      "User-Agent": "SubBoost Test",
    });
  });

  it("returns stale refresh results after cached index refresh failures", async () => {
    let now = 1_000;
    let fail = false;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (fail) return textResponse("nope", 500);
      return createTreeFetch(["geosite/google.mrs"])(input);
    }) as unknown as typeof fetch;
    const service = createRuleCatalogService({ fetchImpl, now: () => now, cacheTtlMs: 1 });

    await expect(service.refreshRuleIndex({ force: true })).resolves.toMatchObject({ status: "refreshed" });
    fail = true;
    now = 2_000;

    await expect(service.refreshRuleIndex({ force: true })).resolves.toMatchObject({
      status: "stale",
      error: expect.stringContaining("GitHub API 500"),
      index: expect.objectContaining({ source: "stale", geosite: ["google"] }),
    });
  });

  it("paginates rule search results after matching verified remote rules", async () => {
    const service = createRuleCatalogService({
      fetchImpl: createTreeFetch(["geosite/apple.mrs", "geosite/amazon.mrs", "geosite/adobe.mrs", "geoip/apple.mrs"]),
    });

    const page = await service.searchRules({ keyword: "a", type: "geosite", page: 2.8, size: 1.2 });

    expect(page).toMatchObject({
      page: 2,
      size: 1,
      totalMatched: 3,
      type: "geosite",
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].url).toContain("/geosite/");
  });

  it("serves a persisted stale index without calling GitHub on a cold request", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("network should not be used"); }) as unknown as typeof fetch;
    const service = createRuleCatalogService({
      fetchImpl,
      now: () => 2_000,
      loadIndex: async () => ({ geosite: ["google"], geoip: [], fetchedAt: 100, expiresAt: 200, source: "remote" }),
      serveCachedOnly: true,
      serveStaleWithoutRefresh: true,
    });
    const result = await service.searchRules({ keyword: "google", page: 1, size: 5 });
    expect(result).toMatchObject({ source: "stale", totalMatched: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires the background refresh when no persistent cache exists", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("network should not be used"); }) as unknown as typeof fetch;
    const service = createRuleCatalogService({ fetchImpl, loadIndex: async () => null, serveCachedOnly: true });
    await expect(service.searchRules({ keyword: "google", page: 1, size: 5 })).rejects.toBeInstanceOf(RuleIndexUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caches CN discovery and returns stale discovery after later rule-list failures", async () => {
    let failLists = false;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(".list") && failLists) return textResponse("missing", 500);
      return createTreeFetch(["geosite/google.mrs", "geosite/google-cn.mrs", "geosite/geolocation-cn.mrs"])(input);
    }) as unknown as typeof fetch;
    const service = createRuleCatalogService({ fetchImpl, now: () => 1_000, cacheTtlMs: 10_000 });

    const first = await service.getCnRuleCandidateDiscovery({ moduleIds: ["google"] });
    const second = await service.getCnRuleCandidateDiscovery({ moduleIds: ["google"] });
    expect(second).toBe(first);

    failLists = true;
    const stale = await service.getCnRuleCandidateDiscovery({ moduleIds: ["google"], force: true });
    expect(stale).toEqual(expect.objectContaining({ source: "stale", allItems: first.allItems }));
  });

  it("deduplicates inflight CN discovery and fails closed without a cached discovery", async () => {
    const fetchImpl = createTreeFetch(["geosite/google.mrs", "geosite/google-cn.mrs"]);
    const service = createRuleCatalogService({ fetchImpl, now: () => 1_000, cacheTtlMs: 10_000 });

    const [first, second] = await Promise.all([
      service.getCnRuleCandidateDiscovery({ moduleIds: ["google"], force: true }),
      service.getCnRuleCandidateDiscovery({ moduleIds: ["google"], force: true }),
    ]);
    expect(second).toBe(first);

    const failingFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/geosite/google-cn.list")) return textResponse("missing", 500);
      return createTreeFetch(["geosite/google.mrs", "geosite/google-cn.mrs"])(input);
    }) as unknown as typeof fetch;
    const failingService = createRuleCatalogService({ fetchImpl: failingFetch });
    expect(failingService.getCachedRuleIndex()).toBeNull();

    await expect(failingService.getCnRuleCandidateDiscovery({ moduleIds: ["google"] })).rejects.toBeInstanceOf(
      RuleIndexUnavailableError
    );
    expect(failingService.getCachedRuleIndex()).toEqual(expect.objectContaining({ geosite: ["google", "google-cn"] }));
  });
});

