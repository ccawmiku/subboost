"use client";

import * as React from "react";
import { Button } from "@subboost/ui/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@subboost/ui/components/ui/dialog";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { Input } from "@subboost/ui/components/ui/input";
import { SwitchField } from "@subboost/ui/components/ui/switch-field";
import { useConfigStore } from "@subboost/ui/store/config-store";
import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  type GroupListenerBinding,
  type GroupListenerTarget,
  type LoadBalanceStrategy,
  type ProxyGroupGroupType,
} from "@subboost/core/types/config";
import { ProxyGroupTypeMenu } from "./proxy-group-type-menu";
import { DEFAULT_SUBBOOST_CONFIG } from "@subboost/core/config/defaults";
import {
  isHealthCheckProxyGroupType,
  normalizeGroupTestInterval,
  normalizeGroupTestUrl,
} from "@subboost/core/proxy-group-advanced";
import { useUnappliedInputGuard } from "@subboost/ui/store/ui-store";
import {
  validateGroupListenerPort,
  type GroupListenerConflictState,
} from "./group-listener-settings";

export interface GroupAdvancedSettingsValue {
  testUrl?: string;
  testInterval?: number;
  groupType: ProxyGroupGroupType;
  strategy?: LoadBalanceStrategy;
  listener: { port: number; enabled: boolean; allowLan: boolean } | null;
}

interface GroupAdvancedSettingsDialogProps {
  testUrl?: string;
  testInterval?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  groupType: ProxyGroupGroupType;
  strategy?: LoadBalanceStrategy;
  listenerTarget: GroupListenerTarget;
  listenerBinding?: GroupListenerBinding;
  conflictState: GroupListenerConflictState;
  onSave: (value: GroupAdvancedSettingsValue) => void;
}

/**
 * 策略组统一高级设置弹窗：组类型、负载均衡策略（仅 load-balance）、监听端口。
 * 保存/取消语义：所有修改保存前只存在于本地 state，取消不落任何变更。
 */
export function GroupAdvancedSettingsDialog({
  open,
  onOpenChange,
  groupName,
  groupType,
  strategy,
  testUrl,
  testInterval,
  listenerTarget,
  listenerBinding,
  conflictState,
  onSave,
}: GroupAdvancedSettingsDialogProps) {
  // The draft is rebuilt on every open, so an open dialog may hold edits not yet applied.
  useUnappliedInputGuard(open);
  const rawGlobalTestUrl = useConfigStore((state) => state.testUrl);
  const rawGlobalInterval = useConfigStore((state) => state.testInterval);
  const globalTestUrl = normalizeGroupTestUrl(rawGlobalTestUrl) ?? DEFAULT_SUBBOOST_CONFIG.testUrl;
  const globalInterval = normalizeGroupTestInterval(rawGlobalInterval) ?? DEFAULT_SUBBOOST_CONFIG.testInterval;
  const [draftType, setDraftType] = React.useState<ProxyGroupGroupType>(groupType);
  const [draftStrategy, setDraftStrategy] = React.useState<LoadBalanceStrategy>(
    strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY
  );
  const [listenerOn, setListenerOn] = React.useState(false);
  const [portInput, setPortInput] = React.useState("");
  const [allowLan, setAllowLan] = React.useState(false);
  const [draftTestUrl, setDraftTestUrl] = React.useState(testUrl ?? "");
  const [draftInterval, setDraftInterval] = React.useState(testInterval === undefined ? "" : String(testInterval));
  const needsProbes = isHealthCheckProxyGroupType(draftType);

  // 每次打开时从当前配置重建草稿，丢弃上次未保存的修改
  React.useEffect(() => {
    if (!open) return;
    setDraftType(groupType);
    setDraftTestUrl(testUrl ?? "");
    setDraftInterval(testInterval === undefined ? "" : String(testInterval));
    setDraftStrategy(strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY);
    setListenerOn(Boolean(listenerBinding && listenerBinding.enabled !== false));
    setPortInput(listenerBinding ? String(listenerBinding.port) : "");
    setAllowLan(listenerBinding?.allowLan === true);
  }, [open, groupType, strategy, testUrl, testInterval, listenerBinding]);

  // 开关关闭=暂停（保留配置不生成），端口只需格式合法、无需无冲突（与生成器一致）
  const portCheck = React.useMemo(
    () => validateGroupListenerPort(portInput, conflictState, listenerTarget, { checkConflict: listenerOn }),
    [portInput, conflictState, listenerTarget, listenerOn]
  );
  // 仅当监听开启，或关闭但保留了端口值时才需要端口合法（允许清空端口来彻底移除配置）
  const portRequired = listenerOn || portInput.trim() !== "";
  const portError = portRequired ? portCheck.error : null;
  const trimmedTestUrl = draftTestUrl.trim();
  const normalizedTestUrl = trimmedTestUrl ? normalizeGroupTestUrl(trimmedTestUrl) : undefined;
  const testUrlError = needsProbes && trimmedTestUrl && !normalizedTestUrl
    ? "请输入有效的 HTTP/HTTPS 地址"
    : undefined;
  const trimmedInterval = draftInterval.trim();
  const parsedInterval = trimmedInterval === ""
    ? undefined
    : /^\d+$/.test(trimmedInterval)
      ? normalizeGroupTestInterval(Number(trimmedInterval))
      : undefined;
  const intervalError = needsProbes && trimmedInterval !== "" && parsedInterval === undefined
    ? "请输入大于 0 的整数秒数"
    : undefined;
  const canSave = !portError && !testUrlError && !intervalError;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      groupType: draftType,
      testUrl: needsProbes ? normalizedTestUrl : normalizeGroupTestUrl(testUrl),
      testInterval: needsProbes ? parsedInterval : normalizeGroupTestInterval(testInterval),
      ...(draftType === "load-balance" ? { strategy: draftStrategy } : {}),
      listener: portRequired && portCheck.port !== null
        ? { port: portCheck.port, enabled: listenerOn, allowLan }
        : null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col overflow-hidden w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="break-words pr-6 text-fg">{groupName} · 高级设置</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <FormField label="代理组类型">
            <ProxyGroupTypeMenu
              value={draftType}
              strategy={draftStrategy}
              showStrategyLabel
              onChange={(next) => {
                setDraftType(next.groupType);
                if (next.strategy) setDraftStrategy(next.strategy);
              }}
            />
          </FormField>

          {needsProbes && (
            <div className="space-y-3 rounded-xl border border-ink/10 bg-ink/[0.025] p-3">
              <FormField label="测速地址" description="仅用于当前代理组；留空沿用默认测速地址。" error={testUrlError}>
                <Input
                  value={draftTestUrl}
                  onChange={(event) => setDraftTestUrl(event.target.value)}
                  placeholder={globalTestUrl}
                  className="h-8 text-xs"
                />
              </FormField>
              <FormField
                label="检测间隔（秒）"
                error={intervalError}
                description={
                  intervalError
                    ? `留空沿用全局检测间隔（${globalInterval} 秒）；通过订阅集引入的节点按订阅集自身设置检测。`
                    : parsedInterval !== undefined
                      ? `当前生效：${parsedInterval} 秒（独立设置）；通过订阅集引入的节点按订阅集自身设置检测。`
                      : `当前生效：${globalInterval} 秒（沿用全局）；通过订阅集引入的节点按订阅集自身设置检测。`
                }
              >
                <Input
                  value={draftInterval}
                  onChange={(event) => setDraftInterval(event.target.value)}
                  inputMode="numeric"
                  placeholder={`沿用全局（${globalInterval} 秒）`}
                  className="h-8 text-xs"
                />
              </FormField>
              <div className="flex flex-wrap gap-1">
                {[30, 60, 300, 600].map((seconds) => (
                  <Button
                    key={seconds}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDraftInterval(String(seconds))}
                  >
                    {`${seconds} 秒`}
                  </Button>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraftInterval("")}>
                  沿用全局
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-ink/10 bg-ink/[0.025] p-3">
            <SwitchField
              label="监听端口"
              appearance="plain"
              description="为该策略组打开一个 mixed 入站端口，流量固定走此组"
              checked={listenerOn}
              onCheckedChange={setListenerOn}
              density="compact"
            />

            {(listenerOn || portInput.trim() !== "") && (
              <div className="space-y-3">
                <FormField label="端口" error={portError}>
                  <Input
                    value={portInput}
                    inputMode="numeric"
                    placeholder="例如 7891"
                    className="h-8 border-ink/10 bg-ink/5 text-xs"
                    onChange={(event) => setPortInput(event.target.value)}
                  />
                </FormField>

                <SwitchField
                  label="允许其他设备访问"
                  checked={allowLan}
                  onCheckedChange={setAllowLan}
                  density="compact"
                />
                {allowLan && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] leading-relaxed text-amber-200">
                    开启后监听 0.0.0.0，如果你的端口能从公网访问，任何人都可以使用你的节点。
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs text-fg-65 hover:text-fg"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={!canSave}
            onClick={handleSave}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
