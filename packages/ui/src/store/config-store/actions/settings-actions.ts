import type { ConfigActions } from "../definitions";
import { normalizeGroupTestInterval } from "@subboost/core/proxy-group-advanced";
import { parseNodeNameFilterConfig } from "@subboost/core/subscription/node-name-filter";
import type { GetState, SetAndGenerateConfig, SetState } from "../store-types";

type SettingsActions = Pick<
  ConfigActions,
  | "setDnsYaml"
  | "setMixedPort"
  | "setAllowLan"
  | "setTestUrl"
  | "setTestInterval"
  | "setSharedHealthChecks"
  | "setRuleProviderBaseUrl"
  | "setNodeNameFilter"
  | "setProxyGroupAdvancedModeEnabled"
  | "setCnIpNoResolve"
  | "setExperimentalCnUseCnRuleSet"
>;

export function createSettingsActions(
  _set: SetState,
  _get: GetState,
  setAndGenerateConfig: SetAndGenerateConfig
): SettingsActions {
  return {
    setDnsYaml: (yaml: string) => {
      setAndGenerateConfig(() => ({ dnsYaml: yaml }));
    },

    setMixedPort: (port: number) => {
      setAndGenerateConfig(() => ({ mixedPort: port }));
    },

    setAllowLan: (allow: boolean) => {
      setAndGenerateConfig(() => ({ allowLan: allow }));
    },

    setTestUrl: (url: string) => {
      setAndGenerateConfig(() => ({ testUrl: url }));
    },

    setTestInterval: (interval: number) => {
      const normalized = normalizeGroupTestInterval(interval);
      if (normalized === undefined) return;
      setAndGenerateConfig(() => ({ testInterval: normalized }));
    },

    setSharedHealthChecks: (enabled: boolean) => {
      setAndGenerateConfig(() => ({ sharedHealthChecks: enabled === true }));
    },

    setRuleProviderBaseUrl: (url: string) => {
      setAndGenerateConfig(() => ({ ruleProviderBaseUrl: url }));
    },

    setNodeNameFilter: (config) => {
      setAndGenerateConfig(() => ({
        nodeNameFilter: parseNodeNameFilterConfig(config),
      }));
    },

    setProxyGroupAdvancedModeEnabled: (value: boolean) => {
      setAndGenerateConfig(() => ({ proxyGroupAdvancedModeEnabled: Boolean(value) }));
    },

    setCnIpNoResolve: (value: boolean) => {
      setAndGenerateConfig(() => ({ cnIpNoResolve: Boolean(value) }));
    },

    setExperimentalCnUseCnRuleSet: (value: boolean) => {
      setAndGenerateConfig(() => ({ experimentalCnUseCnRuleSet: Boolean(value) }));
    },
  };
}
