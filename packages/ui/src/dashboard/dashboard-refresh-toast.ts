import type { RefreshSubscriptionResponse } from "./dashboard-types";

type RefreshToastVariant = "success" | "warning";

export type RefreshSubscriptionToast = {
  title: string;
  description?: string;
  variant: RefreshToastVariant;
};

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function buildRefreshSubscriptionSuccessToast(data: RefreshSubscriptionResponse): RefreshSubscriptionToast {
  if (data.queued) {
    return { title: "刷新已提交，后台仍在处理；稍后查看订阅状态。", variant: "warning" };
  }
  const refreshableSourceCount = normalizeCount(data.refreshableSourceCount);
  const failedSourceCount = normalizeCount(data.failedSourceCount);
  const refreshedSourceCount =
    typeof data.refreshedSourceCount === "number"
      ? normalizeCount(data.refreshedSourceCount)
      : Math.max(0, refreshableSourceCount - failedSourceCount);
  const nodeCount = normalizeCount(data.nodeCount);

  if (data.attemptedUrlFetch === false || refreshableSourceCount === 0) {
    return {
      title: "刷新完成：当前订阅没有可拉取的 URL 源，本次仅重新解析已保存内容。",
      variant: "success",
    };
  }

  if (failedSourceCount > 0) {
    return {
      title: `刷新完成：${refreshedSourceCount} 个源已更新，${failedSourceCount} 个源失败`,
      description: "失败源已保留原可用节点。",
      variant: "warning",
    };
  }

  return {
    title: `刷新完成：${refreshedSourceCount} 个源已更新，共 ${nodeCount} 个节点`,
    variant: "success",
  };
}
