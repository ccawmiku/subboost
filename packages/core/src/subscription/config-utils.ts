import type { GenerateOptions } from "@subboost/core/generator";
import { normalizePersistedRuleOrder } from "@subboost/core/generator/rules";
import type { DialerProxyGroup } from "@subboost/core/types/template-config";
import type { ParsedNode } from "@subboost/core/types/node";
import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  isLoadBalanceStrategy,
  type CustomProxyGroup,
  type CustomRule,
  type TemplateType,
  type UserConfig,
} from "@subboost/core/types/config";
import type { FilteredProxyGroup, NodeRegion } from "@subboost/core/types/filtered-proxy-group";
import { stripImportedNodeControlFieldsFromList } from "@subboost/core/subscription/imported-node-controls";
import { buildProxyProvidersFromConfig } from "@subboost/core/subscription/proxy-providers";
import { ensureCustomRuleId } from "@subboost/core/rules/custom-rule-utils";
import { DEFAULT_SUBBOOST_CONFIG } from "@subboost/core/config/defaults";
import { normalizeRuleModelFromConfig } from "@subboost/core/rules/rule-model";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const str = toTrimmedString(item);
    if (str) out.push(str);
  }
  return out;
}

function normalizeTemplate(value: unknown, fallback: TemplateType = "standard"): TemplateType {
  if (value === "minimal" || value === "standard" || value === "full") return value;
  return fallback;
}

function normalizeNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function normalizePort(value: unknown): number | undefined {
  const n = normalizeNonNegativeInt(value);
  if (n === null) return undefined;
  if (n < 1 || n > 65535) return undefined;
  return n;
}

function normalizeCustomRules(value: unknown): CustomRule[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const allowedTypes = new Set<CustomRule["type"]>([
    "DOMAIN",
    "DOMAIN-SUFFIX",
    "DOMAIN-KEYWORD",
    "IP-CIDR",
    "IP-CIDR6",
    "GEOIP",
    "GEOSITE",
    "PROCESS-NAME",
    "DST-PORT",
    "SRC-PORT",
  ]);

  const out: CustomRule[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) continue;
    const type = item.type;
    if (typeof type !== "string" || !allowedTypes.has(type as CustomRule["type"])) continue;

    const ruleValue = toTrimmedString(item.value);
    const target = toTrimmedString(item.target);
    if (!ruleValue || !target) continue;

    const noResolve = typeof item.noResolve === "boolean" ? item.noResolve : undefined;
    out.push(ensureCustomRuleId({
      id: toTrimmedString(item.id) || undefined,
      type: type as CustomRule["type"],
      value: ruleValue,
      target,
      ...(noResolve !== undefined ? { noResolve } : {}),
    }, index));
  }

  return out.length > 0 ? out : undefined;
}

function normalizeProxyGroupNameOverrides(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    const key = typeof k === "string" ? k.trim() : "";
    const val = toTrimmedString(v);
    if (!key || !val) continue;
    out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeListenerPorts(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    const name = typeof k === "string" ? k.trim() : "";
    const port = normalizePort(v);
    if (!name || port === undefined) continue;
    out[name] = port;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeEnabledList(value: unknown): string[] | undefined {
  const list = normalizeStringArray(value);
  return list.length > 0 ? list : undefined;
}

function normalizeDialerProxyGroups(value: unknown): DialerProxyGroup[] {
  if (!Array.isArray(value)) return [];

  const out: DialerProxyGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = toTrimmedString(item.id);
    const name = toTrimmedString(item.name);
    const type = item.type === "select" || item.type === "url-test" ? item.type : null;
    if (!id || !name || !type) continue;

    const enabled = typeof item.enabled === "boolean" ? item.enabled : undefined;
    const relayNodes = normalizeStringArray(item.relayNodes);
    const targetNodes = normalizeStringArray(item.targetNodes);

    out.push({
      id,
      name,
      type,
      relayNodes,
      targetNodes,
      ...(enabled !== undefined ? { enabled } : {}),
    });
  }
  return out;
}

function normalizeCustomProxyGroups(value: unknown): CustomProxyGroup[] {
  if (!Array.isArray(value)) return [];

  const out: CustomProxyGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = toTrimmedString(item.id);
    const name = toTrimmedString(item.name);
    const emoji = toTrimmedString(item.emoji);
    const groupType =
      item.groupType === "select" ||
      item.groupType === "url-test" ||
      item.groupType === "fallback" ||
      item.groupType === "load-balance" ||
      item.groupType === "direct-first" ||
      item.groupType === "reject-first"
        ? item.groupType
        : null;

    if (!id || !name || !emoji || !groupType) continue;

    const strategy =
      groupType === "load-balance"
        ? isLoadBalanceStrategy(item.strategy)
          ? item.strategy
          : DEFAULT_LOAD_BALANCE_STRATEGY
        : undefined;

    out.push({ id, name, emoji, groupType, ...(strategy ? { strategy } : {}) });
  }
  return out;
}

function normalizeNodeRegions(value: unknown): NodeRegion[] {
  const allowed: NodeRegion[] = [
    "us",
    "hk",
    "jp",
    "sg",
    "tw",
    "kr",
    "uk",
    "de",
    "fr",
    "ca",
    "au",
    "other",
  ];
  const allowedSet = new Set<string>(allowed);
  const out: NodeRegion[] = [];
  if (!Array.isArray(value)) return out;
  for (const item of value) {
    const s = toTrimmedString(item);
    if (!s) continue;
    const key = s.toLowerCase();
    if (!allowedSet.has(key)) continue;
    out.push(key as NodeRegion);
  }
  return out;
}

function normalizeFilteredProxyGroups(value: unknown): FilteredProxyGroup[] {
  if (!Array.isArray(value)) return [];
  const out: FilteredProxyGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = toTrimmedString(item.id);
    const name = toTrimmedString(item.name);
    const enabled = typeof item.enabled === "boolean" ? item.enabled : null;
    const groupTypeRaw = toTrimmedString(item.groupType) || "select";
    const groupType =
      groupTypeRaw === "url-test" ||
      groupTypeRaw === "fallback" ||
      groupTypeRaw === "load-balance" ||
      groupTypeRaw === "direct-first" ||
      groupTypeRaw === "reject-first"
        ? groupTypeRaw
        : "select";
    const strategy =
      groupType === "load-balance"
        ? isLoadBalanceStrategy(item.strategy)
          ? item.strategy
          : DEFAULT_LOAD_BALANCE_STRATEGY
        : undefined;
    const sourceIds = normalizeStringArray(item.sourceIds);
    const regions = normalizeNodeRegions(item.regions);
    const includeRegex = toTrimmedString(item.includeRegex);
    const excludeRegex = toTrimmedString(item.excludeRegex);
    const excludedNodeNames = normalizeStringArray(item.excludedNodeNames);

    if (!id || !name || enabled === null) continue;

    out.push({
      id,
      name,
      enabled,
      groupType,
      ...(strategy ? { strategy } : {}),
      sourceIds,
      regions,
      excludedNodeNames,
      ...(includeRegex ? { includeRegex } : {}),
      ...(excludeRegex ? { excludeRegex } : {}),
      ...(toTrimmedString(item.emoji) ? { emoji: toTrimmedString(item.emoji) as string } : {}),
    });
  }
  return out;
}

function normalizeProxyGroupOrder(value: unknown): string[] | undefined {
  const list = normalizeStringArray(value);
  return list.length > 0 ? list : undefined;
}

export function getEffectiveTestOptions(config: Record<string, unknown>): { testUrl: string; testInterval: number } {
  const testUrl =
    typeof config.testUrl === "string" && config.testUrl.trim().startsWith("http")
      ? config.testUrl.trim()
      : DEFAULT_SUBBOOST_CONFIG.testUrl;

  const rawInterval = normalizeNonNegativeInt(config.testInterval);
  const testInterval = rawInterval === null ? DEFAULT_SUBBOOST_CONFIG.testInterval : rawInterval;

  return { testUrl, testInterval };
}

export function buildGenerateOptionsFromConfig(
  config: Record<string, unknown>,
  opts: {
    nodes: ParsedNode[];
    proxyProviders?: Record<string, unknown>;
  }
): GenerateOptions {
  const { testUrl, testInterval } = getEffectiveTestOptions(config);
  const proxyProviders =
    opts.proxyProviders ?? buildProxyProvidersFromConfig(config, { testUrl, testInterval });

  const template = normalizeTemplate(config.template, "standard");

  const enabledGroups = normalizeEnabledList(config.enabledGroups);
  const enabledRules = normalizeEnabledList(config.enabledRules);
  const customRules = normalizeCustomRules(config.customRules);
  const ruleModel = normalizeRuleModelFromConfig(config);
  const customProxyGroups = ruleModel.customProxyGroups.length > 0
    ? ruleModel.customProxyGroups
    : normalizeCustomProxyGroups(config.customProxyGroups);
  const customRuleSets = ruleModel.customRuleSets;
  const builtinRuleEdits = ruleModel.builtinRuleEdits;
  const dnsYaml = typeof config.dnsYaml === "string" ? config.dnsYaml : undefined;
  const ruleProviderBaseUrl =
    typeof config.ruleProviderBaseUrl === "string" && config.ruleProviderBaseUrl.trim().startsWith("http")
      ? config.ruleProviderBaseUrl.trim()
      : undefined;
  const autoSelectStrategy =
    config.autoSelectStrategy === "url-test" ||
    config.autoSelectStrategy === "fallback" ||
    config.autoSelectStrategy === "load-balance"
      ? (config.autoSelectStrategy as UserConfig["autoSelectStrategy"])
      : undefined;
  const cnIpNoResolve = typeof config.cnIpNoResolve === "boolean" ? config.cnIpNoResolve : undefined;
  const experimentalCnUseCnRuleSet =
    typeof config.experimentalCnUseCnRuleSet === "boolean" ? config.experimentalCnUseCnRuleSet : undefined;
  const proxyGroupNameOverrides = normalizeProxyGroupNameOverrides(config.proxyGroupNameOverrides);
  const listenerPorts = normalizeListenerPorts(config.listenerPorts);
  const ruleOrder = normalizePersistedRuleOrder({
    enabledModules: enabledGroups || [],
    customRules: customRules || [],
    customRuleSets,
    builtinRuleEdits,
    proxyGroupNameOverrides,
    experimentalCnUseCnRuleSet,
    cnIpNoResolve,
    ruleOrder: normalizeProxyGroupOrder(config.ruleOrder),
  });

  const userConfig: Partial<UserConfig> = {
    ...(enabledGroups ? { enabledGroups } : {}),
    ...(enabledRules ? { enabledRules } : {}),
    ...(customRules ? { customRules } : {}),
    ...(ruleOrder.length > 0 ? { ruleOrder } : {}),
    ...(dnsYaml !== undefined ? { dnsYaml } : {}),
    ...(ruleProviderBaseUrl ? { ruleProviderBaseUrl } : {}),
    ...(listenerPorts ? { listenerPorts } : {}),
    ...(autoSelectStrategy ? { autoSelectStrategy } : {}),
    testUrl,
    testInterval,
    ...(cnIpNoResolve !== undefined ? { cnIpNoResolve } : {}),
    ...(experimentalCnUseCnRuleSet !== undefined ? { experimentalCnUseCnRuleSet } : {}),
    ...(normalizePort(config.mixedPort) !== undefined ? { mixedPort: normalizePort(config.mixedPort) as number } : {}),
    ...(typeof config.allowLan === "boolean" ? { allowLan: config.allowLan } : {}),
  };

  const dialerProxyGroups = normalizeDialerProxyGroups(config.dialerProxyGroups);
  const filteredProxyGroups = normalizeFilteredProxyGroups(config.filteredProxyGroups);
  const proxyGroupOrder = normalizeProxyGroupOrder(config.proxyGroupOrder);
  const sanitizedNodes = stripImportedNodeControlFieldsFromList(opts.nodes);

  return {
    nodes: sanitizedNodes,
    ...(proxyProviders ? { proxyProviders } : {}),
    template,
    userConfig,
    ...(dialerProxyGroups.length > 0 ? { dialerProxyGroups } : {}),
    ...(customProxyGroups.length > 0 ? { customProxyGroups } : {}),
    ...(customRuleSets.length > 0 ? { customRuleSets } : {}),
    ...(filteredProxyGroups.length > 0 ? { filteredProxyGroups } : {}),
    ...(Object.keys(builtinRuleEdits).length > 0 ? { builtinRuleEdits } : {}),
    ...(proxyGroupNameOverrides ? { proxyGroupNameOverrides } : {}),
    ...(proxyGroupOrder ? { proxyGroupOrder } : {}),
  };
}
