"use client";

import * as React from "react";
import { Layers } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { SectionHeader } from "../section-header";
import { HealthCheckSettings } from "./health-check-settings";
import { ProxyGroupsCategories } from "./proxy-groups-categories";

export function ProxyGroupsSection({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { enabledProxyGroups, hiddenProxyGroups } = useConfigStore();
  const hiddenIds = new Set(hiddenProxyGroups);
  const enabledCount = enabledProxyGroups.filter((id) => !hiddenIds.has(id)).length;
  const totalCount = PROXY_GROUP_MODULES.filter((module) => !hiddenIds.has(module.id)).length;

  return (
    <div>
      <SectionHeader
        icon={Layers}
        title="分流代理组"
        isExpanded={isExpanded}
        onToggle={onToggle}
        badge={
          <Badge variant="outline" className="ml-auto border-blue-500/50 bg-blue-500/10 text-blue-300">
            {enabledCount}/{totalCount}
          </Badge>
        }
      />

      {isExpanded && (
        <div className="mt-2 space-y-2 pl-6">
          <HealthCheckSettings />
          <ProxyGroupsCategories />
        </div>
      )}
    </div>
  );
}
