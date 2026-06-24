import { describe, expect, it } from "vitest";
import {
  DINGTALK_USER_AGENT,
  hasDingTalkHost,
  looksLikeShadowrocketStyleVmess,
  looksLikeStandardVmessStyle,
  looksLikeUriStyleVmess,
  normalizeHeaderKey,
  normalizeHttpMethod,
  parseBooleanish,
  parseHeaderRecord,
  parseObfsHeaderHost,
  pickQueryParam,
  pickString,
  splitList,
  stripOuterQuotes,
} from "./vmess-utils";

describe("VMess parser utility helpers", () => {
  it("normalizes primitive values and headers", () => {
    expect(DINGTALK_USER_AGENT).toContain("DingTalk");
    expect(hasDingTalkHost(["api.dingtalk.com"])).toBe(true);
    expect(hasDingTalkHost(undefined)).toBe(false);
    expect(hasDingTalkHost([])).toBe(false);
    expect(hasDingTalkHost(["example.com"])).toBe(false);
    expect(normalizeHttpMethod("post")).toBe("POST");
    expect(normalizeHttpMethod(undefined)).toBe("GET");
    expect(normalizeHttpMethod("   ")).toBe("GET");
    expect(normalizeHttpMethod("bad method")).toBe("GET");
    expect(normalizeHeaderKey("connection")).toBe("Connection");
    expect(normalizeHeaderKey("X-Test")).toBe("X-Test");
    expect(normalizeHeaderKey(" user-agent ")).toBe("User-Agent");
    expect(parseHeaderRecord({ host: "cdn.example.com", empty: "", n: 1, b: false, list: ["a", "", "b"], bad: {} })).toEqual({
      Host: ["cdn.example.com"],
      n: ["1"],
      b: ["false"],
      list: ["a", "b"],
    });
    expect(parseHeaderRecord({ emptyList: ["", 1], nested: {} })).toBeUndefined();
    expect(parseHeaderRecord(null)).toBeUndefined();
    expect(parseHeaderRecord([])).toBeUndefined();
    expect(splitList("a, b,,c")).toEqual(["a", "b", "c"]);
    expect(splitList("")).toBeUndefined();
    expect(pickString(" x ")).toBe("x");
    expect(pickString(1)).toBe("");
    expect(parseBooleanish("yes")).toBe(true);
    expect(parseBooleanish("off")).toBe(false);
    expect(parseBooleanish(true)).toBe(true);
    expect(parseBooleanish(0)).toBe(false);
    expect(parseBooleanish(2)).toBeUndefined();
    expect(parseBooleanish({})).toBeUndefined();
    expect(parseBooleanish(" ")).toBeUndefined();
    expect(parseBooleanish("maybe")).toBeUndefined();
  });

  it("detects VMess link styles and extracts query helpers", () => {
    const shadowrocket = Buffer.from("auto:11111111-1111-4111-8111-111111111111@sr.example.com:443").toString("base64");
    const params = new URLSearchParams("a=&b=value&c=next");

    expect(looksLikeUriStyleVmess("uuid@example.com:443")).toBe(true);
    expect(looksLikeUriStyleVmess("plain")).toBe(false);
    expect(looksLikeStandardVmessStyle("ws+tls:uuid-0@example.com:443")).toBe(true);
    expect(looksLikeStandardVmessStyle("ws+tls:uuid-a@example.com:443")).toBe(false);
    expect(looksLikeShadowrocketStyleVmess(`${shadowrocket}?obfs=websocket`)).toBe(true);
    expect(looksLikeShadowrocketStyleVmess(`${shadowrocket}@bad?obfs=websocket`)).toBe(false);
    expect(looksLikeShadowrocketStyleVmess("?obfs=websocket")).toBe(false);
    expect(looksLikeShadowrocketStyleVmess("not-base64?obfs=websocket")).toBe(false);
    expect(stripOuterQuotes('"quoted"')).toBe("quoted");
    expect(pickQueryParam(params, "a", "b", "c")).toBe("value");
    expect(pickQueryParam(params, "missing", "a")).toBeUndefined();
    expect(parseObfsHeaderHost(undefined)).toBeUndefined();
    expect(parseObfsHeaderHost("Host: cdn.example.com, Path: /ws")).toBe("cdn.example.com");
    expect(parseObfsHeaderHost("cdn.example.com")).toBe("cdn.example.com");
  });
});
