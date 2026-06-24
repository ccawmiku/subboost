import type { CustomRule } from "@subboost/core/types/config";
import { isCustomRuleType } from "./custom-rule-utils";

export type CustomRuleBatchImportPreviewStatus =
  | "ready"
  | "skipped"
  | "error"
  | "duplicate";

export type CustomRuleBatchImportPreviewItem = {
  lineNumber: number;
  raw: string;
  status: CustomRuleBatchImportPreviewStatus;
  message: string;
  rule?: CustomRule;
};

export type ParseCustomRuleBatchImportOptions = {
  text: string;
  defaultType: CustomRule["type"];
  defaultTarget: string;
  defaultNoResolve: boolean;
  targetOptions: string[];
  existingRules: CustomRule[];
};

export type CustomRuleBatchImportResult = {
  rules: CustomRule[];
  items: CustomRuleBatchImportPreviewItem[];
  readyCount: number;
  skippedCount: number;
  errorCount: number;
  duplicateCount: number;
  canImport: boolean;
};

type SplitLineResult =
  | { ok: true; parts: string[] }
  | { ok: false; error: string };

function splitRuleLine(rawLine: string): SplitLineResult {
  const parts: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < rawLine.length; index += 1) {
    const char = rawLine[index];
    if (char === "\"") {
      if (quoted && rawLine[index + 1] === "\"") {
        current += "\"";
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (quoted) {
    return { ok: false, error: "引号未闭合" };
  }

  parts.push(current.trim());
  return { ok: true, parts };
}

function isCommentLine(value: string): boolean {
  return value.startsWith("#") || value.startsWith("//");
}

function normalizeImportLine(value: string): { skip?: string; line?: string } {
  if (/^rules\s*:\s*$/i.test(value)) {
    return { skip: "rules 块标记" };
  }

  const yamlListMatch = value.match(/^-\s*(.*)$/);
  if (yamlListMatch) {
    const line = (yamlListMatch[1] ?? "").trim();
    if (!line) return { skip: "空 YAML 列表项" };
    return { line };
  }

  return { line: value };
}

function normalizeNoResolve(value: string): boolean | null {
  return value.trim().toLowerCase() === "no-resolve" ? true : null;
}

function getTargetKey(target: CustomRule["target"]): string {
  if (typeof target === "string") return target.trim();
  return `${target.kind}:${target.id.trim()}`;
}

function getRuleKey(rule: Pick<CustomRule, "type" | "value" | "target" | "noResolve">): string {
  return [
    rule.type,
    rule.value.trim(),
    getTargetKey(rule.target),
    Boolean(rule.noResolve) ? "1" : "0",
  ].join("\u0000");
}

function buildRuleFromParts(
  parts: string[],
  options: ParseCustomRuleBatchImportOptions,
): Pick<CustomRule, "type" | "value" | "target" | "noResolve"> | string {
  if (parts.length === 0) return "规则为空";

  const first = parts[0]?.trim() ?? "";
  if (!first) return "规则为空";

  if (parts.length === 1) {
    return {
      type: options.defaultType,
      value: first,
      target: options.defaultTarget.trim(),
      noResolve: Boolean(options.defaultNoResolve),
    };
  }

  if (!isCustomRuleType(first)) {
    return `未知规则类型：${first}`;
  }

  if (parts.length > 4) {
    return "规则列数过多";
  }

  const value = parts[1]?.trim() ?? "";
  const target = parts.length >= 3 ? parts[2]?.trim() ?? "" : options.defaultTarget.trim();
  const noResolve =
    parts.length >= 4
      ? normalizeNoResolve(parts[3] ?? "")
      : parts.length >= 3
        ? false
        : Boolean(options.defaultNoResolve);

  if (noResolve === null) {
    return `不支持的尾列：${parts[3]}`;
  }

  return {
    type: first,
    value,
    target,
    noResolve,
  };
}

export function parseCustomRuleBatchImport(
  options: ParseCustomRuleBatchImportOptions,
): CustomRuleBatchImportResult {
  const targetSet = new Set(
    options.targetOptions
      .map((target) => target.trim())
      .filter(Boolean),
  );
  const existingKeys = new Set(options.existingRules.map((rule) => getRuleKey(rule)));
  const batchKeys = new Set<string>();
  const items: CustomRuleBatchImportPreviewItem[] = [];
  const rules: CustomRule[] = [];
  let skippedCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;

  const lines = options.text.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) {
      skippedCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "skipped",
        message: "空行",
      });
      return;
    }

    if (isCommentLine(trimmed)) {
      skippedCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "skipped",
        message: "注释",
      });
      return;
    }

    const normalized = normalizeImportLine(trimmed);
    if (normalized.skip) {
      skippedCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "skipped",
        message: normalized.skip,
      });
      return;
    }

    const line = normalized.line ?? trimmed;
    if (isCommentLine(line)) {
      skippedCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "skipped",
        message: "注释",
      });
      return;
    }

    const split = splitRuleLine(line);
    if (!split.ok) {
      errorCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "error",
        message: split.error,
      });
      return;
    }

    const draft = buildRuleFromParts(split.parts, options);
    if (typeof draft === "string") {
      errorCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "error",
        message: draft,
      });
      return;
    }

    if (!draft.value.trim()) {
      errorCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "error",
        message: "规则值不能为空",
      });
      return;
    }

    const target = getTargetKey(draft.target);
    if (!target) {
      errorCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "error",
        message: "目标不能为空",
      });
      return;
    }

    if (!targetSet.has(target)) {
      errorCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "error",
        message: `未知目标：${target}`,
      });
      return;
    }

    const rule: CustomRule = {
      id: "",
      type: draft.type,
      value: draft.value.trim(),
      target,
      noResolve: Boolean(draft.noResolve),
    };
    const key = getRuleKey(rule);
    if (existingKeys.has(key) || batchKeys.has(key)) {
      duplicateCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "duplicate",
        message: existingKeys.has(key) ? "与现有规则重复" : "与本次导入的规则重复",
        rule,
      });
      return;
    }

    batchKeys.add(key);
    rules.push(rule);
    items.push({
      lineNumber,
      raw: rawLine,
      status: "ready",
      message: "可导入",
      rule,
    });
  });

  return {
    rules,
    items,
    readyCount: rules.length,
    skippedCount,
    errorCount,
    duplicateCount,
    canImport: rules.length > 0 && errorCount === 0 && duplicateCount === 0,
  };
}
