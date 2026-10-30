import { configureIdentity, identity, type AppIdentity, type PresenceItem, type RailItem } from "@/lib/identity";
import { setting } from "@/lib/settings";

/**
 * Server-side identity resolution (Worker code only).
 *
 * Every display name, operator detail and content list is an environment
 * variable; nothing about any particular company is baked into the code.
 * Unset values keep the neutral defaults from src/lib/identity.ts, so a fresh
 * deployment is a complete, unbranded product.
 *
 *   APP_NAME / APP_SHORT_NAME / APP_TAGLINE / APP_DESCRIPTION / APP_KEYWORDS
 *   SITE_URL          canonical origin, used for og:url, bots and cache keys
 *   SERVICE_NAME      machine id for /api/health and logs
 *   ROBO_NAME         name of the voice assistant
 *   REPORT_ID_PREFIX  public report references read <PREFIX>-XXXX-XXXX
 *   BOT_USER_AGENT    outbound fetches identify themselves with this
 *   ORG_ENTITY / ORG_JURISDICTION / ORG_REGISTRATION / ORG_TYPE / ORG_FORMED /
 *   ORG_WEBSITE / ORG_EMAIL / ORG_REGISTRY
 *                     operating-entity block in the footer; hidden unless
 *                     ORG_ENTITY is set
 *   CERTIFICATE_IMAGE base64 (or data: URL) image for the footer's secure
 *                     certificate viewer; hidden when unset
 *   SHOWCASE_SOURCE_URL / SHOWCASE_TITLE / SHOWCASE_SUBTITLE /
 *   SHOWCASE_CARD_CLASS / SHOWCASE_NAME_CLASS / SHOWCASE_ROLE_CLASS
 *                     live card rail scraped from any page you name
 *   RAIL_ITEMS        JSON [{"name":"…","note":"…"}] rolling name rail
 *   PRESENCE_ITEMS    JSON [{"name":"…","flag":"us"|"image URL"}] flags strip
 */

function parseList<T>(name: string): T[] {
  const raw = setting(name);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.filter((v) => v && typeof v === "object") as T[]) : [];
  } catch {
    return [];
  }
}

export function serverIdentity(): AppIdentity {
  const appName = setting("APP_NAME")?.trim();
  const siteUrl = setting("SITE_URL")?.trim().replace(/\/+$/, "") ?? "";
  const botUserAgent =
    setting("BOT_USER_AGENT")?.trim() ||
    `Mozilla/5.0 (compatible; ${(appName ?? "Universal-Identifier").replace(/\s+/g, "-")}/1.0${siteUrl ? `; +${siteUrl}/bot` : ""})`;

  const orgEntity = setting("ORG_ENTITY")?.trim();
  const website = setting("ORG_WEBSITE")?.trim();

  const presenceItems: PresenceItem[] = parseList<Record<string, unknown>>("PRESENCE_ITEMS").flatMap((item): PresenceItem[] => {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) return [];
    const flagRaw = typeof item.flag === "string" ? item.flag.trim() : "";
    // A flag is either a two-letter built-in renderer code or an image URL.
    if (/^https?:\/\//i.test(flagRaw)) return [{ name, image: flagRaw }];
    return [{ name, flag: flagRaw.toUpperCase().slice(0, 2) || undefined }];
  });

  const railItems: RailItem[] = parseList<Record<string, unknown>>("RAIL_ITEMS").flatMap((item) => {
    if (typeof item.name === "string" && item.name.trim()) {
      return [{ name: item.name.trim(), note: typeof item.note === "string" ? item.note.trim() : undefined }];
    }
    // ["name", "note"] tuples are accepted too.
    if (Array.isArray(item) && typeof item[0] === "string") {
      return [{ name: String(item[0]).trim(), note: typeof item[1] === "string" ? String(item[1]).trim() : undefined }];
    }
    return [];
  });

  return configureIdentity({
    appName: appName || undefined,
    shortName: setting("APP_SHORT_NAME")?.trim() || undefined,
    tagline: setting("APP_TAGLINE")?.trim() || undefined,
    description: setting("APP_DESCRIPTION")?.trim() || undefined,
    keywords: setting("APP_KEYWORDS")?.trim() || undefined,
    siteUrl,
    serviceName: setting("SERVICE_NAME")?.trim() || undefined,
    roboName: setting("ROBO_NAME")?.trim() || undefined,
    reportIdPrefix: setting("REPORT_ID_PREFIX")?.trim() || undefined,
    botUserAgent,
    org: orgEntity
      ? {
          entity: orgEntity,
          jurisdiction: setting("ORG_JURISDICTION")?.trim(),
          registration: setting("ORG_REGISTRATION")?.trim(),
          type: setting("ORG_TYPE")?.trim(),
          formed: setting("ORG_FORMED")?.trim(),
          website,
          websiteLabel: setting("ORG_WEBSITE_LABEL")?.trim() || (website ? website.replace(/^https?:\/\//, "").replace(/\/+$/, "") : undefined),
          email: setting("ORG_EMAIL")?.trim(),
          registry: setting("ORG_REGISTRY")?.trim(),
        }
      : null,
    certificateEnabled: Boolean(setting("CERTIFICATE_IMAGE")?.trim()),
    showcase: {
      sourceUrl: setting("SHOWCASE_SOURCE_URL")?.trim() ?? "",
      title: setting("SHOWCASE_TITLE")?.trim() ?? "Live Showcase",
      subtitle: setting("SHOWCASE_SUBTITLE")?.trim() ?? "",
      cardClass: setting("SHOWCASE_CARD_CLASS")?.trim() ?? "pioneer-card",
      nameClass: setting("SHOWCASE_NAME_CLASS")?.trim() ?? "pioneer-name",
      roleClass: setting("SHOWCASE_ROLE_CLASS")?.trim() ?? "pioneer-role",
    },
    railItems,
    presenceItems,
  });
}

let initialised = false;

/** Idempotent: resolves the identity from the environment once per isolate. */
export function initServerIdentity(): AppIdentity {
  if (!initialised) {
    serverIdentity();
    initialised = true;
  }
  return identity();
}
