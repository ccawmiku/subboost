import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-group-modules";
import {
  buildCnRuleCandidatesFromSources,
  buildCnRuleVariantIds,
  collectCnCandidateParents,
  normalizeRuleListLines,
  type CnCandidateParent,
  type CnRuleCandidate,
  type CnRuleCandidateSource,
} from "@subboost/core/rules/cn-candidate-utils";
import { ALL_RULES } from "@subboost/core/rules-database";
import {
  DEFAULT_RULE_PROVIDER_BASE_URL,
  RULE_CATEGORIES,
  RULE_PROVIDER_CONFIG,
  type RuleSetInfo,
} from "@subboost/core/rules/metadata";
import {
  RuleIndexUnavailableError,
  type CnRuleCandidateDiscovery,
  type CnRuleCandidateQuery,
  type CnRuleCandidateResponse,
  type GitTreeEntry,
  type GitTreeResponse,
  type RemoteRuleIndex,
  type RemoteRuleType,
  type RuleCatalogDiff,
  type RuleCatalogMissingRule,
  type RuleCatalogServiceOptions,
  type RuleIndexRefreshResult,
  type RuleSearchResult,
  type RuleSearchType,
  type VerifiedRuleSetInfo,
} from "./types";

export * from "./types";

const DEFAULT_USER_AGENT = "SubBoost";
const REMOTE_ONLY_SAMPLE_SIZE = 50;
const GEOSITE_PATH_PREFIX = "geosite/";

function getNow(options: RuleCatalogServiceOptions): number {
  return options.now?.() ?? Date.now();
}

function getCacheTtlMs(options: RuleCatalogServiceOptions): number {
  return options.cacheTtlMs ?? RULE_PROVIDER_CONFIG.cacheTtlMs;
}

function toExpiresAt(fetchedAt: number, options: RuleCatalogServiceOptions): number {
  return fetchedAt + getCacheTtlMs(options);
}

function normalizeRuleName(value: string): string {
  return value.trim();
}

function normalizeRulePath(path: string): string | null {
  const match = path.match(/(?:^|\/)(geosite|geoip)\/([^/]+)\.mrs$/i);
  if (!match) return null;
  return `${match[1].toLowerCase()}/${match[2]}.mrs`;
}

function parseRulePath(path: string): { type: RemoteRuleType; name: string; key: string } | null {
  const normalized = normalizeRulePath(path);
  if (!normalized) return null;
  const [type, file] = normalized.split("/") as [RemoteRuleType, string];
  return {
    type,
    name: file.replace(/\.mrs$/i, ""),
    key: normalized,
  };
}

function buildRuleUrl(key: string): string {
  return `${DEFAULT_RULE_PROVIDER_BASE_URL}/${key}`;
}

function getFeaturedRuleByPath(): Map<string, RuleSetInfo> {
  const map = new Map<string, RuleSetInfo>();
  for (const rule of ALL_RULES) {
    const parsed = parseRulePath(rule.url);
    if (parsed) map.set(parsed.key, rule as RuleSetInfo);
  }
  return map;
}

const featuredRuleByPath = getFeaturedRuleByPath();

function buildVerifiedRule(type: RemoteRuleType, name: string): VerifiedRuleSetInfo {
  const key = `${type}/${name}.mrs`;
  const featured = featuredRuleByPath.get(key);
  if (featured) {
    return {
      ...featured,
      url: buildRuleUrl(key),
      availabilityStatus: "available",
    };
  }

  return {
    id: type === "geoip" ? `${name}-ip` : name,
    name,
    nameZh: name,
    category: "other",
    behavior: type === "geoip" ? "ipcidr" : "domain",
    format: "mrs",
    url: buildRuleUrl(key),
    availabilityStatus: "available",
  };
}

function matchRule(rule: RuleSetInfo, keyword: string): boolean {
  const haystack = `${rule.id} ${rule.name} ${rule.nameZh}`.toLowerCase();
  return haystack.includes(keyword);
}

function buildGitHubHeaders(options: RuleCatalogServiceOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": options.userAgent ?? DEFAULT_USER_AGENT,
  };
  const token = options.getGitHubToken?.();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchGitTree(
  treeSha: string,
  recursive: boolean,
  options: RuleCatalogServiceOptions
): Promise<GitTreeResponse> {
  const { owner, repo } = RULE_PROVIDER_CONFIG.github;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}${recursive ? "?recursive=1" : ""}`;
  const response = await fetchImpl(url, { headers: buildGitHubHeaders(options) });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as GitTreeResponse;
}

async function resolveGeoTreeSha(options: RuleCatalogServiceOptions): Promise<string | null> {
  const root = await fetchGitTree(RULE_PROVIDER_CONFIG.github.ref, false, options);
  const geo = root.tree.find((entry) => entry.type === "tree" && entry.path === RULE_PROVIDER_CONFIG.treePath);
  return geo?.sha ?? null;
}

export function extractRemoteRuleNames(tree: GitTreeEntry[], type: RemoteRuleType): string[] {
  const names = new Set<string>();
  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    const prefixes = [`${RULE_PROVIDER_CONFIG.treePath}/${type}/`, `${type}/`];
    for (const prefix of prefixes) {
      if (!entry.path.startsWith(prefix)) continue;
      const file = entry.path.slice(prefix.length);
      if (!file || file.includes("/") || !/\.mrs$/i.test(file)) continue;
      const name = normalizeRuleName(file.replace(/\.mrs$/i, ""));
      if (name) names.add(name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function isIndexFresh(index: RemoteRuleIndex, now: number): boolean {
  return now < index.expiresAt;
}

function withSource(index: RemoteRuleIndex, source: "remote" | "stale"): RemoteRuleIndex {
  return { ...index, source };
}

function toRuleSet(index: RemoteRuleIndex, type: RemoteRuleType): Set<string> {
  return new Set(index[type]);
}

function hasRemoteRule(index: RemoteRuleIndex, parsed: { type: RemoteRuleType; name: string }): boolean {
  return toRuleSet(index, parsed.type).has(parsed.name);
}

export function buildRuleCatalogDiff(index: RemoteRuleIndex): RuleCatalogDiff {
  const remoteKeys = new Set<string>();
  for (const type of ["geosite", "geoip"] as const) {
    for (const name of index[type]) remoteKeys.add(`${type}/${name}.mrs`);
  }

  const curatedKeys = new Set<string>();
  const curatedIdCounts = new Map<string, number>();
  const missingCuratedRules: RuleCatalogMissingRule[] = [];
  const unknownCategories: Array<{ id: string; category: string }> = [];

  for (const rule of ALL_RULES) {
    curatedIdCounts.set(rule.id, (curatedIdCounts.get(rule.id) ?? 0) + 1);
    if (!Object.prototype.hasOwnProperty.call(RULE_CATEGORIES, rule.category)) {
      unknownCategories.push({ id: rule.id, category: rule.category });
    }

    const parsed = parseRulePath(rule.url);
    if (!parsed) continue;
    curatedKeys.add(parsed.key);
    if (!remoteKeys.has(parsed.key)) {
      missingCuratedRules.push({ id: rule.id, path: parsed.key });
    }
  }

  const missingModuleRuleRefs: RuleCatalogMissingRule[] = [];
  const seenModuleRules = new Set<string>();
  for (const proxyModule of PROXY_GROUP_MODULES) {
    for (const rule of proxyModule.rules) {
      const parsed = parseRulePath(rule.path);
      if (!parsed) continue;
      const key = `${proxyModule.id}:${rule.id}:${parsed.key}`;
      if (seenModuleRules.has(key)) continue;
      seenModuleRules.add(key);
      if (!remoteKeys.has(parsed.key)) {
        missingModuleRuleRefs.push({ id: rule.id, path: parsed.key, owner: proxyModule.id });
      }
    }
  }

  const duplicateCuratedRuleIds = Array.from(curatedIdCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b));

  const remoteOnlySample = Array.from(remoteKeys)
    .filter((key) => !curatedKeys.has(key))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, REMOTE_ONLY_SAMPLE_SIZE);

  return {
    fetchedAt: index.fetchedAt,
    totalRemoteRules: remoteKeys.size,
    totalCuratedRules: curatedKeys.size,
    missingCuratedRules,
    missingModuleRuleRefs,
    duplicateCuratedRuleIds,
    unknownCategories,
    remoteOnlySample,
  };
}

function buildCandidates(index: RemoteRuleIndex, type: RuleSearchType): Array<{ type: RemoteRuleType; name: string }> {
  const candidates: Array<{ type: RemoteRuleType; name: string }> = [];
  if (type === "all" || type === "geosite") {
    for (const name of index.geosite) candidates.push({ type: "geosite", name });
  }
  if (type === "all" || type === "geoip") {
    for (const name of index.geoip) candidates.push({ type: "geoip", name });
  }
  return candidates;
}

function buildCacheKey(parents: CnCandidateParent[]): string {
  return parents
    .map((parent) => `${parent.parentModuleId}:${parent.parentRuleId}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function buildRuleListUrl(ruleId: string): string {
  return `${DEFAULT_RULE_PROVIDER_BASE_URL}/${GEOSITE_PATH_PREFIX}${encodeURIComponent(ruleId)}.list`;
}

function parseModuleIds(value: string | null): string[] {
  const known = new Set(PROXY_GROUP_MODULES.map((module) => module.id));
  const raw = value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : PROXY_GROUP_MODULES.map((module) => module.id);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function parseExcludedRuleKeys(value: string | null): string[] {
  if (!value) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value.split(",")) {
    const key = raw.trim();
    if (!key || !key.includes(":") || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function parseCnRuleCandidateQuery(searchParams: Pick<URLSearchParams, "get">): CnRuleCandidateQuery {
  return {
    moduleIds: parseModuleIds(searchParams.get("modules")),
    excludedRuleKeys: parseExcludedRuleKeys(searchParams.get("excluded")),
    debug: searchParams.get("debug") === "1",
  };
}

export function buildCnRuleCandidateResponse(
  result: CnRuleCandidateDiscovery,
  options: { debug?: boolean } = {}
): CnRuleCandidateResponse {
  return {
    items: result.items,
    source: result.source,
    cache: {
      fetchedAt: result.fetchedAt,
      expiresAt: result.expiresAt,
      ttlMs: RULE_PROVIDER_CONFIG.cacheTtlMs,
    },
    ...(options.debug ? { allItems: result.allItems } : {}),
  };
}

export function buildCnRuleCandidateUnavailableResponse(): CnRuleCandidateResponse {
  return {
    items: [],
    source: "unavailable",
    error: "规则库暂不可用，请稍后重试",
    code: "RULE_INDEX_UNAVAILABLE",
  };
}

function isRuleSearchType(value: string): value is RuleSearchType {
  return value === "all" || value === "geosite" || value === "geoip";
}

export function normalizeRuleSearchType(value: string | null | undefined): RuleSearchType {
  return value && isRuleSearchType(value) ? value : "all";
}

export function createRuleCatalogService(options: RuleCatalogServiceOptions = {}) {
  let cachedIndex: RemoteRuleIndex | null = null;
  let indexInflight: Promise<RemoteRuleIndex> | null = null;
  const discoveryCache = new Map<string, CnRuleCandidateDiscovery>();
  const discoveryInflight = new Map<string, Promise<CnRuleCandidateDiscovery>>();

  async function fetchRemoteRuleIndex(): Promise<RemoteRuleIndex> {
    const geoSha = await resolveGeoTreeSha(options);
    const geoTree = geoSha
      ? await fetchGitTree(geoSha, true, options)
      : await fetchGitTree(RULE_PROVIDER_CONFIG.github.ref, true, options);
    if (geoTree.truncated) {
      throw new Error("GitHub tree response truncated; cannot build rule index reliably");
    }
    const fetchedAt = getNow(options);
    return {
      geosite: extractRemoteRuleNames(geoTree.tree, "geosite"),
      geoip: extractRemoteRuleNames(geoTree.tree, "geoip"),
      fetchedAt,
      expiresAt: toExpiresAt(fetchedAt, options),
      source: "remote",
    };
  }

  async function refreshIndex(force = false): Promise<RemoteRuleIndex> {
    const now = getNow(options);
    if (!force && cachedIndex && isIndexFresh(cachedIndex, now)) return withSource(cachedIndex, "remote");
    if (indexInflight) return indexInflight;

    indexInflight = fetchRemoteRuleIndex()
      .then(async (index) => {
        cachedIndex = index;
        await options.saveIndex?.(index);
        return withSource(index, "remote");
      })
      .finally(() => {
        indexInflight = null;
      });

    return indexInflight;
  }

  async function getRemoteRuleIndex(params: { force?: boolean; allowStale?: boolean; now?: number } = {}) {
    const now = params.now ?? getNow(options);
    if (!cachedIndex && options.loadIndex) cachedIndex = await options.loadIndex();
    if (!params.force && cachedIndex && isIndexFresh(cachedIndex, now)) return withSource(cachedIndex, "remote");
    if (!params.force && cachedIndex && options.serveStaleWithoutRefresh && params.allowStale !== false) return withSource(cachedIndex, "stale");
    if (!params.force && options.serveCachedOnly) throw new RuleIndexUnavailableError();

    try {
      return await refreshIndex(params.force ?? false);
    } catch (error) {
      if (params.allowStale !== false && cachedIndex) {
        options.logger?.warn?.("Using stale rule index after refresh failed", error);
        return withSource(cachedIndex, "stale");
      }
      throw new RuleIndexUnavailableError(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshRuleIndex(params: { force?: boolean } = {}): Promise<RuleIndexRefreshResult> {
    const now = getNow(options);
    if (!cachedIndex && options.loadIndex) cachedIndex = await options.loadIndex();
    if (!params.force && cachedIndex && isIndexFresh(cachedIndex, now)) {
      return { status: "skipped", index: withSource(cachedIndex, "remote"), diff: buildRuleCatalogDiff(cachedIndex) };
    }

    try {
      const index = await refreshIndex(params.force ?? false);
      return { status: "refreshed", index, diff: buildRuleCatalogDiff(index) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (cachedIndex) {
        const stale = withSource(cachedIndex, "stale");
        return { status: "stale", index: stale, diff: buildRuleCatalogDiff(stale), error: message };
      }
      return { status: "unavailable", error: message };
    }
  }

  async function searchRules(params: {
    keyword: string;
    type?: RuleSearchType;
    page: number;
    size: number;
    allowStale?: boolean;
  }): Promise<RuleSearchResult> {
    const keyword = params.keyword.trim().toLowerCase();
    const type = params.type ?? "all";
    const page = Math.max(1, Math.floor(params.page));
    const size = Math.max(1, Math.floor(params.size));
    const index = await getRemoteRuleIndex({ allowStale: params.allowStale });
    const totalRules = index.geosite.length + index.geoip.length;

    if (!keyword) {
      return {
        items: [],
        keyword: params.keyword,
        type,
        page,
        size,
        totalMatched: 0,
        totalRules,
        fetchedAt: index.fetchedAt,
        expiresAt: index.expiresAt,
        source: index.source,
      };
    }

    const matched: VerifiedRuleSetInfo[] = [];
    for (const candidate of buildCandidates(index, type)) {
      const rule = buildVerifiedRule(candidate.type, candidate.name);
      if (matchRule(rule, keyword)) matched.push(rule);
    }

    const start = (page - 1) * size;
    return {
      items: matched.slice(start, start + size),
      keyword: params.keyword,
      type,
      page,
      size,
      totalMatched: matched.length,
      totalRules,
      fetchedAt: index.fetchedAt,
      expiresAt: index.expiresAt,
      source: index.source,
    };
  }

  async function fetchRuleList(ruleId: string): Promise<string[]> {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const response = await fetchImpl(buildRuleListUrl(ruleId), {
      headers: {
        Accept: "text/plain,*/*",
        "User-Agent": options.userAgent ?? DEFAULT_USER_AGENT,
      },
    });
    if (!response.ok) {
      throw new Error(`Rule list ${ruleId} returned ${response.status}`);
    }
    return normalizeRuleListLines((await response.text()).split(/\r?\n/));
  }

  async function fetchCnDiscovery(parents: CnCandidateParent[]): Promise<CnRuleCandidateDiscovery> {
    const now = getNow(options);
    if (parents.length === 0) {
      return {
        items: [],
        allItems: [],
        parents: [],
        fetchedAt: now,
        expiresAt: toExpiresAt(now, options),
        source: "remote",
      };
    }

    const index = await getRemoteRuleIndex({ allowStale: true });
    const geositeNames = toRuleSet(index, "geosite");
    const sourcesToFetch: Array<Omit<CnRuleCandidateSource, "lines">> = [];
    const seen = new Set<string>();

    for (const parent of parents) {
      for (const variant of buildCnRuleVariantIds(parent.parentRuleId)) {
        if (!geositeNames.has(variant.id)) continue;
        const key = `${parent.parentModuleId}:${parent.parentRuleId}:${variant.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        sourcesToFetch.push({
          ...parent,
          id: variant.id,
          variantKind: variant.variantKind,
        });
      }
    }

    const [geolocationCnLines, fetchedSources] = await Promise.all([
      geositeNames.has("geolocation-cn") ? fetchRuleList("geolocation-cn") : Promise.resolve([]),
      Promise.all(
        sourcesToFetch.map(async (source) => ({
          ...source,
          lines: await fetchRuleList(source.id),
        }))
      ),
    ]);
    const allItems = buildCnRuleCandidatesFromSources(fetchedSources, geolocationCnLines);
    const fetchedAt = getNow(options);
    return {
      items: allItems.filter((item) => item.actionable),
      allItems,
      parents,
      fetchedAt,
      expiresAt: toExpiresAt(fetchedAt, options),
      source: index.source,
    };
  }

  async function getCnRuleCandidateDiscovery(params: {
    moduleIds: string[];
    excludedRuleKeys?: string[];
    force?: boolean;
    now?: number;
  }): Promise<CnRuleCandidateDiscovery> {
    const parents = collectCnCandidateParents(params.moduleIds, {
      excludedRuleKeys: params.excludedRuleKeys,
      defaultToAll: true,
    });
    const cacheKey = buildCacheKey(parents);
    const now = params.now ?? getNow(options);
    if (!discoveryCache.has(cacheKey) && options.loadDiscovery) {
      const persisted = await options.loadDiscovery(cacheKey);
      if (persisted) discoveryCache.set(cacheKey, persisted);
    }
    if (!params.force) {
      const cached = discoveryCache.get(cacheKey);
      if (cached && now < cached.expiresAt) return cached;
      if (cached && options.serveStaleWithoutRefresh) return { ...cached, source: "stale" };
    }
    if (!params.force && options.serveCachedOnly) throw new RuleIndexUnavailableError();

    const existing = discoveryInflight.get(cacheKey);
    if (existing) return existing;

    const next = fetchCnDiscovery(parents)
      .then(async (result) => {
        discoveryCache.set(cacheKey, result);
        await options.saveDiscovery?.(cacheKey, result);
        return result;
      })
      .catch((error) => {
        const cached = discoveryCache.get(cacheKey);
        if (cached) return { ...cached, source: "stale" as const };
        throw new RuleIndexUnavailableError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        discoveryInflight.delete(cacheKey);
      });

    discoveryInflight.set(cacheKey, next);
    return next;
  }

  function getCachedRuleIndex(): RemoteRuleIndex | null {
    if (!cachedIndex) return null;
    return withSource(cachedIndex, isIndexFresh(cachedIndex, getNow(options)) ? "remote" : "stale");
  }

  return {
    getRemoteRuleIndex,
    refreshRuleIndex,
    searchRules,
    getCnRuleCandidateDiscovery,
    getCachedRuleIndex,
    buildRuleCatalogDiff,
    hasRemoteRule,
  };
}

const defaultRuleCatalogService = createRuleCatalogService();

export const getRemoteRuleIndex = defaultRuleCatalogService.getRemoteRuleIndex;
export const refreshRuleIndex = defaultRuleCatalogService.refreshRuleIndex;
export const searchRules = defaultRuleCatalogService.searchRules;
export const getCnRuleCandidateDiscovery = defaultRuleCatalogService.getCnRuleCandidateDiscovery;
export const getCachedRuleIndex = defaultRuleCatalogService.getCachedRuleIndex;
