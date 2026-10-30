import { levenshtein, modelTokens, normalizeModel } from "@/lib/identifiers/checksums";
import { setting } from "@/lib/settings";

/**
 * Product catalogue — the operator's own normalised records of the entities
 * and models their deployment protects. This is deliberately NOT a bundled
 * dataset: which brands and models matter is an operational decision, and the
 * product module states the provenance of its records in every report.
 */

export interface CatalogEntry {
  brand: string;
  model: string;
  family?: string;
  category: string;
  identifiers: { models: string[]; barcodePrefixes?: string[]; skuPattern?: string };
  specs: Record<string, string>;
  knownCounterfeitSignals: string[];
  officialUrl: string;
  /** Provenance label shown in reports ("operator-config", "admin", …). */
  source: string;
}

/**
 * Catalogue entries come from the operator, never from the code:
 *
 *  - PRODUCT_CATALOG (JSON array, same shape as CatalogEntry) seeds the
 *    database on first boot and via the admin console's "seed catalogue"
 *    action; and
 *  - the product_catalog table itself (admin console / API maintain it).
 *
 * A deployment with no configured records still runs every structural check
 * (checksums, specification mathematics, listing-language signals) and says
 * honestly that no catalogue record matched — absence of a record is never
 * treated as evidence of counterfeiting.
 */

/** Parses PRODUCT_CATALOG into validated entries; malformed records are dropped. */
export function parseCatalogConfig(): CatalogEntry[] {
  const raw = setting("PRODUCT_CATALOG");
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: CatalogEntry[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const brand = str(e.brand);
    const model = str(e.model);
    if (!brand || !model) continue;
    const identifiers = (e.identifiers && typeof e.identifiers === "object" ? e.identifiers : {}) as Record<string, unknown>;
    const specs = (e.specs && typeof e.specs === "object" ? e.specs : {}) as Record<string, unknown>;
    out.push({
      brand,
      model,
      family: str(e.family) || undefined,
      category: str(e.category) || "Uncategorised",
      identifiers: {
        models: Array.isArray(identifiers.models) ? identifiers.models.filter((m): m is string => typeof m === "string") : [],
        barcodePrefixes: Array.isArray(identifiers.barcodePrefixes)
          ? identifiers.barcodePrefixes.filter((m): m is string => typeof m === "string")
          : undefined,
        skuPattern: typeof identifiers.skuPattern === "string" ? identifiers.skuPattern : undefined,
      },
      specs: Object.fromEntries(Object.entries(specs).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)])),
      knownCounterfeitSignals: Array.isArray(e.knownCounterfeitSignals)
        ? e.knownCounterfeitSignals.filter((m): m is string => typeof m === "string")
        : [],
      officialUrl: str(e.officialUrl),
      source: str(e.source) || "operator-config",
    });
  }
  return out;
}

export interface CatalogMatch {
  entry: CatalogEntry;
  score: number;
  matchedOn: string[];
}

export function matchCatalog(query: string, entries: CatalogEntry[], limit = 5): CatalogMatch[] {
  const norm = normalizeModel(query);
  const tokens = modelTokens(query);
  const lower = query.toLowerCase();
  const matches: CatalogMatch[] = [];

  for (const entry of entries) {
    const reasons: string[] = [];
    let score = 0;

    const brandHit = lower.includes(entry.brand.toLowerCase());
    if (brandHit) { score += 0.5; reasons.push(`brand term "${entry.brand}"`); }

    for (const code of entry.identifiers.models) {
      const codeNorm = normalizeModel(code);
      if (codeNorm && norm && (norm === codeNorm || norm.includes(codeNorm) || codeNorm.includes(norm))) {
        score += 1.6;
        reasons.push(`exact/contained model code "${code}"`);
        continue;
      }
      const shared = tokens.filter((t) => codeNorm.includes(t) && t.length >= 4);
      if (shared.length) {
        score += 0.45 * Math.min(shared.length, 2);
        reasons.push(`model fragment "${shared[0]}"`);
      }
      const distance = levenshtein(norm, codeNorm);
      if (norm.length > 4 && distance <= 2) {
        score += 1.1 - distance * 0.3;
        reasons.push(`near-match to "${code}" (edit distance ${distance})`);
      }
    }

    const modelNorm = normalizeModel(entry.model);
    if (modelNorm && (norm.includes(modelNorm) || modelNorm.includes(norm))) {
      score += 1.2;
      reasons.push(`marketing model name "${entry.model}"`);
    } else {
      const words = entry.model.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
      const hits = words.filter((w) => lower.includes(w));
      if (hits.length >= 2) {
        score += 0.35 * hits.length;
        reasons.push(`model words ${hits.map((h) => `"${h}"`).join(", ")}`);
      }
    }

    if (entry.family && lower.includes(entry.family.toLowerCase())) {
      score += 0.3;
      reasons.push(`family "${entry.family}"`);
    }
    if (entry.identifiers.skuPattern && new RegExp(entry.identifiers.skuPattern, "i").test(query)) {
      score += 1.3;
      reasons.push("SKU format matches the manufacturer pattern");
    }
    if (entry.identifiers.barcodePrefixes?.some((p) => query.replace(/\D/g, "").startsWith(p))) {
      score += 0.8;
      reasons.push("GTIN company prefix matches the brand's GS1 allocation");
    }

    if (score > 0.55) matches.push({ entry, score: Math.min(2.6, score), matchedOn: [...new Set(reasons)] });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
