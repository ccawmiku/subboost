import { describe, expect, it } from "vitest";
import { buildRefreshSubscriptionSuccessToast } from "./dashboard-refresh-toast";

describe("buildRefreshSubscriptionSuccessToast", () => {
  it("reports a refresh that is still queued", () => {
    expect(buildRefreshSubscriptionSuccessToast({ queued: true })).toEqual({
      title: "刷新已提交，后台仍在处理；稍后查看订阅状态。",
      variant: "warning",
    });
  });
  it("reports subscriptions without URL sources", () => {
    expect(buildRefreshSubscriptionSuccessToast({ attemptedUrlFetch: false })).toEqual({
      title: "刷新完成：当前订阅没有可拉取的 URL 源，本次仅重新解析已保存内容。",
      variant: "success",
    });
  });

  it("reports partial refresh failures", () => {
    expect(
      buildRefreshSubscriptionSuccessToast({
        refreshableSourceCount: 3,
        refreshedSourceCount: 2,
        failedSourceCount: 1,
        nodeCount: 12,
      })
    ).toEqual({
      title: "刷新完成：2 个源已更新，1 个源失败",
      description: "失败源已保留原可用节点。",
      variant: "warning",
    });
  });

  it("derives refreshed source count when older responses omit it", () => {
    expect(
      buildRefreshSubscriptionSuccessToast({
        refreshableSourceCount: 3,
        failedSourceCount: 1,
        nodeCount: 12,
      })
    ).toEqual({
      title: "刷新完成：2 个源已更新，1 个源失败",
      description: "失败源已保留原可用节点。",
      variant: "warning",
    });
  });

  it("reports successful URL refreshes", () => {
    expect(
      buildRefreshSubscriptionSuccessToast({
        refreshableSourceCount: 2,
        refreshedSourceCount: 2,
        failedSourceCount: 0,
        nodeCount: 24,
      })
    ).toEqual({
      title: "刷新完成：2 个源已更新，共 24 个节点",
      variant: "success",
    });
  });
});
