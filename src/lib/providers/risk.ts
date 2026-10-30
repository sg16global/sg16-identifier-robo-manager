import { identity } from "@/lib/identity";
import { DnsError, resolveCname, resolveMx, resolveNs, resolveSoa, resolveTxt } from "@/lib/security/doh";
import type { EvidenceSource, ProviderCall } from "@/lib/types";
import { disabled, meter } from "@/lib/providers/registry";
import { assertPublicResolution, parseUntrustedUrl, safeFetch } from "@/lib/security/url-guard";
import { foldHomoglyphs } from "@/lib/identifiers/checksums";
import { setting } from "@/lib/settings";
import {
  connectors,
  field,
  fieldArray,
  fieldString,
  runConnector,
  type ConnectorSpec,
} from "@/lib/connectors";

/**
 * Website & scam intelligence.
 *
 * Everything structural (hostname shape, TLD abuse rates, DNS posture, HTTP
 * probing behind the SSRF guard) runs locally. Everything that needs an
 * outside service — certificate-transparency logs, URL reputation — goes
 * through operator-configured connectors (src/lib/connectors.ts), so the
 * deployment picks its own sources anywhere in the world and the engine
 * degrades honestly when a slot is empty.
 */

export interface DnsProfile {
  hostname: string;
  registrableDomain: string;
  addresses: string[];
  soa?: { nsname: string; hostmaster: string; serial: number; refresh: number };
  nameServers: string[];
  mx: string[];
  txt: string[];
  spf?: string;
  dmarc?: string;
  cname?: string[];
  errors: string[];
}

const MULTI_PART_TLDS = [
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.au", "com.au", "org.au", "gov.au",
  "co.nz", "co.za", "com.br", "com.mx", "co.in", "com.tr", "com.sg", "com.hk", "com.tw",
  "co.jp", "or.jp", "ne.jp", "com.cn", "com.my", "co.id", "com.ph", "com.vn", "co.kr",
  "com.ar", "com.co", "com.ec", "com.uy", "co.ke", "com.ng", "com.gh", "com.eg",
];

export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  const lastThree = labels.slice(-3).join(".");
  return MULTI_PART_TLDS.includes(lastTwo) ? lastThree : lastTwo;
}

const RISKY_TLDS = new Map<string, number>([
  ["zip", 0.5], ["mov", 0.5], ["tk", 0.45], ["ml", 0.45], ["ga", 0.4], ["cf", 0.4],
  ["gq", 0.4], ["xyz", 0.2], ["top", 0.28], ["icu", 0.3], ["click", 0.35], ["link", 0.2],
  ["loan", 0.4], ["work", 0.22], ["rest", 0.2], ["country", 0.3], ["stream", 0.25],
  ["download", 0.3], ["win", 0.3], ["bid", 0.3], ["party", 0.28], ["racing", 0.25],
  ["review", 0.2], ["science", 0.22], ["cricket", 0.25], ["faith", 0.25], ["date", 0.2],
  ["accountant", 0.3], ["kim", 0.1], ["buzz", 0.18], ["cyou", 0.2], ["shop", 0.05],
]);

/**
 * URL-shortener and free-hosting domains are operator data (SHORTENER_HOSTS,
 * FREE_HOST_DOMAINS — comma lists): which services count as anonymising
 * depends on the region and ecosystem a deployment investigates. Nothing is
 * built in, so no vendor is privileged or implied.
 */
function csvSetting(name: string): string[] {
  return (setting(name) ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function shortenerAndFreeHosts(): string[] {
  return [...csvSetting("SHORTENER_HOSTS"), ...csvSetting("FREE_HOST_DOMAINS")];
}

export function isUrlShortenerOrFreeHost(hostname: string): string | null {
  const h = hostname.toLowerCase();
  return shortenerAndFreeHosts().find((d) => h === d || h.endsWith(`.${d}`)) ?? null;
}

export async function collectDnsProfile(hostname: string): Promise<DnsProfile> {
  const profile: DnsProfile = {
    hostname,
    registrableDomain: registrableDomain(hostname),
    addresses: [],
    nameServers: [],
    mx: [],
    txt: [],
    errors: [],
  };
  const resolution = await assertPublicResolution(hostname);
  profile.addresses = resolution.addresses;
  if (!resolution.ok) profile.errors.push(resolution.reason ?? "resolution failed");
  else if (resolution.unresolved) {
    profile.errors.push("A/AAAA: no DNS resolver configured (DNS_RESOLVERS); the name was not independently resolved");
  }

  const attempts: Array<[string, () => Promise<void>]> = [
    ["SOA", async () => {
      const soa = await resolveSoa(profile.registrableDomain);
      profile.soa = { nsname: soa.nsname, hostmaster: soa.hostmaster, serial: soa.serial, refresh: soa.refresh };
    }],
    ["NS", async () => { profile.nameServers = await resolveNs(profile.registrableDomain); }],
    ["MX", async () => {
      const mx = await resolveMx(profile.registrableDomain);
      profile.mx = mx.map((m) => `${m.priority} ${m.exchange}`);
    }],
    ["TXT", async () => {
      const txt = await resolveTxt(profile.registrableDomain);
      profile.txt = txt.map((parts) => parts.join(""));
      profile.spf = profile.txt.find((t) => t.startsWith("v=spf1"));
    }],
    ["DMARC", async () => {
      const dmarc = await resolveTxt(`_dmarc.${profile.registrableDomain}`);
      profile.dmarc = dmarc.map((p) => p.join("")).find((t) => t.startsWith("v=DMARC1"));
    }],
    ["CNAME", async () => { profile.cname = await resolveCname(hostname); }],
  ];

  await Promise.all(
    attempts.map(async ([label, fn]) => {
      try {
        await fn();
      } catch (error) {
        const code = error instanceof DnsError ? error.code : "";
        profile.errors.push(`${label}: ${code || (error as Error).message}`);
      }
    }),
  );
  return profile;
}

export interface TlsProfile {
  ok: boolean;
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  ageDays?: number;
  selfSigned?: boolean;
  sanCount?: number;
  error?: string;
  /** The certificate source could not be consulted (says nothing about the site). */
  unsupported?: boolean;
}

/*
 * Certificate details come from Certificate Transparency logs, not from a TLS
 * handshake: Workers cannot read a peer certificate, but browsers accept a
 * publicly trusted certificate only if it is logged in CT, so the host's
 * currently valid certificate (issuer, subject, validity, names) is read from
 * the logs. Which log services a deployment queries is configuration
 * (CT_CONNECTORS — any CT log front-end or search API that returns JSON).
 * A host with no valid logged certificate is one browsers would warn about.
 * If no connector is configured or none can be reached, that is a gap in
 * this check — reported as `unsupported` — not evidence about the site.
 */
const CT_MEMO_MS = 60 * 60 * 1000;
const ctMemo = new Map<string, { at: number; profile: TlsProfile }>();

interface CtEntry {
  issuer_name?: string;
  common_name?: string;
  name_value?: string;
  not_before?: string;
  not_after?: string;
}

function dnField(dn: string | undefined, key: "O" | "CN"): string | undefined {
  const value = dn?.match(new RegExp(`(?:^|,\\s*)${key}=("[^"]*"|[^,]*)`))?.[1];
  return value?.replace(/^"|"$/g, "").trim() || undefined;
}

/** CT timestamps are UTC; services differ on whether they carry a zone designator. */
function ctTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

function ctNames(entry: CtEntry): string[] {
  return [...new Set((entry.name_value ?? "").split("\n").map((n) => n.trim().toLowerCase()).filter(Boolean))];
}

/** Maps one connector's reply onto the canonical CT entry shape. */
function mapCtEntries(spec: ConnectorSpec, data: unknown): CtEntry[] {
  const map = spec.responseMap;
  const items = map.entries ? fieldArray(data, map.entries) : Array.isArray(data) ? data : [];
  const split = map.namesSplit ?? "\n";
  const namesPath = map.names ?? map.dnsNames ?? map.nameValue;
  const out: CtEntry[] = [];
  for (const item of items) {
    // The names field is either an array of strings or one delimited string.
    const namesRaw = namesPath ? field(item, namesPath) : undefined;
    const names = Array.isArray(namesRaw)
      ? namesRaw.map((n) => String(n).trim()).filter(Boolean)
      : typeof namesRaw === "string"
        ? namesRaw.split(split).map((n) => n.trim()).filter(Boolean)
        : [];
    const commonName = fieldString(item, map.commonName ?? map.cn ?? map.subject);
    out.push({
      issuer_name: fieldString(item, map.issuer ?? map.issuerName),
      common_name: commonName,
      name_value: names.length ? names.join("\n") : commonName ?? "",
      not_before: fieldString(item, map.notBefore ?? map.validFrom),
      not_after: fieldString(item, map.notAfter ?? map.validTo),
    });
  }
  return out;
}

/** Queries the configured CT connectors; the first usable answer wins. */
async function ctEntriesFor(identities: string[], host: string): Promise<CtEntry[]> {
  const configured = connectors("ct");
  if (!configured.length) throw new Error("no CT connector configured (CT_CONNECTORS)");
  const labels = host.split(".");
  const wildcard = labels.length > 2 ? `*.${labels.slice(1).join(".")}` : host;
  const errors: string[] = [];

  for (const spec of configured) {
    // A connector templated on {{identity}} is asked once per identity; one
    // templated on {{hostname}} answers for the host (and its wildcards) in a
    // single call.
    const perIdentity = spec.url.includes("{{identity}}") || spec.url.includes("{{ identity }}");
    const queries = perIdentity ? identities : [host];
    try {
      const lists: CtEntry[][] = [];
      for (const identityName of queries) {
        const data = await runConnector(spec, {
          identity: identityName,
          hostname: host,
          wildcard,
        }, { "user-agent": identity().botUserAgent });
        lists.push(mapCtEntries(spec, data));
      }
      const entries = lists.flat();
      if (entries.length) return entries;
      errors.push(`${spec.label} logged no certificate for ${host}`);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  throw new Error(errors.join("; ") || "CT lookup unavailable");
}

function ctFailure(error: unknown): string {
  const name = (error as { name?: string }).name;
  return name === "TimeoutError" || name === "AbortError" ? "no answer in time" : (error as Error).message;
}

export async function collectTlsProfile(hostname: string): Promise<TlsProfile> {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const memo = ctMemo.get(host);
  if (memo && Date.now() - memo.at < CT_MEMO_MS) return memo.profile;

  // A wildcard certificate for the parent domain also covers a one-label subdomain.
  const labels = host.split(".");
  const identities = labels.length > 2 ? [host, `*.${labels.slice(1).join(".")}`] : [host];

  let entries: CtEntry[];
  try {
    entries = await ctEntriesFor(identities, host);
  } catch (failure) {
    const profile: TlsProfile = { ok: false, unsupported: true, error: `Certificate Transparency lookup unavailable: ${ctFailure(failure)}` };
    ctMemo.set(host, { at: Date.now(), profile });
    return profile;
  }

  const now = Date.now();
  const covers = (name: string) =>
    name === host || (name.startsWith("*.") && host.endsWith(name.slice(1)) && name.split(".").length === labels.length);
  const valid = entries.filter((entry) => {
    const from = ctTime(entry.not_before);
    const to = ctTime(entry.not_after);
    return from !== undefined && to !== undefined && from <= now && to > now && ctNames(entry).some(covers);
  });

  let profile: TlsProfile;
  if (!valid.length) {
    profile = { ok: false, error: `no currently valid, publicly trusted certificate for ${host} is logged in Certificate Transparency` };
  } else {
    // The oldest still-valid certificate. CT logs a certificate before the site
    // deploys it, so the newest one is often not yet served. "Issued very
    // recently" then means every valid certificate for the host is new — the
    // pattern of a newly stood-up site. Certificates issued *for* the host
    // (subject CN) are preferred over ones that merely list it.
    const ownCertificates = valid.filter((entry) => covers((entry.common_name ?? "").toLowerCase()));
    const current = (ownCertificates.length ? ownCertificates : valid).reduce((a, b) =>
      ctTime(b.not_before)! < ctTime(a.not_before)! ? b : a,
    );
    const validFrom = ctTime(current.not_before)!;
    profile = {
      ok: true,
      issuer: dnField(current.issuer_name, "O") ?? dnField(current.issuer_name, "CN") ?? "unknown",
      subject: current.common_name ?? host,
      validFrom: new Date(validFrom).toISOString(),
      validTo: new Date(ctTime(current.not_after)!).toISOString(),
      ageDays: Math.round((now - validFrom) / 86400000),
      // Only certificates from publicly trusted CAs are logged in CT.
      selfSigned: false,
      sanCount: ctNames(current).length,
    };
  }
  ctMemo.set(host, { at: now, profile });
  return profile;
}

export interface ReputationResult {
  threats: string[];
  call: ProviderCall;
}

/**
 * URL reputation through operator-configured connectors (REPUTATION_CONNECTORS).
 * A connector's responseMap names where threats live:
 *   { "threats": "threat.threatTypes" }  — an array of category strings, or
 *   { "flagged": "malicious" }           — a boolean/verdict field, or
 *   { "verdict": "data.verdict" }        — a string verdict.
 * With no connector configured the report records that no commercial
 * reputation lookup was performed — never a guess.
 */
export async function lookupReputation(url: string, reportId?: string): Promise<ReputationResult> {
  const configured = connectors("reputation");
  if (!configured.length) {
    return {
      threats: [],
      call: disabled(
        "reputation",
        "reputation:lookup",
        "No reputation connector is configured (REPUTATION_CONNECTORS) — no external URL reputation lookup was performed.",
      ),
    };
  }
  const parsed = parseUntrustedUrl(url);
  if (!parsed.ok || !parsed.url) {
    return {
      threats: [],
      call: { provider: "reputation", operation: "reputation:lookup", status: "skipped", latencyMs: 0, costUsd: 0, detail: parsed.reason },
    };
  }

  const errors: string[] = [];
  for (const spec of configured) {
    try {
      const { data, call } = await meter(spec.id, "reputation:lookup", async () => {
        return runConnector(spec, {
          url: parsed.url!.toString(),
          hostname: parsed.url!.hostname,
        });
      }, { reportId, costOverride: spec.costPerCallUsd });

      const map = spec.responseMap;
      let threats = fieldArray(data, map.threats).map((t) => String(t));
      if (!threats.length && map.flagged) {
        const flagged = field(data, map.flagged);
        if (flagged === true || flagged === "true" || flagged === 1) threats = ["FLAGGED"];
      }
      if (!threats.length && map.verdict) {
        const verdict = fieldString(data, map.verdict);
        if (verdict && !/^(safe|clean|ok|good|benign)$/i.test(verdict)) threats = [verdict.toUpperCase()];
      }
      return { threats, call: { ...call, costUsd: spec.costPerCallUsd } };
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return {
    threats: [],
    call: {
      provider: configured[0].id,
      operation: "reputation:lookup",
      status: "error",
      latencyMs: 0,
      costUsd: 0,
      error: errors.join("; "),
    },
  };
}

export interface HttpProbe {
  ok: boolean;
  status?: number;
  finalUrl?: string;
  redirectChain: string[];
  server?: string;
  contentType?: string;
  poweredBy?: string;
  setCookieDomains?: string[];
  hsts?: boolean;
  titleSnippets: string[];
  credentialFormDetected: boolean;
  paymentKeywords: string[];
  reason?: string;
  bytes?: number;
}

/**
 * Irreversible-payment vocabulary. The built-in terms are generic (no vendor
 * names); operators extend them for their market with PAYMENT_TERMS (comma
 * list), e.g. the remittance rails, wallets and card brands their users are
 * actually asked to pay through.
 */
const GENERIC_PAYMENT_KEYWORDS = [
  "gift card", "prepaid card", "bitcoin", "usdt", "cryptocurrency payment", "crypto wallet",
  "wire transfer", "money transfer service", "irreversible payment",
];

function paymentKeywords(): string[] {
  return [...GENERIC_PAYMENT_KEYWORDS, ...csvSetting("PAYMENT_TERMS")];
}

/**
 * Fetches a submitted URL *only* through the SSRF guard. The body is treated as
 * untrusted data, never as instructions (prompt-injection defence, §8).
 */
export async function probeHttp(raw: string, reportId?: string): Promise<{ probe: HttpProbe; call: ProviderCall }> {
  const probe: HttpProbe = {
    ok: false,
    redirectChain: [],
    titleSnippets: [],
    credentialFormDetected: false,
    paymentKeywords: [],
  };
  try {
    const { data } = await meter("http-probe", "safeFetch", async () => {
      return safeFetch(raw, { maxRedirects: 3, timeoutMs: 8000, maxBytes: 256 * 1024 });
    }, { reportId, costOverride: 0 });

    probe.ok = data.ok;
    probe.status = data.status;
    probe.finalUrl = data.finalUrl;
    probe.redirectChain = data.redirectChain ?? [];
    probe.reason = data.reason;
    probe.bytes = data.bytes;
    const h = data.headers ?? {};
    probe.server = h["server"];
    probe.contentType = h["content-type"];
    probe.poweredBy = h["x-powered-by"];
    probe.hsts = Boolean(h["strict-transport-security"]);
    probe.setCookieDomains = (h["set-cookie"] ?? "").length ? [h["set-cookie"].slice(0, 200)] : [];

    if (data.body) {
      // Strip tags before any pattern matching so markup cannot fake a signal.
      const text = data.body
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const titleMatch = data.body.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
      const h1 = data.body.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/gi) ?? [];
      probe.titleSnippets = [titleMatch?.[1], ...h1.map((x) => x.replace(/<[^>]+>/g, ""))]
        .filter(Boolean)
        .map((s) => s!.replace(/\s+/g, " ").trim().slice(0, 160))
        .slice(0, 4);
      probe.credentialFormDetected = /<input[^>]+type=["']?password/i.test(data.body) &&
        /<form/i.test(data.body);
      const lower = text.toLowerCase();
      probe.paymentKeywords = paymentKeywords().filter((k) => lower.includes(k));
      probe.titleSnippets.push(text.slice(0, 240));
    }
    return { probe, call: { provider: "http-probe", operation: "safeFetch", status: data.ok ? "ok" : "error", latencyMs: 0, costUsd: 0, detail: data.reason } };
  } catch (error) {
    probe.reason = (error as Error).message;
    return {
      probe,
      call: { provider: "http-probe", operation: "safeFetch", status: "error", latencyMs: 0, costUsd: 0, error: (error as Error).message },
    };
  }
}

export function tldRiskScore(hostname: string): { tld: string; score: number; note: string } {
  const parts = hostname.toLowerCase().split(".");
  const tld = parts[parts.length - 1] ?? "";
  const score = RISKY_TLDS.get(tld) ?? 0;
  return {
    tld,
    score,
    note: score
      ? `The .${tld} TLD carries an elevated abuse rate in phishing corpora.`
      : `The .${tld} TLD is not on the elevated-abuse list used by this engine.`,
  };
}

// Words scam domains glue straight onto a brand ("paypalsecure", "dpdtrack").
const BRAND_AFFIXES = [
  "login", "signin", "secure", "verify", "account", "auth", "id", "support", "help", "care",
  "service", "online", "official", "update", "alert", "app", "store", "shop", "pay", "payment",
  "billing", "refund", "wallet", "bank", "delivery", "parcel", "track", "tracking", "customs",
];

/**
 * Whether `brand` appears in the hostname as a whole word: a label or a
 * hyphen-separated part ("brand-login", "brand-mail"), or glued to a common
 * scam word ("brandsecure"). Never as a fragment of an unrelated word ("x" is
 * not in example.com, "ups" not in groups.example.com, "chase" not in
 * purchase.com), and never in the public suffix ("gov" in service.gov.uk).
 * Brands come from the operator's configuration and catalogue — the function
 * itself is pure logic.
 */
export function hostnameHasBrand(hostname: string, brand: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  const registrable = registrableDomain(h);
  const suffix = registrable.slice(registrable.indexOf(".") + 1);
  const name = registrable.includes(".") ? h.slice(0, -(suffix.length + 1)) : h;
  const parts = name.split(/[.-]+/).filter(Boolean);
  const words = brand.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const compact = words.join("");
  return parts.some((part, i) => {
    if (part === compact) return true;
    if (words.length > 1 && parts.slice(i, i + words.length).join(" ") === words.join(" ")) return true;
    // Gluing is too loose for one- and two-letter brands ("x", "hp", "lg").
    return compact.length >= 3 && BRAND_AFFIXES.some((a) => part === compact + a || part === a + compact);
  });
}

export function hostnameDeceptionSignals(hostname: string, knownBrands: string[]): string[] {
  const signals: string[] = [];
  const h = hostname.toLowerCase();
  const folded = foldHomoglyphs(h);
  if (folded !== h.normalize("NFKC").toLowerCase()) {
    signals.push("Hostname contains characters that visually resemble other characters (homoglyph / IDN substitution risk).");
  }
  const labels = h.split(".");
  const main = labels.slice(0, -1).join(".");
  if (main.length > 25) signals.push(`Unusually long hostname label chain ("${main}").`);
  if ((h.match(/-/g) ?? []).length >= 2) signals.push("Multiple hyphens in the hostname — a common brand-impersonation pattern.");
  if (/\d{2,}/.test(main)) signals.push("Digits embedded in the brand portion of the hostname.");

  for (const brand of knownBrands) {
    if (hostnameHasBrand(h, brand)) continue;
    if (hostnameHasBrand(folded, brand)) {
      signals.push(`After homoglyph folding the hostname contains the brand "${brand}" but the raw hostname does not.`);
    }
    // brand appears as a subdomain of an unrelated registrable domain
    const registrable = registrableDomain(h);
    const regBody = registrable.split(".")[0];
    if (regBody !== brand && hostnameHasBrand(registrable, brand)) {
      signals.push(`"${brand}" is used as a subdomain of ${registrable}, not as the registered domain itself.`);
    }
  }
  return signals;
}

export function domainEvidence(profile: DnsProfile, tlsProfile: TlsProfile | null): EvidenceSource[] {
  const out: EvidenceSource[] = [];
  if (profile.addresses.length) {
    out.push({
      provider: "domain-intel",
      title: `DNS A/AAAA records for ${profile.hostname}`,
      excerpt: profile.addresses.join(", "),
      stance: "context",
      retrievedAt: new Date().toISOString(),
      trustTier: "official",
    });
  }
  if (profile.nameServers.length) {
    out.push({
      provider: "domain-intel",
      title: `Authoritative name servers for ${profile.registrableDomain}`,
      excerpt: profile.nameServers.join(", "),
      stance: "context",
      retrievedAt: new Date().toISOString(),
      trustTier: "official",
    });
  }
  if (profile.soa) {
    out.push({
      provider: "domain-intel",
      title: "SOA record",
      excerpt: `nsname=${profile.soa.nsname} · serial=${profile.soa.serial} · refresh=${profile.soa.refresh}s`,
      stance: "context",
      retrievedAt: new Date().toISOString(),
      trustTier: "official",
    });
  }
  out.push({
    provider: "domain-intel",
    title: "Email authentication posture",
    excerpt: `SPF: ${profile.spf ?? "absent"} · DMARC: ${profile.dmarc ?? "absent"} · MX: ${profile.mx.length ? profile.mx.join(", ") : "none"}`,
    stance: profile.spf && profile.dmarc ? "supports" : "context",
    retrievedAt: new Date().toISOString(),
    trustTier: "official",
  });
  if (tlsProfile?.ok) {
    out.push({
      provider: "domain-intel",
      title: `TLS certificate logged for ${profile.hostname}`,
      excerpt: `Subject CN=${tlsProfile.subject} · Issuer=${tlsProfile.issuer} · valid ${tlsProfile.validFrom?.slice(0, 10)} → ${tlsProfile.validTo?.slice(0, 10)} · ${tlsProfile.sanCount ?? 0} SAN(s)`,
      stance: tlsProfile.selfSigned ? "contradicts" : "context",
      retrievedAt: new Date().toISOString(),
      trustTier: "official",
    });
  }
  return out;
}
