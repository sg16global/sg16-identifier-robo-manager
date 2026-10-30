import type { EvidenceSource, ProviderCall } from "@/lib/types";
import { disabled, meter, skipped } from "@/lib/providers/registry";
import { truncate } from "@/lib/utils";
import { setting } from "@/lib/settings";
import {
  connectors,
  fieldArray,
  fieldString,
  runConnector,
  type ConnectorSpec,
} from "@/lib/connectors";

/**
 * News & claim research through operator-configured connectors:
 *  - FACTCHECK_CONNECTORS → published claim reviews
 *  - SEARCH_CONNECTORS    → primary sources & corroborating reporting
 *
 * Which services sit behind those slots is entirely a deployment decision —
 * any JSON API, in any region, described in configuration (src/lib/connectors.ts).
 * Every slot degrades to a recorded "skipped/disabled" provider call, never a
 * crash, and the report says honestly when nothing was retrieved.
 */

export interface FactCheckHit {
  claimText: string;
  claimant?: string;
  rating?: string;
  reviewer?: string;
  reviewUrl?: string;
  reviewDate?: string;
  languageCode?: string;
  connector: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
}

/**
 * Domain-class trust tiers. Only *structural* suffix conventions ship as
 * defaults (second-level domains reserved for government, education,
 * military and international bodies); every named-domain list is operator
 * data, because which publishers an operation trusts is a local decision:
 *
 *   OFFICIAL_DOMAIN_SUFFIXES  extra structural suffixes (comma list)
 *   REPUTABLE_DOMAINS         domains this deployment treats as reputable
 *   MIXED_TRUST_DOMAINS       user-generated / social domains ("mixed")
 */
const DEFAULT_OFFICIAL_SUFFIXES = [
  ".gov", ".int", ".edu", ".mil",
  ".gov.uk", ".ac.uk", ".sch.uk", ".gov.au", ".edu.au", ".gc.ca", ".gouv.fr", ".go.jp", ".ac.jp",
  ".go.kr", ".ac.kr", ".gov.br", ".gov.in", ".ac.in", ".edu.cn", ".gov.cn", ".ac.cn", ".gov.sg",
  ".gov.za", ".ac.za", ".gov.my", ".edu.my", ".gob.mx", ".gov.mx", ".gob.es", ".gov.it", ".ac.nz",
];

function csvSetting(name: string): string[] {
  return (setting(name) ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function officialSuffixes(): string[] {
  return [...DEFAULT_OFFICIAL_SUFFIXES, ...csvSetting("OFFICIAL_DOMAIN_SUFFIXES")];
}

export function trustTierFor(url: string): "official" | "reputable" | "mixed" | "unrated" {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (officialSuffixes().some((s) => host.endsWith(s))) return "official";
    const reputable = csvSetting("REPUTABLE_DOMAINS");
    if (reputable.some((d) => host === d || host.endsWith(`.${d}`))) return "reputable";
    const mixed = csvSetting("MIXED_TRUST_DOMAINS");
    if (mixed.some((d) => host === d || host.endsWith(`.${d}`) || host.includes(d))) return "mixed";
    return "unrated";
  } catch {
    return "unrated";
  }
}

function normalizeRating(rating?: string): "supports" | "contradicts" | "context" {
  if (!rating) return "context";
  const r = rating.toLowerCase();
  if (/^(true|correct|accurate|pants on fire|false|mostly false|wrong|scam|debunked|hoax|fabricated)/.test(r)) {
    // "True" supports the claim; "False" contradicts it.
    return /^(true|correct|accurate)/.test(r) ? "supports" : "contradicts";
  }
  if (/(mixture|half true|partly|partially|missing context|out of context|misleading|needs context|mostly true)/.test(r)) {
    return "context";
  }
  return "context";
}

/* -------------------------------- fact-checks -------------------------------- */

function mapFactChecks(spec: ConnectorSpec, data: unknown, query: string): FactCheckHit[] {
  const map = spec.responseMap;
  const claimsPath = map.claims ?? map.results ?? "";
  const claims = claimsPath ? fieldArray(data, claimsPath) : Array.isArray(data) ? data : [];
  const hits: FactCheckHit[] = [];

  for (const claim of claims) {
    const claimText = fieldString(claim, map.claimText ?? map.title) ?? query;
    const claimant = fieldString(claim, map.claimant);
    // A claim may carry several reviews; when the shape has none, the claim
    // row itself is treated as the review.
    const reviews = map.reviews ? fieldArray(claim, map.reviews) : [claim];
    for (const review of reviews) {
      hits.push({
        claimText,
        claimant,
        rating: fieldString(review, map.rating),
        reviewer: fieldString(review, map.reviewer ?? map.publisher),
        reviewUrl: fieldString(review, map.reviewUrl ?? map.url),
        reviewDate: fieldString(review, map.reviewDate ?? map.publishedAt),
        languageCode: fieldString(review, map.language ?? map.languageCode),
        connector: spec.id,
      });
    }
  }
  return hits;
}

export async function fetchFactChecks(
  query: string,
  opts: { reportId?: string; pageSize?: number; language?: string } = {},
): Promise<{ hits: FactCheckHit[]; call: ProviderCall }> {
  const configured = connectors("factcheck");
  if (!configured.length) {
    return {
      hits: [],
      call: disabled(
        "factcheck",
        "claims:search",
        "No fact-check connector is configured (FACTCHECK_CONNECTORS), so no published claim reviews were retrieved.",
      ),
    };
  }

  const errors: string[] = [];
  for (const spec of configured) {
    try {
      const { data, call } = await meter(spec.id, "factcheck:search", async () => {
        return runConnector(spec, {
          query,
          page_size: opts.pageSize ?? 10,
          language: opts.language ?? "en",
        });
      }, { reportId: opts.reportId, costOverride: spec.costPerCallUsd });
      const hits = mapFactChecks(spec, data, query);
      if (hits.length) return { hits, call };
      // An empty answer is a valid answer: keep the successful call, try the
      // next connector only for a richer result set.
      return { hits, call };
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return {
    hits: [],
    call: {
      provider: configured[0].id,
      operation: "factcheck:search",
      status: "error",
      latencyMs: 0,
      costUsd: 0,
      error: errors.join("; "),
    },
  };
}

/* ---------------------------------- search ---------------------------------- */

function mapSearchResults(spec: ConnectorSpec, data: unknown): SearchResult[] {
  const map = spec.responseMap;
  const items = fieldArray(data, map.results ?? map.items ?? "results");
  const out: SearchResult[] = [];
  for (const item of items) {
    const url = fieldString(item, map.url ?? map.link);
    if (!url) continue;
    let source = fieldString(item, map.source ?? map.publisher) ?? "";
    if (!source) {
      try {
        source = new URL(url).hostname;
      } catch {
        source = url;
      }
    }
    out.push({
      title: fieldString(item, map.title) ?? url,
      url,
      snippet: truncate(fieldString(item, map.snippet ?? map.content ?? map.body) ?? "", 400),
      source,
      publishedAt: fieldString(item, map.publishedAt ?? map.date),
    });
  }
  return out;
}

export async function searchWeb(
  query: string,
  opts: { reportId?: string; maxResults?: number } = {},
): Promise<{ results: SearchResult[]; answer?: string; call: ProviderCall }> {
  const configured = connectors("search");
  if (!configured.length) {
    return {
      results: [],
      call: skipped(
        "web-search",
        "query",
        "No search connector is configured (SEARCH_CONNECTORS). Corroborating sources were not retrieved for this check.",
      ),
    };
  }

  const errors: string[] = [];
  for (const spec of configured) {
    try {
      const { data, call } = await meter(spec.id, "search:query", async () => {
        return runConnector(spec, { query, max_results: opts.maxResults ?? 8 });
      }, { reportId: opts.reportId, costOverride: spec.costPerCallUsd });
      const results = mapSearchResults(spec, data);
      const answer = fieldString(data, spec.responseMap.answer);
      if (results.length || answer) return { results, answer, call };
      errors.push(`${spec.label} returned no results`);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return {
    results: [],
    call: {
      provider: configured[0].id,
      operation: "search:query",
      status: "error",
      latencyMs: 0,
      costUsd: 0,
      error: errors.join("; "),
    },
  };
}

export function searchResultsToEvidence(results: SearchResult[]): EvidenceSource[] {
  return results.map((r) => ({
    provider: "web-search",
    url: r.url,
    title: r.title,
    publisher: r.source,
    excerpt: r.snippet,
    stance: "context" as const,
    publishedAt: r.publishedAt ?? null,
    retrievedAt: new Date().toISOString(),
    trustTier: trustTierFor(r.url),
  }));
}

export function factChecksToEvidence(hits: FactCheckHit[]): EvidenceSource[] {
  return hits.map((h) => ({
    provider: h.connector,
    url: h.reviewUrl,
    title: truncate(h.claimText, 180),
    publisher: h.reviewer,
    excerpt: `Rating: ${h.rating ?? "unrated"}${h.claimant ? ` · Claimant: ${h.claimant}` : ""}`,
    stance: normalizeRating(h.rating),
    publishedAt: h.reviewDate ?? null,
    retrievedAt: new Date().toISOString(),
    trustTier: "reputable" as const,
    meta: { rating: h.rating ?? null },
  }));
}
