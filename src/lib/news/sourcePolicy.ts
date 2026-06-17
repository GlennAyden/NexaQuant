import newsSources from "@/lib/news/newsSources.json";

type NewsSourceParser = "rss" | "emitennews-category" | "bisnis-category" | "investor-category" | "idx-disclosure";

type SourceCatalogItem = {
  id: string;
  name: string;
  category: string;
  url: string;
  parser: NewsSourceParser;
  requiresKeywordMatch?: boolean;
};

export type NewsSourceAccessMode = "rss" | "public-page" | "official-disclosure";

export type NewsSourcePolicyRow = {
  sourceId: string;
  sourceName: string;
  category: string;
  accessMode: NewsSourceAccessMode;
  accessLabel: string;
  usagePolicy: "metadata-excerpt-derived";
  originalLinkRequired: boolean;
  attributionRequired: boolean;
  publicDeploymentReviewRequired: boolean;
  operationalGuardrails: string[];
  complianceNote: string;
};

export const NEWS_FETCH_POLICY = {
  requestTimeoutMs: 15_000,
  maxFetchAttempts: 3,
  retryBackoffMs: 25,
  maxPagesPerSource: 100,
} as const;

const SOURCE_CATALOG = newsSources as SourceCatalogItem[];

export const NEWS_SOURCE_POLICY_ROWS = buildNewsSourcePolicyRows(SOURCE_CATALOG);

export function buildNewsSourcePolicyRows(sources: SourceCatalogItem[] = SOURCE_CATALOG): NewsSourcePolicyRow[] {
  return sources.map((source) => {
    const accessMode = getAccessMode(source);

    return {
      sourceId: source.id,
      sourceName: source.name,
      category: source.category,
      accessMode,
      accessLabel: getAccessLabel(accessMode),
      usagePolicy: "metadata-excerpt-derived",
      originalLinkRequired: true,
      attributionRequired: true,
      publicDeploymentReviewRequired: true,
      operationalGuardrails: [
        "sequential source sync",
        `${NEWS_FETCH_POLICY.maxFetchAttempts} fetch attempts`,
        `${Math.round(NEWS_FETCH_POLICY.requestTimeoutMs / 1000)}s timeout`,
        `${NEWS_FETCH_POLICY.maxPagesPerSource} page cap`,
      ],
      complianceNote: getComplianceNote(accessMode),
    };
  });
}

export function summarizeNewsSourcePolicies(policies: NewsSourcePolicyRow[] = NEWS_SOURCE_POLICY_ROWS) {
  const accessCounts = policies.reduce<Record<NewsSourceAccessMode, number>>((counts, policy) => {
    counts[policy.accessMode] += 1;
    return counts;
  }, { rss: 0, "public-page": 0, "official-disclosure": 0 });

  return {
    totalSources: policies.length,
    rssSources: accessCounts.rss,
    publicPageSources: accessCounts["public-page"],
    officialDisclosureSources: accessCounts["official-disclosure"],
    attributionRequiredCount: policies.filter((policy) => policy.attributionRequired).length,
    originalLinkRequiredCount: policies.filter((policy) => policy.originalLinkRequired).length,
    reviewRequiredCount: policies.filter((policy) => policy.publicDeploymentReviewRequired).length,
  };
}

function getAccessMode(source: SourceCatalogItem): NewsSourceAccessMode {
  if (source.parser === "idx-disclosure") {
    return "official-disclosure";
  }

  if (source.parser === "rss") {
    return "rss";
  }

  return "public-page";
}

function getAccessLabel(accessMode: NewsSourceAccessMode) {
  if (accessMode === "official-disclosure") {
    return "official disclosure";
  }

  if (accessMode === "rss") {
    return "RSS feed";
  }

  return "public listing page";
}

function getComplianceNote(accessMode: NewsSourceAccessMode) {
  if (accessMode === "official-disclosure") {
    return "Official disclosure evidence should be linked back to IDX and reviewed if access is blocked.";
  }

  if (accessMode === "rss") {
    return "RSS items are stored as metadata, excerpts, links, and derived signals only.";
  }

  return "Public page parsers need terms and robots review before public deployment.";
}
