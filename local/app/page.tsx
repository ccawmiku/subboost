"use client";

import { HomeSurface, type HomeSurfaceAdapter } from "@subboost/ui/product/home/home-surface";
import { readSourceImportResponse } from "@subboost/ui/product/client-response";
import { createRulesProductApi } from "@subboost/ui/product/api-adapter";
import { LOCAL_AUTO_UPDATE_POLICY } from "@local/lib/auto-update-policy";

const MAX_BROWSER_SOURCE_BYTES = 512 * 1024;

async function fetchSourceDirectly(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Browser fallback requires HTTPS.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok || Number(response.headers.get("content-length") || 0) > MAX_BROWSER_SOURCE_BYTES || !response.body) {
      throw new Error("Browser source fetch failed.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BROWSER_SOURCE_BYTES) {
          await reader.cancel();
          throw new Error("Browser source response is too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      content: new TextDecoder().decode(bytes),
      headers: Object.fromEntries(response.headers.entries()),
    };
  } finally {
    clearTimeout(timer);
  }
}

const localHomeAdapter: HomeSurfaceAdapter = {
  editionLabel: "Cloudflare 个人版",
  loginHref: "/login",
  templateUploadHref: "/templates?upload=1",
  productApi: {
    sourceImport: {
      importSource: async (request) => {
        let response = await fetch("/api/source-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        let queued = false;
        for (let attempt = 0; response.status === 202 && attempt < 60; attempt++) {
          queued = true;
          const pending = await response.json() as { jobId?: string };
          if (!pending.jobId) throw new Error("Source import job ID missing.");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          response = await fetch(`/api/source-import?jobId=${encodeURIComponent(pending.jobId)}`, { cache: "no-store" });
        }
        if (response.status === 202) throw new Error("Source import is still processing. Try again shortly.");
        if (queued && response.status === 403) {
          try {
            return await fetchSourceDirectly(request.url);
          } catch {
            // Keep the server's structured 403 when the source disallows browser CORS.
          }
        }
        const data = await readSourceImportResponse(
          response
        );
        return {
          content: typeof data.content === "string" ? data.content : "",
          headers: data.headers || {},
          parseResult: data.parseResult,
        };
      },
    },
    templates: {
      catalogEnabled: false,
      builtinEngagementEnabled: false,
    },
    rules: createRulesProductApi(),
  },
  loadSubscription: (id) => fetch(`/api/subscriptions/${encodeURIComponent(id)}`, { cache: "no-store" }),
  subscription: {
    loginHref: "/login",
    autoUpdateIntervalPolicy: LOCAL_AUTO_UPDATE_POLICY,
    saveSubscription: ({ isEditing, subscriptionId, payload }) => {
      const endpoint =
        isEditing && subscriptionId
          ? `/api/subscriptions/${encodeURIComponent(subscriptionId)}`
          : "/api/subscriptions";
      return fetch(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
  },
};

export default function Page() {
  return <HomeSurface adapter={localHomeAdapter} />;
}
