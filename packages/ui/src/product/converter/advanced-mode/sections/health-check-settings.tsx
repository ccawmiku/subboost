"use client";

import * as React from "react";
import { DEFAULT_SUBBOOST_CONFIG } from "@subboost/core/config/defaults";
import { normalizeGroupTestInterval } from "@subboost/core/proxy-group-advanced";
import { Button } from "@subboost/ui/components/ui/button";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { Input } from "@subboost/ui/components/ui/input";
import { SwitchField } from "@subboost/ui/components/ui/switch-field";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { useUnappliedInputGuard } from "@subboost/ui/store/ui-store";

export function HealthCheckSettings() {
  const { testInterval, setTestInterval, sharedHealthChecks, setSharedHealthChecks } = useConfigStore();
  const effectiveInterval = normalizeGroupTestInterval(testInterval) ?? DEFAULT_SUBBOOST_CONFIG.testInterval;
  const [draft, setDraft] = React.useState(String(effectiveInterval));
  React.useEffect(() => setDraft(String(effectiveInterval)), [effectiveInterval]);

  const trimmed = draft.trim();
  const parsed = /^\d+$/.test(trimmed) ? normalizeGroupTestInterval(Number(trimmed)) : undefined;
  const valid = parsed !== undefined;
  const dirty = valid ? parsed !== effectiveInterval : trimmed !== String(effectiveInterval);
  useUnappliedInputGuard(dirty);

  const commit = () => {
    if (parsed !== undefined && parsed !== effectiveInterval) setTestInterval(parsed);
  };

  return (
    <div className="space-y-3 rounded-xl border border-ink/10 p-3">
      <FormField
        label="全局检测间隔（秒）"
        description="未单独设置间隔的自动测速、故障转移、负载均衡代理组（含中转组）与订阅集沿用此值。"
        error={valid ? undefined : "请输入大于 0 的整数秒数"}
      >
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
            inputMode="numeric"
            className="h-8 text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!valid || parsed === effectiveInterval}
            onClick={commit}
          >
            保存
          </Button>
        </div>
      </FormField>
      <SwitchField
        label="共享健康检查（全局）"
        checked={Boolean(sharedHealthChecks)}
        onCheckedChange={setSharedHealthChecks}
        appearance="plain"
        density="compact"
        description="仅合并成员、测速地址和检测间隔完全相同的自动测速组，减少重复探测。"
      />
    </div>
  );
}
