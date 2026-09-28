import handler from "vinext/server/fetch-handler";
import { processYamlGenerationMessage } from "./yaml-delivery";
import { enqueueDueAutoUpdates, processAutoUpdateMessage } from "./auto-update-jobs";
import { processManualRefreshMessage } from "./manual-refresh";
import { processSourceImportMessage } from "./source-import-jobs";
import { fastLogin } from "./fast-login";
import { fastYaml } from "./fast-yaml";
import { enqueueRuleCatalogRefresh, processRuleCatalogRefresh, processRuleListBatch, processRuleCompose, queueRuleCatalogRefresh } from "./rule-catalog";
import { guardSubscriptionMutation } from "./request-guards";
import { changePassword } from "./password-management";
import { usageSnapshot } from "./usage";
import { adminFromSessionToken } from "./auth";

type QueueMessage = { body: unknown; ack(): void; retry(): void };
type QueueBatch = { messages: QueueMessage[] };

const worker = {
  async fetch(request: Request, environment: unknown, context: unknown): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (request.method === "POST" && pathname === "/api/auth/login") return fastLogin(request);
    if (request.method === "POST" && pathname === "/api/auth/password") return changePassword(request);
    if (request.method === "GET" && pathname === "/api/usage") return usageSnapshot(request);
    if (request.method === "POST" && pathname === "/api/rules/refresh-background") {
      const token = /(?:^|;\s*)subboost_local_session=([^;]+)/.exec(request.headers.get("cookie") || "")?.[1] || "";
      if (!await adminFromSessionToken(token)) return new Response(null, { status: 401 });
      await queueRuleCatalogRefresh();
      return new Response(null, { status: 202 });
    }
    const yamlPath = /^\/api\/subscriptions\/([^/]+)\/config\.yaml$/.exec(pathname);
    if (request.method === "GET" && yamlPath) return fastYaml(request, decodeURIComponent(yamlPath[1]));
    const guard = await guardSubscriptionMutation(request);
    if (guard) return guard;
    return handler.fetch(request, environment as never, context as never);
  },
  async queue(batch: QueueBatch): Promise<void> {
    for (const message of batch.messages) {
      try {
        if (message.body && typeof message.body === "object" && (message.body as { kind?: unknown }).kind === "auto-update") {
          await processAutoUpdateMessage(message.body);
        } else if (message.body && typeof message.body === "object" && (message.body as { kind?: unknown }).kind === "manual-refresh") {
          await processManualRefreshMessage(message.body);
        } else if (message.body && typeof message.body === "object" && (message.body as { kind?: unknown }).kind === "source-import") {
          await processSourceImportMessage(message.body);
        } else if (message.body && typeof message.body === "object" && (message.body as { kind?: unknown }).kind === "rule-index") {
          await processRuleCatalogRefresh();
        } else if (message.body && typeof message.body === "object" && (message.body as { kind?: unknown }).kind === "rule-list-batch") {
          await processRuleListBatch(message.body);
        } else if (message.body && typeof message.body === "object" && (message.body as { kind?: unknown }).kind === "rule-compose") {
          await processRuleCompose();
        } else {
          await processYamlGenerationMessage(message.body);
        }
        message.ack();
      } catch (error) {
        console.error("Background job failed", error);
        message.retry();
      }
    }
  },
  async scheduled(): Promise<void> {
    await enqueueDueAutoUpdates();
    await enqueueRuleCatalogRefresh();
  },
};

export default worker;
