import type { CnCandidateParent, CnRuleCandidate } from "@subboost/core/rules/cn-candidate-utils";
import type { RuleSetInfo } from "@subboost/core/rules/metadata";

export type GitTreeEntry = {
  path: string;
  type: "blob" | "tree";
  sha: string;
};

export type GitTreeResponse = {
  sha: string;
  tree: GitTreeEntry[];
  truncated?: boolean;
};

export type RemoteRuleType = "geosite" | "geoip";
export type RuleCatalogSource = "remote" | "stale" | "unavailable";
export type RuleAvailabilityStatus = "available" | "missing_upstream";

export type RemoteRuleIndex = {
  geosite: string[];
  geoip: string[];
  fetchedAt: number;
  expiresAt: number;
  source: "remote" | "stale";
};

export type VerifiedRuleSetInfo = RuleSetInfo & {
  availabilityStatus: "available";
};

export type RuleSearchType = RemoteRuleType | "all";

export type RuleSearchResult = {
  items: VerifiedRuleSetInfo[];
  keyword: string;
  type: RuleSearchType;
  page: number;
  size: number;
  totalMatched: number;
  totalRules: number;
  fetchedAt?: number;
  expiresAt?: number;
  source: RuleCatalogSource;
};

export type RuleCatalogMissingRule = {
  id: string;
  path: string;
  owner?: string;
};

export type RuleCatalogDiff = {
  fetchedAt: number;
  totalRemoteRules: number;
  totalCuratedRules: number;
  missingCuratedRules: RuleCatalogMissingRule[];
  missingModuleRuleRefs: RuleCatalogMissingRule[];
  duplicateCuratedRuleIds: string[];
  unknownCategories: Array<{ id: string; category: string }>;
  remoteOnlySample: string[];
};

export type RuleIndexRefreshResult =
  | {
      status: "skipped" | "refreshed" | "stale";
      index: RemoteRuleIndex;
      diff: RuleCatalogDiff;
      error?: string;
    }
  | {
      status: "unavailable";
      error: string;
    };

export type CnRuleCandidateDiscovery = {
  items: CnRuleCandidate[];
  allItems: CnRuleCandidate[];
  parents: CnCandidateParent[];
  fetchedAt: number;
  expiresAt: number;
  source: "remote" | "stale";
};

export type CnRuleCandidateQuery = {
  moduleIds: string[];
  excludedRuleKeys: string[];
  debug: boolean;
};

export type CnRuleCandidateResponse = {
  items: CnRuleCandidate[];
  source: RuleCatalogSource;
  cache?: {
    fetchedAt: number;
    expiresAt: number;
    ttlMs: number;
  };
  allItems?: CnRuleCandidate[];
  error?: string;
  code?: string;
};

export type RuleCatalogServiceOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
  userAgent?: string;
  getGitHubToken?: () => string | undefined;
  logger?: Pick<Console, "warn" | "error" | "info">;
  loadIndex?: () => Promise<RemoteRuleIndex | null>;
  saveIndex?: (index: RemoteRuleIndex) => Promise<void>;
  loadDiscovery?: (key: string) => Promise<CnRuleCandidateDiscovery | null>;
  saveDiscovery?: (key: string, discovery: CnRuleCandidateDiscovery) => Promise<void>;
  serveStaleWithoutRefresh?: boolean;
  serveCachedOnly?: boolean;
};

export class RuleIndexUnavailableError extends Error {
  constructor(message = "Rule index is unavailable") {
    super(message);
    this.name = "RuleIndexUnavailableError";
  }
}
