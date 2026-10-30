import { constantTimeEqual } from "@/lib/security/compare";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { auditEvents, feedback, productCatalog, providerUsage } from "@/db/schema";
import {
  FLAG_KEYS,
  adminStats,
  ensureFlagsSeeded,
  listFeedback,
  listRecentAudit,
  purgeExpiredReports,
  setFlag,
} from "@/lib/db/reports";
import { ensureCatalogSeeded } from "@/lib/verification/modules/product";
import { budgetState, DAILY_BUDGET_USD } from "@/lib/security/rate-limit";
import { newId } from "@/lib/utils";
import { numSetting, setting } from "@/lib/settings";

// No fallback: without ADMIN_ACCESS_CODE the console is closed to everyone. A
// default code would be public (it is printed in .env.example).
const ADMIN_CODE = setting("ADMIN_ACCESS_CODE") ?? "";

function authorized(request: Request): boolean {
  // Header only: a code in the URL would be written to server and CDN logs.
  const supplied = request.headers.get("x-admin-code") ?? "";
  if (!ADMIN_CODE || !supplied) return false;
  return constantTimeEqual(supplied, ADMIN_CODE);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Administrator access code required." }, { status: 401 });
  }
  await ensureFlagsSeeded();

  const [stats, fb, audit, recentUsage] = await Promise.all([
    adminStats(),
    listFeedback(),
    listRecentAudit(30),
    db.select().from(providerUsage).orderBy(sql`created_at desc`).limit(40),
  ]);

  const spend = await db
    .select({
      total: sql<number>`coalesce(sum(cost_usd),0)::float`,
      calls: sql<number>`count(*)::int`,
      errors: sql<number>`coalesce(sum(case when status = 'error' then 1 else 0 end),0)::int`,
    })
    .from(providerUsage);

  return Response.json({
    ok: true,
    stats,
    feedback: fb,
    audit,
    recentUsage,
    spend: spend[0],
    budget: { dailyUsd: DAILY_BUDGET_USD, ...(await budgetState()) },
    retentionDays: numSetting("RETENTION_DAYS", 30),
    flags: Object.values(FLAG_KEYS),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Administrator access code required." }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const allowedKeys = Object.values(FLAG_KEYS) as string[];

  if (action === "set-flag") {
    const key = String(body.key ?? "");
    if (!allowedKeys.includes(key)) {
      return Response.json({ ok: false, error: `Unknown flag "${key}".` }, { status: 400 });
    }
    await setFlag(key, Boolean(body.enabled));
    return Response.json({ ok: true, key, enabled: Boolean(body.enabled) });
  }

  if (action === "seed-catalog") {
    const inserted = await ensureCatalogSeeded();
    return Response.json({ ok: true, inserted });
  }

  if (action === "catalog-upsert") {
    const entry = (body.entry ?? {}) as Record<string, unknown>;
    const brand = String(entry.brand ?? "").trim().slice(0, 96);
    const model = String(entry.model ?? "").trim().slice(0, 160);
    if (!brand || !model) {
      return Response.json({ ok: false, error: "entry.brand and entry.model are required." }, { status: 400 });
    }
    const values = {
      brand,
      model,
      family: entry.family ? String(entry.family).slice(0, 120) : null,
      category: String(entry.category ?? "Uncategorised").slice(0, 64),
      identifiers: (entry.identifiers && typeof entry.identifiers === "object" ? entry.identifiers : { models: [] }) as object,
      specs: (entry.specs && typeof entry.specs === "object" ? entry.specs : {}) as object,
      knownCounterfeitSignals: Array.isArray(entry.knownCounterfeitSignals) ? (entry.knownCounterfeitSignals as unknown[]) : [],
      officialUrl: entry.officialUrl ? String(entry.officialUrl) : null,
      source: "admin",
      lastReviewedAt: new Date(),
    };
    await db
      .insert(productCatalog)
      .values({ id: newId(), ...values })
      .onConflictDoUpdate({ target: [productCatalog.brand, productCatalog.model], set: values });
    await db.insert(auditEvents).values({ id: newId(), actor: "admin", action: "catalog-upsert", meta: { brand, model } });
    return Response.json({ ok: true, brand, model });
  }

  if (action === "catalog-delete") {
    const brand = String(body.brand ?? "").trim();
    const model = String(body.model ?? "").trim();
    if (!brand || !model) {
      return Response.json({ ok: false, error: "brand and model are required." }, { status: 400 });
    }
    await db
      .delete(productCatalog)
      .where(sql`lower(${productCatalog.brand}) = ${brand.toLowerCase()} and lower(${productCatalog.model}) = ${model.toLowerCase()}`);
    await db.insert(auditEvents).values({ id: newId(), actor: "admin", action: "catalog-delete", meta: { brand, model } });
    return Response.json({ ok: true, brand, model });
  }

  if (action === "catalog-import") {
    // Bulk import: the same JSON shape as PRODUCT_CATALOG.
    const entries = Array.isArray(body.entries) ? (body.entries as Record<string, unknown>[]) : [];
    let inserted = 0;
    for (const entry of entries.slice(0, 500)) {
      const brand = String(entry.brand ?? "").trim().slice(0, 96);
      const model = String(entry.model ?? "").trim().slice(0, 160);
      if (!brand || !model) continue;
      const values = {
        brand,
        model,
        family: entry.family ? String(entry.family).slice(0, 120) : null,
        category: String(entry.category ?? "Uncategorised").slice(0, 64),
        identifiers: (entry.identifiers && typeof entry.identifiers === "object" ? entry.identifiers : { models: [] }) as object,
        specs: (entry.specs && typeof entry.specs === "object" ? entry.specs : {}) as object,
        knownCounterfeitSignals: Array.isArray(entry.knownCounterfeitSignals) ? (entry.knownCounterfeitSignals as unknown[]) : [],
        officialUrl: entry.officialUrl ? String(entry.officialUrl) : null,
        source: "admin",
        lastReviewedAt: new Date(),
      };
      await db
        .insert(productCatalog)
        .values({ id: newId(), ...values })
        .onConflictDoUpdate({ target: [productCatalog.brand, productCatalog.model], set: values });
      inserted += 1;
    }
    await db.insert(auditEvents).values({ id: newId(), actor: "admin", action: "catalog-import", meta: { inserted } });
    return Response.json({ ok: true, inserted });
  }

  if (action === "purge-expired") {
    const removed = await purgeExpiredReports();
    await db.insert(auditEvents).values({ id: newId(), actor: "admin", action: "purge-expired", meta: { removed } });
    return Response.json({ ok: true, removed });
  }

  if (action === "resolve-feedback") {
    const id = String(body.id ?? "");
    const status = String(body.status ?? "resolved");
    await db.update(feedback).set({ status }).where(sql`${feedback.id} = ${id}`);
    return Response.json({ ok: true, id, status });
  }

  return Response.json({ ok: false, error: `Unknown action "${action}".` }, { status: 400 });
}
