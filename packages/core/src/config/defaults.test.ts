import { describe, expect, it } from "vitest";
import { SUBBOOST_TEMPLATE_CONFIG_SCHEMA } from "../templates/config-template";
import {
  DEFAULT_BASE_CONFIG_YAML,
  DEFAULT_SUBBOOST_CONFIG,
  buildDefaultBaseConfigPatch,
  buildDefaultSubBoostTemplateConfig,
  buildDefaultUserConfig,
} from "./defaults";

describe("default config builders", () => {
  it("builds user config from the requested template and default runtime knobs", () => {
    const config = buildDefaultUserConfig("minimal");

    expect(config).toMatchObject({
      autoSelectStrategy: "url-test",
      testUrl: DEFAULT_SUBBOOST_CONFIG.testUrl,
      testInterval: DEFAULT_SUBBOOST_CONFIG.testInterval,
      ruleProviderBaseUrl: DEFAULT_SUBBOOST_CONFIG.ruleProviderBaseUrl,
      cnIpNoResolve: true,
      experimentalCnUseCnRuleSet: true,
      dnsYaml: "",
      mixedPort: 7897,
      allowLan: true,
    });
    expect(config.enabledGroups).toContain("select");
    expect(config.enabledRules).toEqual(config.enabledGroups);
    expect(config.customRules).not.toBe(DEFAULT_SUBBOOST_CONFIG.customRules);
    expect(config.ruleOrder).not.toBe(DEFAULT_SUBBOOST_CONFIG.ruleOrder);
  });

  it("builds the base Clash patch with optional overrides", () => {
    const patch = buildDefaultBaseConfigPatch({
      mixedPort: 12345,
      allowLan: false,
    });

    expect(patch).toMatchObject({
      "mixed-port": 12345,
      "allow-lan": false,
      mode: "rule",
      "log-level": "info",
      profile: {
        "store-selected": true,
        "store-fake-ip": false,
      },
      sniffer: {
        enable: true,
        "parse-pure-ip": true,
      },
    });
    expect(patch.dns?.enable).toBe(true);
    expect(patch["geox-url"]?.geoip).toContain("MetaCubeX");

    const defaultPatch = buildDefaultBaseConfigPatch();
    expect(defaultPatch).toMatchObject({
      "mixed-port": DEFAULT_SUBBOOST_CONFIG.mixedPort,
      "allow-lan": DEFAULT_SUBBOOST_CONFIG.allowLan,
    });
  });

  it("builds the full SubBoost template config with empty user customization fields", () => {
    const config = buildDefaultSubBoostTemplateConfig("full");

    expect(config).toMatchObject({
      schema: SUBBOOST_TEMPLATE_CONFIG_SCHEMA,
      template: "full",
      hiddenProxyGroups: [],
      customProxyGroups: [],
      proxyGroupAdvanced: {},
      proxyGroupAdvancedModeEnabled: false,
      customRuleSets: [],
      builtinRuleEdits: {},
      customRules: [],
      ruleOrder: [],
      dialerProxyGroups: [],
      proxyGroupNameOverrides: {},
      mixedPort: DEFAULT_SUBBOOST_CONFIG.mixedPort,
      allowLan: DEFAULT_SUBBOOST_CONFIG.allowLan,
      testUrl: DEFAULT_SUBBOOST_CONFIG.testUrl,
      testInterval: DEFAULT_SUBBOOST_CONFIG.testInterval,
      ruleProviderBaseUrl: DEFAULT_SUBBOOST_CONFIG.ruleProviderBaseUrl,
    });
    expect(config.enabledProxyGroups.length).toBeGreaterThan(0);
  });

  it("keeps the default YAML example aligned with important base defaults", () => {
    expect(DEFAULT_BASE_CONFIG_YAML).toContain(`mixed-port: ${DEFAULT_SUBBOOST_CONFIG.mixedPort}`);
    expect(DEFAULT_BASE_CONFIG_YAML).toContain(`allow-lan: ${DEFAULT_SUBBOOST_CONFIG.allowLan}`);
    expect(DEFAULT_BASE_CONFIG_YAML).toContain("sniffer:");
    expect(DEFAULT_BASE_CONFIG_YAML).toContain("QUIC: {ports: [443, 8443]}");
  });
});
