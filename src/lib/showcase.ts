/**
 * Live showcase rail — cards read from a page the operator names.
 *
 * Nothing about the showcased people or projects is stored in this codebase.
 * The operator points SHOWCASE_SOURCE_URL at any HTTPS page that renders
 * repeating card blocks (a team page, a hall of fame, a partner list — the
 * markup classes are configurable: SHOWCASE_CARD_CLASS / SHOWCASE_NAME_CLASS /
 * SHOWCASE_ROLE_CLASS, defaulting to `pioneer-card` / `pioneer-name` /
 * `pioneer-role`). This module fetches that page on the server and parses the
 * cards. With no source configured the section simply does not render.
 */

import { identity } from "@/lib/identity";
import type { ShowcaseItem, ShowcasePayload } from "@/lib/types";
import { afterResponse } from "@/lib/request-scope";

export type { ShowcaseItem, ShowcasePayload };

const REVALIDATE_SECONDS = 600;
const MAX_ITEMS = 24;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeText(raw: string) {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parses cards out of the source HTML. A page that repeats its track for a seamless loop is de-duplicated by name. */
export function parseShowcase(html: string, base: string): ShowcaseItem[] {
  const { cardClass, nameClass, roleClass } = identity().showcase;
  const cardRe = new RegExp(`<li\\b[^>]*class="[^"]*\\b${escapeRe(cardClass)}\\b[^"]*"[^>]*>([\\s\\S]*?)</li>`, "g");
  const imgRe = /<img\b[^>]*\bsrc="([^"]+)"/;
  const nameRe = new RegExp(`class="[^"]*\\b${escapeRe(nameClass)}\\b[^"]*"[^>]*>([\\s\\S]*?)</`);
  const roleRe = new RegExp(`class="[^"]*\\b${escapeRe(roleClass)}\\b[^"]*"[^>]*>([\\s\\S]*?)</`);

  let origin = "";
  try {
    origin = new URL(base).origin;
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const items: ShowcaseItem[] = [];

  for (const [, card] of html.matchAll(cardRe)) {
    const src = card.match(imgRe)?.[1];
    const name = decodeText(card.match(nameRe)?.[1] ?? "");
    const role = decodeText(card.match(roleRe)?.[1] ?? "");
    if (!src || !name || seen.has(name.toLowerCase())) continue;

    // Photos must come from the source site itself over HTTPS.
    let photo: URL;
    try {
      photo = new URL(decodeText(src), base);
    } catch {
      continue;
    }
    if (photo.origin !== origin || photo.protocol !== "https:") continue;

    seen.add(name.toLowerCase());
    items.push({ name, role, photo: photo.toString() });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

export function showcaseConfigured(): boolean {
  return Boolean(identity().showcase.sourceUrl);
}

// Parsed cards are cached for REVALIDATE_SECONDS: in this isolate's memory (always), and in
// the platform's edge cache (shared by the data centre; active on a custom domain).
let memo: { at: number; payload: ShowcasePayload } | null = null;

function cacheKey(source: string): string {
  const base = identity().siteUrl || "https://showcase.cache.local";
  return `${base}/__cache/showcase?source=${encodeURIComponent(source)}`;
}

export async function fetchLiveShowcase(): Promise<ShowcasePayload> {
  const source = identity().showcase.sourceUrl;
  if (!source) throw new Error("SHOWCASE_SOURCE_URL is not configured");
  const key = cacheKey(source);
  if (memo && Date.now() - memo.at < REVALIDATE_SECONDS * 1000) return memo.payload;
  const cached = await caches.default.match(key).catch(() => undefined);
  if (cached) {
    const payload = (await cached.json()) as ShowcasePayload;
    memo = { at: Date.now(), payload };
    return payload;
  }
  const payload = await readSource(source);
  memo = { at: Date.now(), payload };
  afterResponse(
    caches.default.put(key, Response.json(payload, { headers: { "cache-control": `public, max-age=${REVALIDATE_SECONDS}` } })),
  );
  return payload;
}

async function readSource(source: string): Promise<ShowcasePayload> {
  const res = await fetch(source, {
    signal: AbortSignal.timeout(10000),
    headers: {
      "user-agent": identity().botUserAgent,
      accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`Showcase source answered HTTP ${res.status}`);

  const items = parseShowcase(await res.text(), res.url || source);
  if (items.length === 0) throw new Error("Showcase source returned no cards");

  return { source, fetchedAt: new Date().toISOString(), items };
}
