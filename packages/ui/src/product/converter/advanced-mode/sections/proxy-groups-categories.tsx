"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@subboost/ui/components/ui/dropdown-menu";
import { toast } from "@subboost/ui/components/ui/toaster";
import {
  CATEGORY_INFO,
  PROXY_GROUP_MODULES,
} from "@subboost/core/generator/proxy-groups";
import type { HiddenPresetRuleIds } from "@subboost/core/generator/module-rules";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { useConfigStore, type RuleSetDraft } from "@subboost/ui/store/config-store";
import {
  buildManualRuleTargets,
  listCustomRulesForTarget,
} from "./proxy-group-rule-targets";
import { ProxyGroupsCustomGroupsPanel } from "./proxy-groups-custom-groups-panel";
import { ProxyGroupsCustomRoutingRules } from "./proxy-groups-custom-routing-rules";
import { ProxyGroupsModuleCard } from "./proxy-groups-module-card";

export function ProxyGroupsCategories() {
  const {
    ruleProviderBaseUrl,
    cnIpNoResolve,
    setCnIpNoResolve,
    experimentalCnUseCnRuleSet,
    setExperimentalCnUseCnRuleSet,
    enabledProxyGroups,
    hiddenProxyGroups,
    toggleProxyGroup,
    hideProxyGroup,
    restoreHiddenProxyGroup,
    customRuleSets = [],
    builtinRuleEdits = {},
    moduleRuleEditWarningAccepted,
    customRules = [],
    updateCustomRule,
    removeCustomRule,
    addModuleRules,
    removeModuleRule,
    moveModuleRule,
    restoreModuleRule,
    resetModuleRuleTarget,
    acceptModuleRuleEditWarning,
    proxyGroupNameOverrides = {},
    setProxyGroupNameOverride,
    clearProxyGroupNameOverride,
    customProxyGroups = [],
    filteredProxyGroups = [],
    dialerProxyGroups = [],
  } = useConfigStore();

  const [expandedCategories, setExpandedCategories] = React.useState<
    Set<string>
  >(new Set(["core", "service"]));
  const [editingModuleId, setEditingModuleId] = React.useState<string | null>(
    null,
  );
  const [editingModuleName, setEditingModuleName] = React.useState("");
  const [expandedModuleRules, setExpandedModuleRules] = React.useState<
    Set<string>
  >(new Set());
  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleModuleRules = (moduleId: string) => {
    const id = (moduleId || "").trim();
    if (!id) return;
    setExpandedModuleRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resolveModuleDisplayName = React.useCallback(
    (module: (typeof PROXY_GROUP_MODULES)[number]) => {
      return {
        full: resolveProxyGroupModuleName(
          module,
          proxyGroupNameOverrides?.[module.id],
        ),
      };
    },
    [proxyGroupNameOverrides],
  );

  const getAllGroupNamesForUniqCheck = React.useCallback(() => {
    const names: string[] = [];
    for (const m of PROXY_GROUP_MODULES)
      names.push(resolveModuleDisplayName(m).full);
    for (const g of customProxyGroups) names.push(g.name);
    for (const g of filteredProxyGroups) {
      if (!g || !g.enabled) continue;
      const name = typeof g.name === "string" ? g.name.trim() : "";
      if (name) names.push(name);
    }
    for (const g of dialerProxyGroups) {
      const name = g && typeof g.name === "string" ? g.name.trim() : "";
      if (name) names.push(name);
    }
    return names;
  }, [
    customProxyGroups,
    dialerProxyGroups,
    filteredProxyGroups,
    resolveModuleDisplayName,
  ]);

  const modulesByCategory = React.useMemo(() => {
    const hidden = new Set(hiddenProxyGroups);
    const grouped: Record<string, typeof PROXY_GROUP_MODULES> = {};
    for (const proxyMod of PROXY_GROUP_MODULES) {
      if (hidden.has(proxyMod.id)) continue;
      if (!grouped[proxyMod.category]) grouped[proxyMod.category] = [];
      grouped[proxyMod.category].push(proxyMod);
    }
    return grouped;
  }, [hiddenProxyGroups]);
  const targetRuleView = React.useMemo(() => {
    const ruleSetsByTarget: Record<string, RuleSetDraft[]> = {};
    const hiddenPresetRuleIds: HiddenPresetRuleIds = {};
    const moduleNameToId = new Map<string, string>();
    for (const proxyModule of PROXY_GROUP_MODULES) {
      moduleNameToId.set(resolveModuleDisplayName(proxyModule).full, proxyModule.id);
    }

    const pushRuleSetForTarget = (moduleId: string, rule: RuleSetDraft) => {
      ruleSetsByTarget[moduleId] = [...(ruleSetsByTarget[moduleId] || []), rule];
    };
    const hidePresetRule = (moduleId: string, ruleId: string) => {
      const prev = hiddenPresetRuleIds[moduleId] || [];
      if (!prev.includes(ruleId)) hiddenPresetRuleIds[moduleId] = [...prev, ruleId];
    };

    for (const ruleSet of customRuleSets) {
      const moduleId = moduleNameToId.get(ruleSet.target);
      if (!moduleId) continue;
      pushRuleSetForTarget(moduleId, {
        id: ruleSet.id,
        name: ruleSet.name,
        behavior: ruleSet.behavior,
        path: ruleSet.path,
        ...(ruleSet.noResolve ? { noResolve: true } : {}),
      });
    }

    for (const [key, edit] of Object.entries(builtinRuleEdits || {})) {
      const match = key.match(/^module:([^:]+):(.+)$/);
      if (!match) continue;
      const [, sourceModuleId, ruleId] = match;
      const sourceModule = PROXY_GROUP_MODULES.find((module) => module.id === sourceModuleId);
      const sourceRule = sourceModule?.rules?.find((rule) => rule.id === ruleId);
      if (!sourceModule || !sourceRule) continue;
      const defaultTarget = resolveModuleDisplayName(sourceModule).full;

      if (edit.enabled === false) hidePresetRule(sourceModuleId, ruleId);
      if (edit.target && edit.target !== defaultTarget) {
        hidePresetRule(sourceModuleId, ruleId);
        const targetModuleId = moduleNameToId.get(edit.target);
        if (targetModuleId) {
          pushRuleSetForTarget(targetModuleId, {
            id: sourceRule.id,
            name: sourceRule.name,
            behavior: sourceRule.behavior,
            path: sourceRule.path,
            ...(sourceRule.noResolve ? { noResolve: true } : {}),
          });
        }
      }
    }

    return { ruleSetsByTarget, hiddenPresetRuleIds };
  }, [
    builtinRuleEdits,
    customRuleSets,
    resolveModuleDisplayName,
  ]);

  const hiddenModules = React.useMemo(() => {
    const hidden = new Set(hiddenProxyGroups);
    return PROXY_GROUP_MODULES.filter((module) => hidden.has(module.id));
  }, [hiddenProxyGroups]);
  const manualRuleTargets = React.useMemo(
    () =>
      buildManualRuleTargets({
        enabledProxyGroups,
        hiddenProxyGroups,
        customProxyGroups,
        filteredProxyGroups,
        proxyGroupNameOverrides,
      }),
    [customProxyGroups, enabledProxyGroups, filteredProxyGroups, hiddenProxyGroups, proxyGroupNameOverrides],
  );

  const getCategoryStats = (category: string) => {
    if (category === "custom") return `${customProxyGroups.length}`;
    const modules = modulesByCategory[category] || [];
    const enabled = modules.filter((m) =>
      enabledProxyGroups.includes(m.id),
    ).length;
    return `${enabled}/${modules.length}`;
  };

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs text-white/50">规则集 URL</label>
        <div
          className="min-w-0 rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white/65"
          title={ruleProviderBaseUrl}
        >
          <span className="block truncate">{ruleProviderBaseUrl}</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex min-h-7 items-center gap-2">
          <label className="text-xs text-white/50">分流规则组</label>
          {hiddenModules.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-auto inline-flex h-6 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[10px] text-white/60 transition-colors hover:bg-white/10 hover:text-white/85"
                  title="恢复隐藏分组"
                >
                  <RotateCcw className="h-3 w-3" />
                  已隐藏 {hiddenModules.length}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">恢复隐藏分组</DropdownMenuLabel>
                {hiddenModules.map((module) => {
                  const display = resolveModuleDisplayName(module);
                  return (
                    <DropdownMenuItem
                      key={module.id}
                      className="text-xs"
                      onClick={() => {
                        restoreHiddenProxyGroup(module.id);
                        setExpandedCategories((prev) => {
                          const next = new Set(prev);
                          next.add(module.category);
                          return next;
                        });
                      }}
                    >
                      {display.full}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="space-y-2">
          {Object.entries(CATEGORY_INFO)
            .sort(([, a], [, b]) => a.order - b.order)
            .map(([categoryId, categoryInfo]) => {
              const modules = modulesByCategory[categoryId] || [];
              const isCustomCategory = categoryId === "custom";
              if (!isCustomCategory && modules.length === 0) return null;

              return (
                <div
                  key={categoryId}
                  className="border border-white/10 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => toggleCategory(categoryId)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    {expandedCategories.has(categoryId) ? (
                      <ChevronDown className="h-3.5 w-3.5 text-white/50" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-white/50" />
                    )}
                    <span className="text-xs text-white font-medium">
                      {categoryInfo.name}
                    </span>
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {getCategoryStats(categoryId)}
                    </Badge>
                  </button>

                  {expandedCategories.has(categoryId) && (
                    <div className="p-2 space-y-1">
                      {!isCustomCategory ? (
                        modules.map((module) => {
                          const display = resolveModuleDisplayName(module);
                          const isCore = module.category === "core";
                          const isEnabled = enabledProxyGroups.includes(
                            module.id,
                          );
                          const isEditing = editingModuleId === module.id;
                          const extraRules =
                            targetRuleView.ruleSetsByTarget?.[module.id] || [];
                          const manualRules = listCustomRulesForTarget(
                            customRules,
                            display.full,
                          );
                          const isRulesExpanded = expandedModuleRules.has(
                            module.id,
                          );

                          const handleHideModule = async () => {
                            const ok = await confirmDialog(
                              isCore
                                ? {
                                    title: `确认删除「${display.full}」？`,
                                    description: (
                                      <span className="block pt-2">
                                        <span className="block rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 leading-6 text-amber-100/90">
                                          <span className="font-medium text-amber-200">
                                            警告：
                                          </span>
                                          「{display.full}
                                          」属于核心分流组。删除后会从列表隐藏，并从生成配置中移除，可能导致生成的订阅不可用或分流异常。
                                        </span>
                                        <span className="mt-3 block leading-6 text-white/65">
                                          之后可以通过“已隐藏”菜单恢复该分组。
                                        </span>
                                      </span>
                                    ),
                                    cancelText: "保留",
                                    confirmText: "删除",
                                    variant: "warning" as const,
                                  }
                                : {
                                    title: `确认删除「${display.full}」？`,
                                    description:
                                      "删除后会从列表隐藏，并从生成配置中移除；之后可以通过“已隐藏”菜单恢复。",
                                    cancelText: "取消",
                                    confirmText: "删除",
                                    variant: "default" as const,
                                  },
                            );
                            if (!ok) return;
                            hideProxyGroup(module.id);
                            setExpandedModuleRules((prev) => {
                              const next = new Set(prev);
                              next.delete(module.id);
                              return next;
                            });
                          };

                          const commitRename = () => {
                            const raw = editingModuleName.trim();
                            const nextFull = raw
                              ? resolveProxyGroupModuleName(module, raw)
                              : module.name;
                            const currentFull = display.full;

                            if (raw) {
                              const all = new Set(
                                getAllGroupNamesForUniqCheck(),
                              );
                              all.delete(currentFull);
                              if (all.has(nextFull)) {
                                toast({
                                  title: "代理组名称已存在，请换一个名称。",
                                  variant: "warning",
                                });
                                return;
                              }
                            }

                            if (!raw || nextFull === module.name)
                              clearProxyGroupNameOverride(module.id);
                            else setProxyGroupNameOverride(module.id, raw);

                            setEditingModuleId(null);
                            setEditingModuleName("");
                          };

                          const handleToggleEnabled = async () => {
                            if (!isCore || !isEnabled) {
                              toggleProxyGroup(module.id);
                              return;
                            }

                            const ok = await confirmDialog({
                              title: `确认关闭「${display.full}」？`,
                              description: (
                                <span className="block pt-2">
                                  <span className="block rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 leading-6 text-amber-100/90">
                                    <span className="font-medium text-amber-200">
                                      警告：
                                    </span>
                                    「{display.full}
                                    」属于核心分流组。关闭后，生成的订阅可能无法正常使用，或出现分流异常。
                                  </span>
                                  <span className="mt-3 block leading-6 text-white/65">
                                    除非你打算之后手动修改配置文件，否则不建议取消勾选。
                                  </span>
                                </span>
                              ),
                              cancelText: "保持开启",
                              confirmText: "继续取消",
                              variant: "warning",
                            });
                            if (!ok) return;
                            toggleProxyGroup(module.id);
                          };

                          return (
                            <ProxyGroupsModuleCard
                              key={module.id}
                              module={module}
                              display={display}
                              isCore={isCore}
                              isEnabled={isEnabled}
                              onToggleEnabled={handleToggleEnabled}
                              isEditing={isEditing}
                              editingName={editingModuleName}
                              onChangeEditingName={setEditingModuleName}
                              onStartEditing={() => {
                                setEditingModuleId(module.id);
                                setEditingModuleName(display.full);
                              }}
                              onCancelEditing={() => {
                                setEditingModuleId(null);
                                setEditingModuleName("");
                              }}
                              onCommitEditing={commitRename}
                              onHide={handleHideModule}
                              extraRules={extraRules}
                              ruleSetsByTarget={targetRuleView.ruleSetsByTarget}
                              hiddenPresetRuleIds={targetRuleView.hiddenPresetRuleIds}
                              customProxyGroups={customProxyGroups}
                              manualRules={manualRules}
                              manualRuleTargets={manualRuleTargets}
                              enabledProxyGroups={enabledProxyGroups}
                              hiddenProxyGroups={hiddenProxyGroups}
                              proxyGroupNameOverrides={proxyGroupNameOverrides}
                              moduleRuleEditWarningAccepted={
                                moduleRuleEditWarningAccepted
                              }
                              acceptModuleRuleEditWarning={
                                acceptModuleRuleEditWarning
                              }
                              isRulesExpanded={isRulesExpanded}
                              onToggleRulesExpanded={() =>
                                toggleModuleRules(module.id)
                              }
                              onAddRules={(rules) =>
                                addModuleRules(module.id, rules)
                              }
                              onAddRulesToModule={(moduleId, rules) => {
                                addModuleRules(moduleId, rules);
                                if (!enabledProxyGroups.includes(moduleId)) {
                                  toggleProxyGroup(moduleId);
                                }
                              }}
                              onAddRuleToCustomGroup={(groupId, rule) => {
                                addModuleRules(groupId, [rule]);
                              }}
                              onRemoveExtraRule={(ruleId) =>
                                removeModuleRule(module.id, ruleId)
                              }
                              onMoveRule={(ruleId, target) =>
                                moveModuleRule(module.id, ruleId, target)
                              }
                              onMoveManualRule={(ruleId, targetName) =>
                                updateCustomRule(ruleId, { target: targetName })
                              }
                              onRemoveManualRule={removeCustomRule}
                              onRestoreRule={(ruleId) =>
                                restoreModuleRule(module.id, ruleId)
                              }
                              onResetRuleTarget={(ruleId) =>
                                resetModuleRuleTarget(module.id, ruleId)
                              }
                              cnIpNoResolve={cnIpNoResolve}
                              onChangeCnIpNoResolve={setCnIpNoResolve}
                              experimentalCnUseCnRuleSet={
                                experimentalCnUseCnRuleSet
                              }
                              onChangeExperimentalCnUseCnRuleSet={
                                setExperimentalCnUseCnRuleSet
                              }
                            />
                          );
                        })
                      ) : (
                        <ProxyGroupsCustomGroupsPanel />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      <ProxyGroupsCustomRoutingRules />
    </>
  );
}
