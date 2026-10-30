/**
 * Deployment identity — every name, label and operator detail the product
 * shows, resolved in exactly one place.
 *
 * Nothing in this system is tied to a company: the code ships neutral
 * defaults, and a deployment configures its own identity through environment
 * variables (see .env.example). On the server the values come from the
 * environment (src/lib/identity-server.ts); in the browser the Worker injects
 * the resolved identity into the HTML shell, so the app and the API always
 * agree without a second request.
 *
 * This module is isomorphic: it must never import "cloudflare:workers".
 */

export interface OrgIdentity {
  entity: string;
  jurisdiction?: string;
  registration?: string;
  type?: string;
  formed?: string;
  website?: string;
  websiteLabel?: string;
  email?: string;
  /** Public registry where the registration can be checked. */
  registry?: string;
}

/** A live card rail scraped from an operator-named page (see src/lib/showcase.ts). */
export interface ShowcaseConfig {
  /** Empty = the section is not rendered. */
  sourceUrl: string;
  title: string;
  subtitle: string;
  /** CSS class names of the cards on the source page. */
  cardClass: string;
  nameClass: string;
  roleClass: string;
}

export interface RailItem {
  name: string;
  note?: string;
}

export interface PresenceItem {
  name: string;
  /** Built-in flag renderer code (two-letter country code), or… */
  flag?: string;
  /** …an image URL for any other flag/emblem. */
  image?: string;
}

export interface AppIdentity {
  appName: string;
  shortName: string;
  tagline: string;
  description: string;
  keywords: string;
  /** Canonical site URL ("https://…"), or empty when none is configured. */
  siteUrl: string;
  /** Machine-readable service id (health endpoint, logs). */
  serviceName: string;
  /** Name of the voice assistant mascot. */
  roboName: string;
  /** Public report references read `<PREFIX>-XXXX-XXXX`. */
  reportIdPrefix: string;
  botUserAgent: string;
  /** Operating-entity details for the footer; null hides the whole block. */
  org: OrgIdentity | null;
  /** True when the operator attached a certificate image (footer viewer). */
  certificateEnabled: boolean;
  showcase: ShowcaseConfig;
  railItems: RailItem[];
  presenceItems: PresenceItem[];
}

export const DEFAULT_IDENTITY: AppIdentity = {
  appName: "Universal Identifier",
  shortName: "Identifier",
  tagline: "Evidence before conclusion",
  description:
    "A free, self-hostable verification engine for products, news claims, websites and media. Every report shows its evidence, sources, confidence and limitations.",
  keywords:
    "verification engine,counterfeit check,fact check,scam website checker,image verification,identifier check,universal api gateway",
  siteUrl: "",
  serviceName: "universal-identifier",
  roboName: "Robo Manager",
  reportIdPrefix: "RPT",
  botUserAgent: "Mozilla/5.0 (compatible; Universal-Identifier/1.0)",
  org: null,
  certificateEnabled: false,
  showcase: {
    sourceUrl: "",
    title: "Live Showcase",
    subtitle: "Read live from the operator's source",
    cardClass: "pioneer-card",
    nameClass: "pioneer-name",
    roleClass: "pioneer-role",
  },
  railItems: [],
  presenceItems: [],
};

let current: AppIdentity = DEFAULT_IDENTITY;

/**
 * Replaces the active identity. Called once per isolate on the server (from
 * the environment) and once at boot in the browser (from the injected JSON).
 * Unknown or malformed fields fall back to the neutral defaults.
 */
export function configureIdentity(next: Partial<AppIdentity> | null | undefined): AppIdentity {
  current = sanitize({ ...DEFAULT_IDENTITY, ...(next ?? {}) });
  return current;
}

export function identity(): AppIdentity {
  return current;
}

function sanitize(value: AppIdentity): AppIdentity {
  const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);
  const prefix = str(value.reportIdPrefix, DEFAULT_IDENTITY.reportIdPrefix).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const appName = str(value.appName, DEFAULT_IDENTITY.appName);
  const org =
    value.org && typeof value.org === "object" && str(value.org.entity, "")
      ? {
          entity: str(value.org.entity, ""),
          jurisdiction: str(value.org.jurisdiction, "") || undefined,
          registration: str(value.org.registration, "") || undefined,
          type: str(value.org.type, "") || undefined,
          formed: str(value.org.formed, "") || undefined,
          website: str(value.org.website, "") || undefined,
          websiteLabel: str(value.org.websiteLabel, "") || undefined,
          email: str(value.org.email, "") || undefined,
          registry: str(value.org.registry, "") || undefined,
        }
      : null;
  const showcase: ShowcaseConfig = {
    sourceUrl: str(value.showcase?.sourceUrl, ""),
    title: str(value.showcase?.title, DEFAULT_IDENTITY.showcase.title),
    subtitle: str(value.showcase?.subtitle, DEFAULT_IDENTITY.showcase.subtitle),
    cardClass: str(value.showcase?.cardClass, DEFAULT_IDENTITY.showcase.cardClass),
    nameClass: str(value.showcase?.nameClass, DEFAULT_IDENTITY.showcase.nameClass),
    roleClass: str(value.showcase?.roleClass, DEFAULT_IDENTITY.showcase.roleClass),
  };
  const railItems = Array.isArray(value.railItems)
    ? value.railItems.filter((i) => i && typeof i.name === "string" && i.name.trim()).map((i) => ({ name: i.name.trim(), note: typeof i.note === "string" ? i.note : undefined }))
    : [];
  const presenceItems = Array.isArray(value.presenceItems)
    ? value.presenceItems
        .filter((i) => i && typeof i.name === "string" && i.name.trim())
        .map((i) => ({ name: i.name.trim(), flag: typeof i.flag === "string" ? i.flag : undefined, image: typeof i.image === "string" ? i.image : undefined }))
    : [];
  return {
    ...value,
    appName,
    shortName: str(value.shortName, appName.split(/\s+/)[0] ?? DEFAULT_IDENTITY.shortName),
    tagline: str(value.tagline, DEFAULT_IDENTITY.tagline),
    description: str(value.description, DEFAULT_IDENTITY.description),
    keywords: str(value.keywords, DEFAULT_IDENTITY.keywords),
    siteUrl: str(value.siteUrl, "").replace(/\/+$/, ""),
    serviceName: str(value.serviceName, DEFAULT_IDENTITY.serviceName),
    roboName: str(value.roboName, DEFAULT_IDENTITY.roboName),
    reportIdPrefix: prefix || DEFAULT_IDENTITY.reportIdPrefix,
    botUserAgent: str(value.botUserAgent, DEFAULT_IDENTITY.botUserAgent),
    org,
    certificateEnabled: Boolean(value.certificateEnabled),
    showcase,
    railItems,
    presenceItems,
  };
}

/** Validation pattern for public report references (`<PREFIX>-XXXX-XXXX`). */
export function reportIdPattern(prefix = current.reportIdPrefix): RegExp {
  const safe = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${safe}-[A-Z0-9]{4}-[A-Z0-9]{4}$`);
}

/** The identity as plain JSON, for injection into the HTML shell or /api/meta. */
export function identityJson(): AppIdentity {
  return { ...current, org: current.org ? { ...current.org } : null };
}
