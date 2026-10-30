import { db } from "@/db";
import { providerUsage } from "@/db/schema";
import type { ProviderCall } from "@/lib/types";
import { newId, round } from "@/lib/utils";
import { recordSpend } from "@/lib/security/rate-limit";
import { defaultRoute, enabledProviders, providerStatuses } from "@/lib/universal/providers";
import { dnsConfigured } from "@/lib/security/doh";
import { connectorStatuses, connectors } from "@/lib/connectors";
import { envFlag } from "@/lib/settings";

/**
 * Capability registry.
 *
 * The engine is organised around *capability slots* (rules, DNS intelligence,
 * catalogue, fact-checks, search, reputation, certificate transparency, AI
 * reasoning). Which concrete services fill the external slots is pure
 * operator configuration — connectors and model providers described in env
 * JSON (src/lib/connectors.ts, src/lib/universal/providers.ts) — so any API
 * or server, anywhere, can back any slot without a code change. Secrets are
 * read only on the server, and every call is metered for cost + latency.
 */

export interface ProviderConfig {
  id: string;
  label: string;
  purpose: string;
  enabled: boolean;
  reason?: string;
  costPerCallUsd: number;
  docsUrl?: string;
}

function slotStatus(capability: "search" | "factcheck" | "reputation" | "ct", envName: string) {
  const statuses = connectorStatuses(capability);
  const broken = statuses.filter((s) => !s.enabled);
  const ready = connectors(capability);
  return {
    enabled: ready.length > 0,
    reason: statuses.length
      ? broken.length === statuses.length
        ? broken.map((b) => `${b.id}: ${b.reason}`).join("; ")
        : undefined
      : `${envName} is not configured`,
    ids: ready.map((c) => c.id),
    cost: ready[0]?.costPerCallUsd ?? 0,
  };
}

export function getProviderConfigs(): ProviderConfig[] {
  const ai = defaultRoute();
  const factcheck = slotStatus("factcheck", "FACTCHECK_CONNECTORS");
  const search = slotStatus("search", "SEARCH_CONNECTORS");
  const reputation = slotStatus("reputation", "REPUTATION_CONNECTORS");
  const ct = slotStatus("ct", "CT_CONNECTORS");

  return [
    {
      id: "heuristics",
      label: "Rules engine",
      purpose: "Checksums, identifier normalisation, lexicons, pattern rules. Runs locally, always available, zero marginal cost.",
      enabled: true,
      costPerCallUsd: 0,
    },
    {
      id: "domain-intel",
      label: "Domain & DNS intelligence",
      purpose: "SOA, NS, MX, TXT/SPF/DMARC, CNAME, redirect chain — through the DoH resolvers named in DNS_RESOLVERS.",
      enabled: envFlag("ENABLE_DNS", true) && dnsConfigured(),
      reason: dnsConfigured() ? undefined : "DNS_RESOLVERS lists no resolver endpoint",
      costPerCallUsd: 0,
    },
    {
      id: "certificate-transparency",
      label: "Certificate Transparency lookups",
      purpose: "Issuer, subject, validity and age of the host's publicly logged TLS certificate.",
      enabled: ct.enabled && envFlag("ENABLE_DNS", true),
      reason: ct.reason,
      costPerCallUsd: ct.cost,
    },
    {
      id: "catalog",
      label: "Product catalogue",
      purpose: "Operator-maintained, normalised entity/model records with specification ranges and known counterfeit signals (PRODUCT_CATALOG, admin console or API).",
      enabled: true,
      costPerCallUsd: 0,
    },
    {
      id: "factcheck",
      label: "Published claim reviews",
      purpose: "Existing claim reviews from fact-checking services, through the connectors named in FACTCHECK_CONNECTORS.",
      enabled: factcheck.enabled,
      reason: factcheck.reason,
      costPerCallUsd: factcheck.cost,
    },
    {
      id: "reputation",
      label: "URL reputation",
      purpose: "Threat/reputation lookups for URLs, through the connectors named in REPUTATION_CONNECTORS.",
      enabled: reputation.enabled,
      reason: reputation.reason,
      costPerCallUsd: reputation.cost,
    },
    {
      id: "ai-analysis",
      label: "AI claim extraction & reasoning",
      purpose: "Splits text into atomic claims, compares retrieved evidence, drafts the human summary — on whichever model server the operator configured.",
      enabled: Boolean(ai),
      reason: ai ? undefined : aiUnavailableReason(),
      costPerCallUsd: 0.0006,
      docsUrl: ai?.provider.docsUrl,
    },
    {
      id: "web-search",
      label: "Web search",
      purpose: "Discovers primary sources, official announcements and corroborating reporting, through the connectors named in SEARCH_CONNECTORS.",
      enabled: search.enabled,
      reason: search.reason,
      costPerCallUsd: search.cost,
    },
  ];
}

function aiUnavailableReason(): string {
  if (enabledProviders().length) return "DEFAULT_MODEL does not name an available model";
  const misconfigured = providerStatuses().find((p) => p.reason);
  if (misconfigured) return `${misconfigured.id}: ${misconfigured.reason}`;
  return "No model server is configured (MODEL_PROVIDERS, or the AI_BASE_URL/AI_API_KEY quick settings)";
}

export function providerEnabled(id: string): boolean {
  return getProviderConfigs().find((p) => p.id === id)?.enabled ?? false;
}

export function providerCost(id: string): number {
  return getProviderConfigs().find((p) => p.id === id)?.costPerCallUsd ?? 0;
}

export interface TimedResult<T> {
  data: T;
  call: ProviderCall;
}

export async function meter<T>(
  provider: string,
  operation: string,
  fn: () => Promise<T>,
  options: { reportId?: string; costOverride?: number; detail?: string } = {},
): Promise<TimedResult<T>> {
  const started = Date.now();
  try {
    const data = await fn();
    const call: ProviderCall = {
      provider,
      operation,
      status: "ok",
      latencyMs: Date.now() - started,
      costUsd: options.costOverride ?? providerCost(provider),
      detail: options.detail,
    };
    await persistUsage(call, options.reportId);
    return { data, call };
  } catch (error) {
    const call: ProviderCall = {
      provider,
      operation,
      status: "error",
      latencyMs: Date.now() - started,
      costUsd: 0,
      error: (error as Error).message ?? String(error),
      detail: options.detail,
    };
    await persistUsage(call, options.reportId);
    throw error;
  }
}

export function skipped(provider: string, operation: string, detail: string): ProviderCall {
  return { provider, operation, status: "skipped", latencyMs: 0, costUsd: 0, detail };
}

export function disabled(provider: string, operation: string, detail: string): ProviderCall {
  return { provider, operation, status: "disabled", latencyMs: 0, costUsd: 0, detail };
}

/** Meters a call made outside meter(): streams, the universal gateway, the upstream proxy. */
export function recordProviderCall(call: ProviderCall, reportId?: string): Promise<void> {
  return persistUsage(call, reportId);
}

async function persistUsage(call: ProviderCall, reportId?: string) {
  await recordSpend(call.costUsd);
  try {
    await db.insert(providerUsage).values({
      id: newId(),
      reportId: reportId ?? null,
      // Column widths (schema.ts); a longer model id must not drop the row.
      provider: call.provider.slice(0, 48),
      operation: call.operation.slice(0, 64),
      status: call.status === "ok" ? "ok" : call.status,
      latencyMs: call.latencyMs,
      tokensIn: call.tokensIn ?? null,
      tokensOut: call.tokensOut ?? null,
      costUsd: round(call.costUsd, 6),
      error: call.error ?? null,
    });
  } catch {
    // usage logging must never break a verification
  }
}
