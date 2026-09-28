import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readJsonResponse: vi.fn(),
  readSourceImportResponse: vi.fn(),
}));

vi.mock("@subboost/ui/product/home/home-surface", () => ({
  HomeSurface: (props: any) => React.createElement("div", props, "home"),
}));
vi.mock("@subboost/ui/product/client-response", () => ({
  readJsonResponse: mocks.readJsonResponse,
  readSourceImportResponse: mocks.readSourceImportResponse,
}));

import Page from "./page";

function adapter() {
  const element = Page() as React.ReactElement<{ adapter: any }>;
  return element.props.adapter;
}

describe("local home page adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  });

  it("calls local APIs and normalizes default response fields", async () => {
    const localAdapter = adapter();

    mocks.readSourceImportResponse.mockResolvedValueOnce({ content: 123, headers: null, parseResult: { nodes: [] } });
    await expect(localAdapter.productApi.sourceImport.importSource({ url: "https://example.test/sub" })).resolves.toEqual({
      content: "",
      headers: {},
      parseResult: { nodes: [] },
    });
    expect(fetch).toHaveBeenCalledWith("/api/source-import", expect.objectContaining({ method: "POST" }));

    mocks.readJsonResponse.mockResolvedValueOnce({ totalRules: "bad" });
    await expect(localAdapter.productApi.rules.getTotalRules()).resolves.toBe(0);

    mocks.readJsonResponse.mockResolvedValueOnce({ totalRules: "bad" });
    await expect(localAdapter.productApi.rules.searchRules({ keyword: "hk", page: 2, size: 5 })).resolves.toEqual({
      items: [],
      totalRules: 0,
      totalMatched: undefined,
      source: undefined,
    });

    mocks.readJsonResponse.mockResolvedValueOnce({});
    await expect(localAdapter.productApi.rules.loadCnCandidateRules({ moduleIds: [], excludedRuleKeys: [] })).resolves.toEqual([]);

    mocks.readJsonResponse.mockResolvedValueOnce({ items: [{ id: "candidate" }] });
    await expect(
      localAdapter.productApi.rules.loadCnCandidateRules({ moduleIds: ["cn"], excludedRuleKeys: ["auto:rule"] })
    ).resolves.toEqual([{ id: "candidate" }]);
    expect((fetch as any).mock.calls.at(-1)[0]).toContain("modules=cn");
    expect((fetch as any).mock.calls.at(-1)[0]).toContain("excluded=auto%3Arule");

    await localAdapter.loadSubscription("space id");
    expect((fetch as any).mock.calls.at(-1)[0]).toBe("/api/subscriptions/space%20id");

    await localAdapter.subscription.saveSubscription({ isEditing: false, subscriptionId: null, payload: { name: "new" } });
    expect((fetch as any).mock.calls.at(-1)[0]).toBe("/api/subscriptions");
    expect((fetch as any).mock.calls.at(-1)[1]).toEqual(expect.objectContaining({ method: "POST" }));

    await localAdapter.subscription.saveSubscription({ isEditing: true, subscriptionId: "sub/1", payload: { name: "edit" } });
    expect((fetch as any).mock.calls.at(-1)[0]).toBe("/api/subscriptions/sub%2F1");
    expect((fetch as any).mock.calls.at(-1)[1]).toEqual(expect.objectContaining({ method: "PUT" }));
  });

  it("waits for a queued Cloudflare source import", async () => {
    const pending = { status: 202, json: async () => ({ jobId: "job 1" }) };
    const complete = { status: 200, ok: true };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(complete));
    mocks.readSourceImportResponse.mockResolvedValueOnce({ content: "proxies: []", headers: {}, parseResult: { nodes: [] } });

    await expect(adapter().productApi.sourceImport.importSource({ url: "https://example.test/sub" })).resolves.toMatchObject({
      content: "proxies: []",
    });
    expect(fetch).toHaveBeenLastCalledWith("/api/source-import?jobId=job%201", { cache: "no-store" });
    expect(mocks.readSourceImportResponse).toHaveBeenCalledWith(complete);
  });

  it("reads a CORS-enabled source in the browser after the Worker receives 403", async () => {
    const pending = new Response(JSON.stringify({ jobId: "job-1" }), { status: 202 });
    const blocked = new Response(JSON.stringify({ error: "HTTP 403" }), { status: 403 });
    const source = new Response("dmxlc3M6Ly8=", { status: 200, headers: { "content-type": "text/plain" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(blocked).mockResolvedValueOnce(source));

    await expect(adapter().productApi.sourceImport.importSource({ url: "https://example.test/sub" })).resolves.toMatchObject({
      content: "dmxlc3M6Ly8=",
      headers: { "content-type": "text/plain" },
    });
    expect(fetch).toHaveBeenLastCalledWith("https://example.test/sub", expect.objectContaining({
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    }));
    expect(mocks.readSourceImportResponse).not.toHaveBeenCalled();
  });

  it("preserves the Worker error when browser CORS access fails", async () => {
    const pending = new Response(JSON.stringify({ jobId: "job-1" }), { status: 202 });
    const blocked = new Response(JSON.stringify({ error: "HTTP 403" }), { status: 403 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(blocked).mockRejectedValueOnce(new TypeError("CORS blocked")));
    mocks.readSourceImportResponse.mockRejectedValueOnce(new Error("HTTP 403"));

    await expect(adapter().productApi.sourceImport.importSource({ url: "https://example.test/sub" })).rejects.toThrow("HTTP 403");
    expect(mocks.readSourceImportResponse).toHaveBeenCalledWith(blocked);
  });

  it("does not bypass a 403 from the import API before a job is queued", async () => {
    const blocked = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(blocked));
    mocks.readSourceImportResponse.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(adapter().productApi.sourceImport.importSource({ url: "https://example.test/sub" })).rejects.toThrow("Forbidden");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-403 import error from the browser", async () => {
    const unavailable = new Response(JSON.stringify({ error: "HTTP 502" }), { status: 502 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(unavailable));
    mocks.readSourceImportResponse.mockRejectedValueOnce(new Error("HTTP 502"));

    await expect(adapter().productApi.sourceImport.importSource({ url: "https://example.test/sub" })).rejects.toThrow("HTTP 502");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
