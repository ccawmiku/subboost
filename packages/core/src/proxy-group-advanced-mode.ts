export type ProxyGroupAdvancedModeSource = {
  proxyGroupAdvancedModeEnabled?: unknown;
  customProxyGroups?: unknown;
  proxyGroupAdvanced?: unknown;
};

function hasArrayItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasRecordEntries(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0);
}

export function shouldEnableProxyGroupAdvancedModeByDefault(source: ProxyGroupAdvancedModeSource): boolean {
  return hasArrayItems(source.customProxyGroups) || hasRecordEntries(source.proxyGroupAdvanced);
}

export function resolveProxyGroupAdvancedModeEnabled(source: ProxyGroupAdvancedModeSource): boolean {
  if (typeof source.proxyGroupAdvancedModeEnabled === "boolean") {
    return source.proxyGroupAdvancedModeEnabled;
  }
  return shouldEnableProxyGroupAdvancedModeByDefault(source);
}
