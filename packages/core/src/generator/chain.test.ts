import { describe, expect, it } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";
import type { DialerProxyGroup } from "@subboost/core/types/template-config";
import {
  applyDialerProxy,
  generateDialerProxyGroups,
  getDialerRelayNodes,
  getDialerTargetNodes,
  validateDialerConfig,
} from "./chain";

function node(name: string): ParsedNode {
  return {
    name,
    type: "ss",
    server: `${name.toLowerCase().replace(/\s+/g, "-")}.example.com`,
    port: 8388,
    cipher: "aes-128-gcm",
    password: "secret",
  } as ParsedNode;
}

function dialerGroup(patch: Partial<DialerProxyGroup> = {}): DialerProxyGroup {
  return {
    id: "us-relay",
    name: "US Relay",
    type: "select",
    relayNodes: ["Relay A"],
    targetNodes: ["Target A"],
    ...patch,
  };
}

describe("dialer proxy chain helpers", () => {
  it("generates typed dialer groups with shared proxy group fields", () => {
    expect(
      generateDialerProxyGroups(
        [
          dialerGroup(),
          dialerGroup({
            id: "auto-relay",
            name: "Auto Relay",
            type: "url-test",
            relayNodes: ["Relay B"],
          }),
          dialerGroup({
            id: "fallback-relay",
            name: "Fallback Relay",
            type: "fallback",
            relayNodes: ["Relay C"],
          }),
          dialerGroup({
            id: "balance-relay",
            name: "Balance Relay",
            type: "load-balance",
            strategy: "round-robin",
            relayNodes: ["Relay D"],
          }),
          dialerGroup({
            id: "direct-relay",
            name: "Direct Relay",
            type: "direct-first",
            relayNodes: ["DIRECT", "Relay E"],
          }),
          dialerGroup({
            id: "reject-relay",
            name: "Reject Relay",
            type: "reject-first",
            relayNodes: ["Relay F"],
          }),
          dialerGroup({
            id: "direct-empty",
            name: "Direct Empty",
            type: "direct-first",
            relayNodes: [],
          }),
          dialerGroup({ id: "empty", name: "Empty", relayNodes: [] }),
        ],
        "https://probe.example.com/204",
        120,
        ["provider-a", "provider-b"]
      )
    ).toEqual([
      {
        name: "US Relay",
        type: "select",
        proxies: ["Relay A"],
        use: ["provider-a", "provider-b"],
      },
      {
        name: "Auto Relay",
        type: "url-test",
        proxies: ["Relay B"],
        use: ["provider-a", "provider-b"],
        url: "https://probe.example.com/204",
        interval: 120,
        lazy: true,
      },
      {
        name: "Fallback Relay",
        type: "fallback",
        proxies: ["Relay C"],
        use: ["provider-a", "provider-b"],
        url: "https://probe.example.com/204",
        interval: 120,
      },
      {
        name: "Balance Relay",
        type: "load-balance",
        proxies: ["Relay D"],
        use: ["provider-a", "provider-b"],
        url: "https://probe.example.com/204",
        interval: 120,
        strategy: "round-robin",
      },
      {
        name: "Direct Relay",
        type: "select",
        proxies: ["DIRECT", "Relay E"],
        use: ["provider-a", "provider-b"],
      },
      {
        name: "Reject Relay",
        type: "select",
        proxies: ["REJECT", "Relay F"],
        use: ["provider-a", "provider-b"],
      },
      {
        name: "Direct Empty",
        type: "select",
        proxies: ["DIRECT"],
        use: ["provider-a", "provider-b"],
      },
    ]);
  });

  it("applies the first matching dialer group to target nodes", () => {
    const nodes = [node("Relay A"), node("Target A"), node("Target B")];
    const result = applyDialerProxy(nodes, [
      dialerGroup({ name: "First Relay", targetNodes: ["Target A", "Target B"] }),
      dialerGroup({ name: "Second Relay", targetNodes: ["Target A"] }),
    ]);

    expect(result).toEqual([
      nodes[0],
      { ...nodes[1], "dialer-proxy": "First Relay" },
      { ...nodes[2], "dialer-proxy": "First Relay" },
    ]);
  });

  it("collects dialer target and relay names", () => {
    const groups = [
      dialerGroup({ relayNodes: ["Relay A", "DIRECT"], targetNodes: ["Target A"] }),
      dialerGroup({ relayNodes: ["Relay B"], targetNodes: ["Target A", "Target B"] }),
    ];

    expect(Array.from(getDialerTargetNodes(groups)).sort()).toEqual(["Target A", "Target B"]);
    expect(Array.from(getDialerRelayNodes(groups)).sort()).toEqual(["DIRECT", "Relay A", "Relay B"]);
  });

  it("validates missing nodes and relay-target overlap", () => {
    expect(
      validateDialerConfig([node("Relay A"), node("Target A")], dialerGroup({ relayNodes: ["DIRECT"] }))
    ).toEqual({ valid: true, errors: [] });

    expect(
      validateDialerConfig(
        [node("Relay A")],
        dialerGroup({
          relayNodes: ["Relay A", "Missing Relay", "Target A"],
          targetNodes: ["Target A", "Missing Target"],
        })
      )
    ).toEqual({
      valid: false,
      errors: [
        '中转节点 "Missing Relay" 不存在',
        '中转节点 "Target A" 不存在',
        '目标节点 "Target A" 不存在',
        '目标节点 "Missing Target" 不存在',
        '节点 "Target A" 不能同时作为中转节点和目标节点',
      ],
    });
  });

  it("applies per-group testUrl and testInterval overrides across probe-capable dialer groups", () => {
    const groups = generateDialerProxyGroups(
      [
        dialerGroup({
          id: "auto-override",
          name: "Auto Override",
          type: "url-test",
          relayNodes: ["Relay A"],
          testUrl: "https://dialer.example/auto",
          testInterval: 45,
        }),
        dialerGroup({
          id: "fallback-override",
          name: "Fallback Override",
          type: "fallback",
          relayNodes: ["Relay B"],
          testUrl: "https://dialer.example/fallback",
          testInterval: 90,
        }),
        dialerGroup({
          id: "balance-override",
          name: "Balance Override",
          type: "load-balance",
          strategy: "round-robin",
          relayNodes: ["Relay C"],
          testUrl: "https://dialer.example/balance",
          testInterval: 150,
        }),
        dialerGroup({
          id: "invalid-fallback",
          name: "Fallback Defaulted",
          type: "fallback",
          relayNodes: ["Relay D"],
          testUrl: "ftp://invalid.example",
          testInterval: 0,
        }),
        dialerGroup({
          id: "select-ignored",
          name: "Select Ignored",
          type: "select",
          relayNodes: ["Relay E"],
          testUrl: "https://dialer.example/ignored",
          testInterval: 30,
        }),
      ],
      "https://probe.example.com/204",
      300,
    );

    expect(groups).toEqual([
      {
        name: "Auto Override",
        type: "url-test",
        proxies: ["Relay A"],
        url: "https://dialer.example/auto",
        interval: 45,
        lazy: true,
      },
      {
        name: "Fallback Override",
        type: "fallback",
        proxies: ["Relay B"],
        url: "https://dialer.example/fallback",
        interval: 90,
      },
      {
        name: "Balance Override",
        type: "load-balance",
        proxies: ["Relay C"],
        url: "https://dialer.example/balance",
        interval: 150,
        strategy: "round-robin",
      },
      {
        name: "Fallback Defaulted",
        type: "fallback",
        proxies: ["Relay D"],
        url: "https://probe.example.com/204",
        interval: 300,
      },
      {
        name: "Select Ignored",
        type: "select",
        proxies: ["Relay E"],
      },
    ]);
  });

});
