import yaml from "js-yaml";

export type GeneratedYamlSemanticSeverity = "none" | "format-only" | "low" | "high";

export interface GeneratedYamlSemanticIssue {
  path: string;
  severity: Exclude<GeneratedYamlSemanticSeverity, "none" | "format-only">;
  before?: unknown;
  after?: unknown;
}

export interface GeneratedYamlSemanticSnapshot {
  version: 1;
  rawFingerprint: string;
  semanticFingerprint: string;
  sections: Record<string, unknown>;
}

export interface GeneratedYamlSemanticDiff {
  changed: boolean;
  severity: GeneratedYamlSemanticSeverity;
  issues: GeneratedYamlSemanticIssue[];
}

export class GeneratedYamlSemanticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratedYamlSemanticError";
  }
}

const HIGH_IMPACT_ROOT_KEYS = new Set([
  "proxies",
  "proxy-groups",
  "rule-providers",
  "proxy-providers",
  "rules",
  "dns",
  "listeners",
  "tun",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeScalar(value: unknown): unknown {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
  }
  return value;
}

function normalizeYamlValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeYamlValue);
  if (!isRecord(value)) return normalizeScalar(value);

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item !== undefined) out[key] = normalizeYamlValue(item);
  }
  return out;
}

function normalizeParsedYaml(parsed: unknown): Record<string, unknown> {
  if (parsed == null) return {};
  if (!isRecord(parsed)) {
    throw new GeneratedYamlSemanticError("Generated YAML must parse to a top-level object.");
  }

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(parsed).sort()) {
    const value = parsed[key];
    if (value !== undefined) out[key] = normalizeYamlValue(value);
  }
  return out;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeYamlValue(value));
}

function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function formatYamlParseError(error: unknown): string {
  if (isRecord(error)) {
    const reason = typeof error.reason === "string"
      ? error.reason
      : typeof error.message === "string"
        ? error.message
        : String(error);
    const mark = isRecord(error.mark) ? error.mark : null;
    const line = typeof mark?.line === "number" ? mark.line + 1 : null;
    const column = typeof mark?.column === "number" ? mark.column + 1 : null;
    return line && column ? `${reason} (line ${line}, column ${column})` : reason;
  }
  return String(error);
}

export function parseGeneratedYamlSemantics(yamlText: string): GeneratedYamlSemanticSnapshot {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlText || "");
  } catch (error) {
    throw new GeneratedYamlSemanticError(`Generated YAML parse failed: ${formatYamlParseError(error)}`);
  }

  const sections = normalizeParsedYaml(parsed);
  return {
    version: 1,
    rawFingerprint: fingerprint(yamlText),
    semanticFingerprint: hashGeneratedYamlSemantics({ version: 1, rawFingerprint: "", semanticFingerprint: "", sections }),
    sections,
  };
}

export function hashGeneratedYamlSemantics(snapshot: GeneratedYamlSemanticSnapshot): string {
  return fingerprint(stableStringify(snapshot.sections));
}

export function diffGeneratedYamlSemantics(
  before: GeneratedYamlSemanticSnapshot,
  after: GeneratedYamlSemanticSnapshot
): GeneratedYamlSemanticDiff {
  if (before.semanticFingerprint === after.semanticFingerprint) {
    return {
      changed: before.rawFingerprint !== after.rawFingerprint,
      severity: before.rawFingerprint === after.rawFingerprint ? "none" : "format-only",
      issues: [],
    };
  }

  const issues: GeneratedYamlSemanticIssue[] = [];
  const keys = new Set([...Object.keys(before.sections), ...Object.keys(after.sections)]);
  for (const key of [...keys].sort()) {
    const beforeValue = before.sections[key];
    const afterValue = after.sections[key];
    if (stableStringify(beforeValue) === stableStringify(afterValue)) continue;
    issues.push({
      path: key,
      severity: HIGH_IMPACT_ROOT_KEYS.has(key) ? "high" : "low",
      before: beforeValue,
      after: afterValue,
    });
  }

  const severity = issues.some((issue) => issue.severity === "high") ? "high" : "low";
  return {
    changed: true,
    severity,
    issues,
  };
}
