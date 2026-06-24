import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { normalizeProxyGroupTargetRef } from "@subboost/core/proxy-group-targets";
import type { CustomProxyGroup, CustomRuleSet, ProxyGroupRuleTarget } from "@subboost/core/types/config";
import {
  buildRuleSetUrlFromPath,
  extractRuleSetPathFromUrl,
  normalizeRuleSetPathInput,
} from "@subboost/core/rules/rule-model";

export type CustomRoutingRuleSetTarget = {
  kind: "module" | "custom";
  id: string;
  name: string;
  value: string;
};

export type CustomRoutingRuleSetItem = {
  key: string;
  source: {
    kind: "custom-rule-set";
    id: string;
  };
  id: string;
  name: string;
  behavior: "domain" | "ipcidr";
  path: string;
  target: CustomRoutingRuleSetTarget;
  noResolve?: boolean;
};

export function getRuleSetTargetValue(target: {
  kind: "module" | "custom";
  id: string;
}): string {
  return `${target.kind}:${target.id}`;
}

export function parseRuleSetTargetValue(
  value: string,
): { kind: "module" | "custom"; id: string } | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("module:")) {
    const id = trimmed.slice("module:".length).trim();
    return id ? { kind: "module", id } : null;
  }
  if (trimmed.startsWith("custom:")) {
    const id = trimmed.slice("custom:".length).trim();
    return id ? { kind: "custom", id } : null;
  }
  return null;
}

export { buildRuleSetUrlFromPath, extractRuleSetPathFromUrl, normalizeRuleSetPathInput };

function resolveRuleSetTarget(
  targetValue: ProxyGroupRuleTarget,
  customProxyGroups: CustomProxyGroup[],
  proxyGroupNameOverrides?: Record<string, string>
): CustomRoutingRuleSetTarget | null {
  const targetRef = normalizeProxyGroupTargetRef(targetValue);
  if (targetRef?.kind === "module") {
    const proxyModule = PROXY_GROUP_MODULES.find((module) => module.id === targetRef.id);
    if (!proxyModule) return null;
    const name = resolveProxyGroupModuleName(proxyModule, proxyGroupNameOverrides?.[proxyModule.id]);
    return {
      kind: "module",
      id: proxyModule.id,
      name,
      value: getRuleSetTargetValue({ kind: "module", id: proxyModule.id }),
    };
  }
  if (targetRef?.kind === "custom") {
    const group = customProxyGroups.find((item) => item.id === targetRef.id);
    if (!group) return null;
    const name = group.name.trim();
    if (!name) return null;
    return {
      kind: "custom",
      id: group.id,
      name,
      value: getRuleSetTargetValue({ kind: "custom", id: group.id }),
    };
  }

  const target = typeof targetValue === "string" ? targetValue.trim() : "";
  if (!target) return null;

  for (const proxyModule of PROXY_GROUP_MODULES) {
    const name = resolveProxyGroupModuleName(proxyModule, proxyGroupNameOverrides?.[proxyModule.id]);
    if (name !== target) continue;
    return {
      kind: "module",
      id: proxyModule.id,
      name,
      value: getRuleSetTargetValue({ kind: "module", id: proxyModule.id }),
    };
  }

  const group = customProxyGroups.find((item) => item.name === target);
  if (group) {
    return {
      kind: "custom",
      id: group.id,
      name: group.name,
      value: getRuleSetTargetValue({ kind: "custom", id: group.id }),
    };
  }

  return null;
}

export function collectCustomRoutingRuleSets({
  customRuleSets,
  customProxyGroups,
  proxyGroupNameOverrides,
}: {
  customRuleSets: CustomRuleSet[];
  customProxyGroups: CustomProxyGroup[];
  proxyGroupNameOverrides?: Record<string, string>;
}): CustomRoutingRuleSetItem[] {
  const items: CustomRoutingRuleSetItem[] = [];

  for (const rule of customRuleSets || []) {
    if (!rule || !rule.id || !rule.path) continue;
    const target = resolveRuleSetTarget(
      rule.target,
      customProxyGroups,
      proxyGroupNameOverrides,
    );
    if (!target) continue;
    items.push({
      key: `custom-rule-set:${rule.id}`,
      source: { kind: "custom-rule-set", id: rule.id },
      id: rule.id,
      name: rule.name || rule.id,
      behavior: rule.behavior,
      path: normalizeRuleSetPathInput(rule.path),
      target,
      noResolve: Boolean(rule.noResolve),
    });
  }

  return items;
}
