import { describe, expect, it } from "vitest";
import { parseNetch } from "./netch";

function netch(config: Record<string, unknown>): string {
  return `netch://${Buffer.from(JSON.stringify(config), "utf8").toString("base64")}`;
}

describe("parseNetch", () => {
  it("parses SS, SSR, Snell, SOCKS, and HTTP-like Netch nodes", () => {
    expect(
      parseNetch(
        netch({
          Type: "SS",
          Remark: "SS",
          Hostname: "ss.example.com",
          Port: "8388",
          Password: "secret",
          Plugin: "obfs",
          PluginOption: "mode=http;host=cdn.example.com;tfo",
          EnableUDP: "yes",
        })
      )
    ).toMatchObject({
      name: "SS",
      type: "ss",
      cipher: "aes-256-gcm",
      "plugin-opts": { mode: "http", host: "cdn.example.com", tfo: true },
      udp: true,
    });
    expect(
      parseNetch(
        netch({
          Type: "SSR",
          Hostname: "ssr.example.com",
          Port: 8388,
          Password: "secret",
          Protocol: "auth_sha1_v4",
          ProtocolParam: "param",
          OBFS: "tls1.2_ticket_auth",
          OBFSParam: "obfs",
        })
      )
    ).toMatchObject({
      type: "ssr",
      protocol: "auth_sha1_v4",
      "protocol-param": "param",
      obfs: "tls1.2_ticket_auth",
      "obfs-param": "obfs",
    });
    expect(parseNetch(netch({ Type: "Snell", Hostname: "snell.example.com", Port: 443, Password: "psk", OBFS: "tls", Host: "cdn.example.com", SnellVersion: "3" }))).toMatchObject({
      type: "snell",
      version: 3,
      "obfs-opts": { mode: "tls", host: "cdn.example.com" },
    });
    expect(parseNetch(netch({ Type: "Socks", Hostname: "socks.example.com", Port: 1080, Username: "u", Password: "p" }))).toMatchObject({
      type: "socks5",
      username: "u",
      password: "p",
    });
    expect(parseNetch(netch({ Type: "HTTPS", Hostname: "https.example.com", Port: 443, Username: "u" }))).toMatchObject({
      type: "https",
      tls: true,
      username: "u",
    });
  });

  it("parses defaults, boolish common fields, and sparse optional fields", () => {
    expect(
      parseNetch(
        netch({
          Type: "SS",
          Hostname: "ss-default.example.com",
          Port: "8388",
          Password: "secret",
          EncryptMethod: "chacha20-ietf-poly1305",
          Plugin: "custom-plugin",
          PluginOption: "flag;empty=;host=cdn.example.com",
          EnableUDP: 0,
          EnableTFO: "on",
          AllowInsecure: "no",
        })
      )
    ).toMatchObject({
      name: "SS-ss-default.example.com:8388",
      type: "ss",
      cipher: "chacha20-ietf-poly1305",
      plugin: "custom-plugin",
      "plugin-opts": { flag: true, empty: "", host: "cdn.example.com" },
      udp: false,
      tfo: true,
    });
    expect(
      parseNetch(
        netch({
          Type: "HTTP",
          Hostname: "http.example.com",
          Port: "8080",
          Username: "u",
          Password: "p",
          EnableUDP: "maybe",
          EnableTFO: 2,
          AllowInsecure: 1,
        })
      )
    ).toMatchObject({
      name: "HTTP-http.example.com:8080",
      type: "http",
      username: "u",
      password: "p",
      "skip-cert-verify": true,
    });
    expect(parseNetch(netch({ Type: "SOCKS5", Hostname: "socks.example.com", Port: 1080, Password: "p" })))
      .toMatchObject({
        type: "socks5",
        password: "p",
      });
    expect(parseNetch(netch({ Type: "Snell", Hostname: "snell-none.example.com", Port: 443, Password: "psk", OBFS: "none", SnellVersion: "bad" })))
      .toMatchObject({
        type: "snell",
        psk: "psk",
      });
    expect(
      parseNetch(
        netch({
          Type: "SS",
          Hostname: "ss-no-plugin.example.com",
          Port: 8388,
          Password: "secret",
          PluginOption: " ; =bad ; ",
          EnableUDP: 1,
          EnableTFO: " ",
        })
      )
    ).toMatchObject({
      name: "SS-ss-no-plugin.example.com:8388",
      type: "ss",
      udp: true,
    });
    expect(
      parseNetch(netch({ Type: "SSR", Hostname: "ssr-default.example.com", Port: 8388, Password: "secret" }))
    ).toMatchObject({
      name: "SSR-ssr-default.example.com:8388",
      type: "ssr",
      protocol: "origin",
      obfs: "plain",
    });
  });

  it("parses VMess and Trojan transports", () => {
    const vmessWs = parseNetch(
      netch({
        Type: "VMess",
        Remark: "VMess WS",
        Hostname: "vmess.example.com",
        Port: 443,
        UserID: "11111111-1111-4111-8111-111111111111",
        TransferProtocol: "websocket",
        Host: "cdn.example.com",
        Path: "/ws",
        Edge: "edge",
        TLSSecure: 1,
        ServerName: "sni.example.com",
        AllowInsecure: true,
      })
    );
    const vmessHttp = parseNetch(
      netch({
        Type: "VMess",
        Hostname: "vmess-http.example.com",
        Port: 80,
        UserID: "11111111-1111-4111-8111-111111111111",
        TransferProtocol: "tcp",
        FakeType: "http",
        Host: "a.example.com,b.example.com",
        Path: "/a,/b",
      })
    );
    const vmessGrpc = parseNetch(
      netch({
        Type: "VMess",
        Hostname: "vmess-grpc.example.com",
        Port: 443,
        UserID: "11111111-1111-4111-8111-111111111111",
        TransferProtocol: "grpc",
        Path: "/svc",
      })
    );
    const vmessH2 = parseNetch(
      netch({
        Type: "VMess",
        Hostname: "vmess-h2.example.com",
        Port: 443,
        UserID: "11111111-1111-4111-8111-111111111111",
        TransferProtocol: "h2",
        Host: "h2.example.com",
        Path: "/h2",
      })
    );
    const trojan = parseNetch(
      netch({
        Type: "Trojan",
        Hostname: "trojan.example.com",
        Port: 443,
        Password: "secret",
        TransferProtocol: "httpupgrade",
        Host: "cdn.example.com",
        Path: "/trojan",
        ServerName: "trojan-sni.example.com",
      })
    );
    const trojanGrpc = parseNetch(
      netch({
        Type: "Trojan",
        Hostname: "trojan-grpc.example.com",
        Port: 443,
        Password: "secret",
        TransferProtocol: "grpc",
        Path: "/svc",
      })
    );
    const trojanTcp = parseNetch(
      netch({
        Type: "Trojan",
        Hostname: "trojan-tcp.example.com",
        Port: 443,
        Password: "secret",
        TransferProtocol: "none",
      })
    );

    expect(vmessWs).toMatchObject({
      name: "VMess WS",
      type: "vmess",
      tls: true,
      servername: "sni.example.com",
      "skip-cert-verify": true,
      network: "ws",
      "ws-opts": {
        path: "/ws",
        headers: {
          Host: "cdn.example.com",
          Edge: "edge",
        },
      },
    });
    expect(vmessHttp).toMatchObject({
      network: "http",
      "http-opts": {
        method: "GET",
        path: ["/a", "/b"],
        headers: { Host: ["a.example.com", "b.example.com"] },
      },
    });
    expect(vmessGrpc).toMatchObject({
      network: "grpc",
      "grpc-opts": { "grpc-service-name": "svc" },
    });
    expect(vmessH2).toMatchObject({
      network: "h2",
      "h2-opts": {
        host: ["h2.example.com"],
        path: "/h2",
      },
    });
    expect(trojan).toMatchObject({
      type: "trojan",
      sni: "trojan-sni.example.com",
      network: "ws",
      "ws-opts": {
        path: "/trojan",
        headers: { Host: "cdn.example.com" },
        "v2ray-http-upgrade": true,
      },
    });
    expect(trojanGrpc).toMatchObject({
      network: "grpc",
      "grpc-opts": { "grpc-service-name": "svc" },
    });
    expect(trojanTcp).toMatchObject({
      network: "tcp",
      sni: "trojan-tcp.example.com",
    });
    expect(
      parseNetch(
        netch({
          Type: "VMess",
          Hostname: "vmess-h2-no-host.example.com",
          Port: 443,
          UserID: "11111111-1111-4111-8111-111111111111",
          TransferProtocol: "h2",
        })
      )
    ).toMatchObject({
      network: "h2",
      "h2-opts": { path: "/" },
    });
    expect(
      parseNetch(
        netch({
          Type: "VMess",
          Hostname: "vmess-http-no-host.example.com",
          Port: 80,
          UserID: "11111111-1111-4111-8111-111111111111",
          TransferProtocol: "http",
          Path: " ,/only",
        })
      )
    ).toMatchObject({
      network: "http",
      "http-opts": {
        path: ["/only"],
      },
    });
  });

  it("parses additional VMess and Trojan transport variants", () => {
    expect(
      parseNetch(
        netch({
          Type: "VMess",
          Hostname: "vmess-tcp.example.com",
          Port: 443,
          UserID: "11111111-1111-4111-8111-111111111111",
          TransferProtocol: "none",
          TLSSecure: "false",
        })
      )
    ).toMatchObject({
      type: "vmess",
      network: "tcp",
      tls: false,
    });
    expect(
      parseNetch(
        netch({
          Type: "VMess",
          Hostname: "vmess-ws-empty.example.com",
          Port: 443,
          UserID: "11111111-1111-4111-8111-111111111111",
          TransferProtocol: "ws",
        })
      )
    ).toMatchObject({
      network: "ws",
      "ws-opts": { path: "/" },
    });
    expect(
      parseNetch(
        netch({
          Type: "Trojan",
          Hostname: "trojan-ws.example.com",
          Port: 443,
          Password: "secret",
          TransferProtocol: "websocket",
          AllowInsecure: "true",
        })
      )
    ).toMatchObject({
      type: "trojan",
      network: "ws",
      "skip-cert-verify": true,
      "ws-opts": { path: "/" },
    });
    expect(
      parseNetch(netch({ Type: "Snell", Hostname: "snell-http.example.com", Port: 443, Password: "psk", OBFS: "http" }))
    ).toMatchObject({
      type: "snell",
      "obfs-opts": { mode: "http" },
    });
    expect(parseNetch(netch({ Type: "Socks", Hostname: "socks-bare.example.com", Port: 1080 }))).toMatchObject({
      type: "socks5",
    });
    expect(parseNetch(netch({ Type: "HTTPS", Hostname: "https-pass.example.com", Port: 443, Password: "p" }))).toMatchObject({
      type: "https",
      password: "p",
      tls: true,
    });
  });

  it("keeps Netch validation errors explicit", () => {
    expect(() => parseNetch("ss://bad")).toThrow("无效的 Netch 链接");
    expect(() => parseNetch("netch://")).toThrow("无效的 Netch 链接");
    expect(() => parseNetch(`netch://${Buffer.from("not json").toString("base64")}`)).toThrow("无效的 Netch JSON 格式");
    expect(() => parseNetch(netch({ Type: "SS", Hostname: "ss.example.com", Port: 8388 }))).toThrow("Netch SS 缺少 password");
    expect(() => parseNetch(netch({ Type: "SSR", Hostname: "ssr.example.com", Port: 8388 }))).toThrow("Netch SSR 缺少 password");
    expect(() => parseNetch(netch({ Type: "VMess", Hostname: "vmess.example.com", Port: 443 }))).toThrow("Netch VMess 缺少 uuid");
    expect(() => parseNetch(netch({ Type: "Trojan", Hostname: "trojan.example.com", Port: 443 }))).toThrow("Netch Trojan 缺少 password");
    expect(() =>
      parseNetch(
        netch({
          Type: "VMess",
          Hostname: "vmess.example.com",
          Port: 443,
          UserID: "11111111-1111-4111-8111-111111111111",
          TransferProtocol: "kcp",
        })
      )
    ).toThrow("不支持的 Netch VMess 传输层");
    expect(() => parseNetch(netch({ Type: "Trojan", Hostname: "trojan.example.com", Port: 443, Password: "secret", TLSSecure: false }))).toThrow("Netch Trojan 必须启用 TLS");
    expect(() =>
      parseNetch(
        netch({
          Type: "Trojan",
          Hostname: "trojan.example.com",
          Port: 443,
          Password: "secret",
          TransferProtocol: "h2",
        })
      )
    ).toThrow("不支持的 Netch Trojan 传输层");
    expect(() => parseNetch(netch({ Type: "Snell", Hostname: "snell.example.com", Port: 443 }))).toThrow(
      "Netch Snell 缺少 psk/password"
    );
    expect(() => parseNetch(netch({ Type: "HTTP", Hostname: "", Port: 443 }))).toThrow(
      "Netch 配置缺少 server/port 或端口无效"
    );
    expect(() => parseNetch(netch({ Type: "HTTP", Hostname: "http.example.com", Port: "bad" }))).toThrow(
      "Netch 配置缺少 server/port 或端口无效"
    );
    expect(() => parseNetch(netch({ Type: "", Hostname: "empty.example.com", Port: 443 }))).toThrow(
      "不支持的 Netch 类型: (empty)"
    );
    expect(() => parseNetch(netch({ Type: "Unknown", Hostname: "unknown.example.com", Port: 443 }))).toThrow("不支持的 Netch 类型");
  });
});
