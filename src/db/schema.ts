import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Persistence layer.
 *
 * Small, deliberate schema: reports, evidence, findings, product catalogue,
 * provider usage/cost, feedback, business entitlements, service flags
 * (emergency switch) and audit events. No table or column is tied to a
 * vendor; catalogue and connector data are operator-owned.
 */

export const verificationReports = pgTable(
  "verification_reports",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    /** Unguessable public reference, e.g. RPT-4KQ2-9MXT (prefix configurable) */
    publicId: varchar("public_id", { length: 32 }).notNull(),
    category: varchar("category", { length: 24 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    confidence: real("confidence"),
    summary: text("summary").notNull(),
    /** Raw user submission (kept short-lived; see retention policy) */
    inputText: text("input_text"),
    inputUrl: text("input_url"),
    inputKind: varchar("input_kind", { length: 24 }),
    /** Module specific structured payload (product match, media forensics…) */
    payload: jsonb("payload"),
    workflow: jsonb("workflow"),
    limitations: jsonb("limitations"),
    nextSteps: jsonb("next_steps"),
    shareable: boolean("shareable").notNull().default(false),
    flagged: boolean("flagged").notNull().default(false),
    latencyMs: integer("latency_ms"),
    costUsd: real("cost_usd").notNull().default(0),
    providersUsed: jsonb("providers_used"),
    ipFingerprint: varchar("ip_fingerprint", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    retentionExpiresAt: timestamp("retention_expires_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("verification_reports_public_id_idx").on(t.publicId),
    index("verification_reports_category_idx").on(t.category),
    index("verification_reports_created_at_idx").on(t.createdAt),
    index("verification_reports_status_idx").on(t.status),
  ],
);

export const evidenceSources = pgTable(
  "evidence_sources",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    reportId: varchar("report_id", { length: 64 })
      .notNull()
      .references(() => verificationReports.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 48 }).notNull(),
    url: text("url"),
    title: text("title"),
    publisher: text("publisher"),
    excerpt: text("excerpt"),
    /** supports | contradicts | context | neutral */
    stance: varchar("stance", { length: 16 }).notNull().default("neutral"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
    trustTier: varchar("trust_tier", { length: 16 }),
    meta: jsonb("meta"),
  },
  (t) => [index("evidence_sources_report_idx").on(t.reportId)],
);

export const reportFindings = pgTable(
  "report_findings",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    reportId: varchar("report_id", { length: 64 })
      .notNull()
      .references(() => verificationReports.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 24 }).notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    /** positive | warning | risk | unknown | info */
    severity: varchar("severity", { length: 16 }).notNull().default("info"),
    weight: real("weight").notNull().default(1),
    sourceRefs: jsonb("source_refs"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("report_findings_report_idx").on(t.reportId)],
);

export const productCatalog = pgTable(
  "product_catalog",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    brand: varchar("brand", { length: 96 }).notNull(),
    model: varchar("model", { length: 160 }).notNull(),
    family: varchar("family", { length: 120 }),
    category: varchar("category", { length: 64 }).notNull(),
    identifiers: jsonb("identifiers").notNull(),
    specs: jsonb("specs").notNull(),
    knownCounterfeitSignals: jsonb("known_counterfeit_signals"),
    officialUrl: text("official_url"),
    source: varchar("source", { length: 64 }).notNull(),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_catalog_brand_idx").on(t.brand),
    index("product_catalog_category_idx").on(t.category),
    uniqueIndex("product_catalog_model_idx").on(t.brand, t.model),
  ],
);

export const providerUsage = pgTable(
  "provider_usage",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    reportId: varchar("report_id", { length: 64 }),
    provider: varchar("provider", { length: 48 }).notNull(),
    operation: varchar("operation", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("ok"),
    latencyMs: integer("latency_ms"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: real("cost_usd").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("provider_usage_provider_idx").on(t.provider),
    index("provider_usage_created_idx").on(t.createdAt),
  ],
);

export const feedback = pgTable(
  "feedback",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    reportId: varchar("report_id", { length: 64 }),
    publicId: varchar("public_id", { length: 32 }),
    kind: varchar("kind", { length: 32 }).notNull(),
    message: text("message"),
    contact: varchar("contact", { length: 160 }),
    status: varchar("status", { length: 24 }).notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("feedback_status_idx").on(t.status)],
);

export const affiliateEvents = pgTable(
  "affiliate_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    reportId: varchar("report_id", { length: 64 }),
    retailer: varchar("retailer", { length: 96 }).notNull(),
    productRef: varchar("product_ref", { length: 160 }),
    destination: text("destination").notNull(),
    disclosed: boolean("disclosed").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("affiliate_events_created_idx").on(t.createdAt)],
);

export const businessAccounts = pgTable(
  "business_accounts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    organization: varchar("organization", { length: 160 }).notNull(),
    contactEmail: varchar("contact_email", { length: 200 }).notNull(),
    plan: varchar("plan", { length: 32 }).notNull().default("starter"),
    monthlyQuota: integer("monthly_quota").notNull().default(1000),
    usedThisMonth: integer("used_this_month").notNull().default(0),
    apiKeyPrefix: varchar("api_key_prefix", { length: 16 }),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const serviceFlags = pgTable(
  "service_flags",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    enabled: boolean("enabled").notNull().default(true),
    detail: text("detail"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    actor: varchar("actor", { length: 64 }).notNull().default("system"),
    action: varchar("action", { length: 96 }).notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_created_idx").on(t.createdAt)],
);

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    email: varchar("email", { length: 220 }).notNull(),
    interest: varchar("interest", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("newsletter_email_idx").on(t.email)],
);

export type VerificationReportRow = typeof verificationReports.$inferSelect;
export type EvidenceSourceRow = typeof evidenceSources.$inferSelect;
export type ReportFindingRow = typeof reportFindings.$inferSelect;
export type ProductCatalogRow = typeof productCatalog.$inferSelect;
