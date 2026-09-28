import { env } from "cloudflare:workers";
import { createRuleCatalogService, RuleIndexUnavailableError, type CnRuleCandidateDiscovery, type RemoteRuleIndex } from "@subboost/server-core/rules";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-group-modules";
import { buildCnRuleVariantIds, collectCnCandidateParents } from "@subboost/core/rules/cn-candidate-utils";

type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }>; run(): Promise<unknown> };
type Database = { prepare(sql: string): Statement };
type Queue = { send(body: unknown): Promise<void> };
const bindings = env as unknown as { DB: Database; YAML_QUEUE: Queue; GITHUB_TOKEN?: string };
const RAW_LIST_BASE = "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/meta/geo/geosite/";
let listSnapshot: Map<string, string> | null = null;

async function load<T>(key: string): Promise<T | null> {
  const row = await bindings.DB.prepare(`SELECT "value" FROM "RuleCatalogCache" WHERE "key" = ?`).bind(key).first<{ value: string }>();
  if (!row) return null;
  try { return JSON.parse(row.value) as T; } catch { return null; }
}

async function save(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  if (serialized.length > 1_000_000) throw new Error("Rule catalog cache exceeds D1 row budget");
  await bindings.DB.prepare(`
    INSERT INTO "RuleCatalogCache" ("key", "value", "updatedAt") VALUES (?, ?, ?)
    ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = excluded."updatedAt"
  `).bind(key, serialized, new Date().toISOString()).run();
}

const service = createRuleCatalogService({
  fetchImpl: async (input, init) => {
    const url = String(input);
    const match = /\/geosite\/([^/]+)\.list$/.exec(url);
    if (match) {
      const name = decodeURIComponent(match[1]);
      const cached = listSnapshot ? listSnapshot.get(name) ?? null : await load<string>(`list:${name}`);
      return cached === null ? new Response(null, { status: 404 }) : new Response(cached, { status: 200 });
    }
    return fetch(input, init);
  },
  getGitHubToken: () => bindings.GITHUB_TOKEN,
  logger: console,
  loadIndex: () => load<RemoteRuleIndex>("index"),
  saveIndex: (index) => save("index", index),
  loadDiscovery: (key) => load<CnRuleCandidateDiscovery>(`discovery:${key}`),
  saveDiscovery: (key, value) => save(`discovery:${key}`, value),
  serveStaleWithoutRefresh: true,
  serveCachedOnly: true,
});

export const searchRules = service.searchRules;
export async function getCnRuleCandidateDiscovery(params: { moduleIds: string[]; excludedRuleKeys?: string[]; force?: boolean; now?: number }): Promise<CnRuleCandidateDiscovery> {
  try { return await service.getCnRuleCandidateDiscovery(params); }
  catch (error) {
    if (!(error instanceof RuleIndexUnavailableError)) throw error;
    const row = await bindings.DB.prepare(`SELECT "value" FROM "RuleCatalogCache" WHERE "key" LIKE 'discovery:%' ORDER BY "updatedAt" DESC LIMIT 1`)
      .first<{ value: string }>();
    if (!row) throw error;
    const all = JSON.parse(row.value) as CnRuleCandidateDiscovery;
    const parents = collectCnCandidateParents(params.moduleIds, { excludedRuleKeys: params.excludedRuleKeys, defaultToAll: true });
    const enabled = new Set(parents.map((parent) => `${parent.parentModuleId}:${parent.parentRuleId}`));
    const allItems = all.allItems.filter((item) => enabled.has(`${item.parentModuleId}:${item.parentRuleId}`));
    return { ...all, parents, allItems, items: allItems.filter((item) => item.actionable), source: "stale" };
  }
}
export const refreshRuleIndex = service.refreshRuleIndex;

export async function enqueueRuleCatalogRefresh(): Promise<void> {
  const index = await load<RemoteRuleIndex>("index");
  const discovery = await bindings.DB.prepare(`SELECT "key" FROM "RuleCatalogCache" WHERE "key" LIKE 'discovery:%' LIMIT 1`).first<{ key: string }>();
  if (index && index.expiresAt > Date.now() && discovery) return;
  const now = new Date().toISOString();
  const olderThan = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const claimed = await bindings.DB.prepare(`
    INSERT INTO "RuleCatalogCache" ("key", "value", "updatedAt") VALUES ('refresh-claim', '{}', ?)
    ON CONFLICT("key") DO UPDATE SET "updatedAt" = excluded."updatedAt"
    WHERE "RuleCatalogCache"."updatedAt" < ?
    RETURNING "key"
  `).bind(now, olderThan).first<{ key: string }>();
  if (!claimed) return;
  try { await bindings.YAML_QUEUE.send({ kind: "rule-index" }); }
  catch (error) {
    await bindings.DB.prepare(`DELETE FROM "RuleCatalogCache" WHERE "key" = 'refresh-claim' AND "updatedAt" = ?`).bind(now).run();
    throw error;
  }
}

export async function processRuleCatalogRefresh(): Promise<void> {
  const result = await service.refreshRuleIndex();
  if (result.status === "unavailable") throw new Error("Rule index refresh unavailable");
  const available = new Set(result.index.geosite);
  const names = new Set<string>();
  if (available.has("geolocation-cn")) names.add("geolocation-cn");
  for (const parent of collectCnCandidateParents(PROXY_GROUP_MODULES.map((module) => module.id))) {
    for (const variant of buildCnRuleVariantIds(parent.parentRuleId)) {
      if (available.has(variant.id)) names.add(variant.id);
    }
  }
  const staleBefore = Date.now() - 24 * 60 * 60 * 1000;
  const existing = await bindings.DB.prepare(`SELECT "key", "updatedAt" FROM "RuleCatalogCache" WHERE "key" LIKE 'list:%'`)
    .all<{ key: string; updatedAt: string }>();
  const valid = new Set((existing.results ?? []).filter((row) => Date.parse(row.updatedAt) >= staleBefore).map((row) => row.key.slice(5)));
  const missing = [...names].filter((name) => !valid.has(name));
  await save("expected-lists", [...names]);
  if (missing.length === 0) {
    await bindings.YAML_QUEUE.send({ kind: "rule-compose" });
    return;
  }
  for (let start = 0; start < missing.length; start += 15) {
    await bindings.YAML_QUEUE.send({ kind: "rule-list-batch", names: missing.slice(start, start + 15) });
  }
}

export async function processRuleListBatch(message: unknown): Promise<void> {
  const names = (message as { names?: unknown })?.names;
  if (!Array.isArray(names) || names.length > 15) return;
  for (const name of names) {
    if (typeof name !== "string" || !/^[a-z0-9_@-]+$/i.test(name)) continue;
    const response = await fetch(`${RAW_LIST_BASE}${encodeURIComponent(name)}.list`, { headers: { "User-Agent": "SubBoost" } });
    if (!response.ok) throw new Error(`Rule list fetch returned ${response.status}`);
    const length = Number(response.headers.get("content-length") || "0");
    if (length > 500_000) throw new Error("Rule list exceeds cache limit");
    const body = await response.text();
    if (body.length > 500_000) throw new Error("Rule list exceeds cache limit");
    await save(`list:${name}`, body);
  }
  const expected = await load<string[]>("expected-lists") ?? [];
  const rows = await bindings.DB.prepare(`SELECT "key" FROM "RuleCatalogCache" WHERE "key" LIKE 'list:%'`).all<{ key: string }>();
  const present = new Set((rows.results ?? []).map((row) => row.key.slice(5)));
  if (expected.every((name) => present.has(name))) await bindings.YAML_QUEUE.send({ kind: "rule-compose" });
}

export async function processRuleCompose(): Promise<void> {
  const modules = PROXY_GROUP_MODULES.map((module) => module.id);
  const rows = await bindings.DB.prepare(`SELECT "key", "value" FROM "RuleCatalogCache" WHERE "key" LIKE 'list:%'`)
    .all<{ key: string; value: string }>();
  listSnapshot = new Map((rows.results ?? []).map((row) => {
    try { return [row.key.slice(5), JSON.parse(row.value) as string]; } catch { return [row.key.slice(5), ""]; }
  }));
  try {
    await service.getCnRuleCandidateDiscovery({ moduleIds: modules, force: true });
  } finally {
    listSnapshot = null;
  }
}

export async function queueRuleCatalogRefresh(): Promise<void> {
  await bindings.YAML_QUEUE.send({ kind: "rule-index" });
}
