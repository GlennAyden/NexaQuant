import { describe, expect, it } from "vitest";

import newsSources from "@/lib/news/newsSources.json";
import {
  buildNewsSourcePolicyRows,
  NEWS_FETCH_POLICY,
  NEWS_SOURCE_POLICY_ROWS,
  summarizeNewsSourcePolicies,
} from "@/lib/news/sourcePolicy";

describe("news source policy", () => {
  it("catalogues every scraper source with open-source guardrails", () => {
    const summary = summarizeNewsSourcePolicies(NEWS_SOURCE_POLICY_ROWS);

    expect(summary.totalSources).toBe(newsSources.length);
    expect(summary.originalLinkRequiredCount).toBe(newsSources.length);
    expect(summary.attributionRequiredCount).toBe(newsSources.length);
    expect(summary.reviewRequiredCount).toBe(newsSources.length);
    expect(summary.rssSources).toBeGreaterThan(0);
    expect(summary.publicPageSources).toBeGreaterThan(0);
    expect(summary.officialDisclosureSources).toBeGreaterThan(0);
  });

  it("keeps source policy labels tied to parser behavior and fetch limits", () => {
    const policies = buildNewsSourcePolicyRows([
      { id: "rss", name: "RSS Source", category: "market", url: "https://example.com/rss", parser: "rss" },
      { id: "html", name: "HTML Source", category: "market", url: "https://example.com/page", parser: "bisnis-category" },
      { id: "idx", name: "IDX", category: "disclosure", url: "https://idx.example/api", parser: "idx-disclosure" },
    ]);

    expect(policies.map((policy) => policy.accessLabel)).toEqual([
      "RSS feed",
      "public listing page",
      "official disclosure",
    ]);
    expect(policies[0].operationalGuardrails).toEqual(expect.arrayContaining([
      `${NEWS_FETCH_POLICY.maxFetchAttempts} fetch attempts`,
      `${Math.round(NEWS_FETCH_POLICY.requestTimeoutMs / 1000)}s timeout`,
      `${NEWS_FETCH_POLICY.maxPagesPerSource} page cap`,
    ]));
    expect(policies[1].complianceNote).toContain("terms and robots review");
    expect(policies[2].complianceNote).toContain("IDX");
  });
});
