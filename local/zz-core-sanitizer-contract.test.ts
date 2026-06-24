import { describe, expect, it } from "vitest";
import {
  isMihomoSupportedProxyNode,
  isStandardBase64String,
  normalizeMihomoRealityPublicKey,
  normalizeMihomoVlessForGeneration,
  sanitizeMihomoProxyNode,
} from "../packages/core/src/mihomo/proxy-sanitizer";

const REALITY_PUBLIC_KEY = "A".repeat(43);
const WIREGUARD_KEY = `${"A".repeat(43)}=`;
const SSH_FINGERPRINT = `SHA256:${"A".repeat(43)}`;
const PRIVATE_KEY = [
  "-----BEGIN OPENSSH ",
  "PRIVATE ",
  "KEY-----\nabc\n-----END OPENSSH ",
  "PRIVATE ",
  "KEY-----",
].join("");

describe("local shared core sanitizer contract", () => {
  it("normalizes supported optional Mihomo fields and rejects unsafe nodes", () => {
    const vless = sanitizeMihomoProxyNode({
      name: "Reality",
      type: "vless",
      server: "reality.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      fingerprint: "Firefox",
      udp: "yes",
      alpn: "h2,http/1.1",
      encryption: "mlkem768x25519plus.native.1rtt.valid_token",
      network: "xhttp",
      "reality-opts": {
        "public-key": REALITY_PUBLIC_KEY,
        "short-id": "0x7250",
      },
      "xhttp-opts": {
        mode: "packet-up",
        "ech-opts": {
          enable: "yes",
          config: Buffer.from("ech").toString("base64"),
        },
        "download-settings": {
          "reality-opts": {
            "public-key": "",
          },
        },
      },
      "ws-opts": {
        path: "/ws?a=1&ed=1024",
      },
    });
    const https = sanitizeMihomoProxyNode({
      name: "HTTPS",
      type: "https",
      server: "https.example.com",
      port: 443,
      tls: false,
      fingerprint: "sha256 fingerprint = " + "B".repeat(64).match(/.{1,2}/g)?.join(":"),
      "ws-opts": {
        path: "/upgrade?ed=1024",
        "v2ray-http-upgrade": "true",
        "early-data-header-name": "drop",
      },
    });
    const wireguard = sanitizeMihomoProxyNode({
      name: "WG",
      type: "wireguard",
      server: "wg.example.com",
      port: 51820,
      "private-key": WIREGUARD_KEY,
      "public-key": "bad",
      "pre-shared-key": WIREGUARD_KEY,
      reserved: "1,2,3",
    });
    const ssh = sanitizeMihomoProxyNode({
      name: "SSH",
      type: "ssh",
      server: "ssh.example.com",
      port: 22,
      "private-key": PRIVATE_KEY,
      "private-key-passphrase": "secret",
      "host-key": [
        "ssh-ecdsa-nistp256 AAAAC3NzaC1lZDI1NTE5AAAAIA==",
        "ssh-ecdsa-!bad AAAAC3NzaC1lZDI1NTE5AAAAIA==",
        "ssh-rsa bad!token",
      ],
      "server-fingerprint": SSH_FINGERPRINT,
    });
    const invalidXhttp = normalizeMihomoVlessForGeneration({
      name: "XHTTP",
      type: "vless",
      uuid: "11111111-1111-4111-8111-111111111111",
      network: "xhttp",
      "xhttp-opts": {
        mode: "stream-one",
        "download-settings": {
          path: "/download",
        },
      },
    });

    expect(isStandardBase64String(Buffer.from("hello").toString("base64"))).toBe(true);
    expect(isStandardBase64String("not base64")).toBe(false);
    expect(normalizeMihomoRealityPublicKey(REALITY_PUBLIC_KEY)).toBe(REALITY_PUBLIC_KEY);
    expect(normalizeMihomoRealityPublicKey("short")).toBeNull();
    expect(sanitizeMihomoProxyNode("raw" as never)).toBe("raw");
    expect(vless).toMatchObject({
      tls: true,
      udp: true,
      "client-fingerprint": "firefox",
      alpn: ["h2", "http/1.1"],
      encryption: "mlkem768x25519plus.native.1rtt.valid_token",
      "reality-opts": {
        "public-key": REALITY_PUBLIC_KEY,
        "short-id": "7250",
      },
      "xhttp-opts": {
        "download-settings": {
          "reality-opts": {
            "public-key": "",
          },
        },
      },
    });
    expect(https).toMatchObject({
      type: "http",
      tls: false,
      fingerprint: "b".repeat(64),
      "ws-opts": {
        path: "/upgrade",
        "v2ray-http-upgrade": true,
      },
    });
    expect(https["ws-opts"]).not.toHaveProperty("early-data-header-name");
    expect(wireguard).toMatchObject({
      "private-key": WIREGUARD_KEY,
      "pre-shared-key": WIREGUARD_KEY,
      reserved: [1, 2, 3],
    });
    expect(wireguard).not.toHaveProperty("public-key");
    expect(ssh).toMatchObject({
      "private-key": PRIVATE_KEY,
      "host-key": ["ssh-ecdsa-nistp256 AAAAC3NzaC1lZDI1NTE5AAAAIA=="],
      "server-fingerprint": SSH_FINGERPRINT,
    });
    expect(invalidXhttp).toHaveProperty("_subboost-invalid-mihomo-node", true);
    expect(isMihomoSupportedProxyNode({ type: "socks4", name: "old" })).toBe(false);
    expect(isMihomoSupportedProxyNode({ type: "ss", cipher: "", password: "secret" })).toBe(false);
    expect(
      isMihomoSupportedProxyNode({
        type: "ss",
        name: "SS",
        server: "ss.example.com",
        port: 8388,
        cipher: "aes-128-gcm",
        password: "secret",
        plugin: "v2ray-plugin",
        "plugin-opts": { mode: "quic" },
      })
    ).toBe(false);
    expect(
      isMihomoSupportedProxyNode({
        type: "ssh",
        name: "SSH",
        server: "ssh.example.com",
        port: 22,
        password: "secret",
      })
    ).toBe(true);
    expect(
      isMihomoSupportedProxyNode({
        type: "wireguard",
        name: "WG",
        server: "wg.example.com",
        port: 51820,
        "private-key": WIREGUARD_KEY,
        "pre-shared-key": WIREGUARD_KEY,
      })
    ).toBe(true);
  });
});
