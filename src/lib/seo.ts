import { identity } from "@/lib/identity";
import { legalDocs } from "@/content/legal";
import { toolPages } from "@/content/tools";

/**
 * Per-route document metadata, shared by the Worker (which writes it into the
 * HTML shell, so search engines and link previews see it without running JS)
 * and the app (which keeps document.title right as visitors navigate).
 *
 * Every string is built from the deployment's configured identity
 * (src/lib/identity.ts) — no product or company name is hardcoded here.
 */

const INDEX = "index, follow";
const NO_INDEX = "noindex, nofollow";

export function siteName(): string {
  return identity().appName;
}

export function defaultTitle(): string {
  return `${identity().appName} — ${identity().tagline}`;
}

export function defaultDescription(): string {
  return identity().description;
}

export interface PageMeta {
  /** Full <title> text. */
  title: string;
  description: string;
  robots: string;
  /** 404 for paths no route renders. */
  status: 200 | 404;
}

/** Page titles use the root layout's template. */
export function pageTitle(title?: string): string {
  return title ? `${title} · ${siteName()}` : defaultTitle();
}

function meta(title: string | undefined, description?: string, robots = INDEX, status: 200 | 404 = 200): PageMeta {
  return { title: pageTitle(title), description: description ?? defaultDescription(), robots, status };
}

/** Metadata for a pathname; report pages get their verdict-specific title once the report is read. */
export function routeMeta(pathname: string): PageMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  const STATIC: Record<string, PageMeta> = {
    "/": meta(undefined),
    "/identify": meta(
      "Identify — universal verification console",
      `Submit text, a URL, a product identifier or an image and receive an evidence-backed ${identity().appName} verification report with findings, sources, confidence and limitations.`,
    ),
    "/business": meta(
      "Business verification & API",
      `Business services for ${identity().appName}: bulk product checks, domain monitoring, private dashboards and a metered verification API.`,
    ),
    "/blueprint": meta(
      "Project blueprint",
      `The complete ${identity().appName} specification: product vision, services, architecture, API and data-source strategy, database design, security, operating costs, roadmap, deployment, quality metrics and risk register.`,
    ),
    "/admin": meta(
      "Operator console",
      `${identity().appName} operator console: service health, provider cost, corrections queue and emergency switches.`,
      NO_INDEX,
    ),
  };

  const exact = STATIC[path];
  if (exact) return exact;

  const [, section, slug, extra] = path.split("/");
  if (slug && extra === undefined) {
    const key = decodeURIComponent(slug);
    if (section === "legal") {
      const doc = legalDocs()[key];
      return doc ? meta(doc.title, doc.lede.slice(0, 170)) : meta("Document not found", undefined, NO_INDEX, 404);
    }
    if (section === "tools") {
      const page = toolPages()[key];
      return page
        ? meta(`${page.title} — ${page.eyebrow.split("— ")[1] ?? page.eyebrow}`, page.lede.slice(0, 180))
        : meta("Module not found", undefined, NO_INDEX, 404);
    }
    if (section === "report") return meta("Report", undefined, NO_INDEX);
  }
  return meta("Page not found", undefined, NO_INDEX, 404);
}
