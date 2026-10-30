import { setting } from "@/lib/settings";

/**
 * DNS over HTTPS (RFC 8484, JSON form) — the Workers replacement for node:dns.
 *
 * No resolver is built in. The operator lists the DoH endpoints this
 * deployment should use in DNS_RESOLVERS (comma-separated https URLs of any
 * RFC 8484 JSON resolvers: self-hosted CoreDNS/PowerDNS with a DoH front,
 * a resolver in your own cloud, or any public resolver you trust, in any
 * region). They are tried in order with per-query timeouts, so one slow or
 * unreachable resolver never takes resolution down. When none is configured,
 * DNS intelligence switches itself off and reports say so honestly.
 *
 * Failures carry the same error codes node:dns used (ENOTFOUND, ENODATA,
 * ESERVFAIL, ETIMEOUT), so the text that reaches reports is stable.
 */

/** Configured resolver endpoints, in priority order. */
export function dnsResolvers(): string[] {
  return (setting("DNS_RESOLVERS") ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\//i.test(s));
}

export function dnsConfigured(): boolean {
  return dnsResolvers().length > 0;
}

const TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, MX: 15, TXT: 16, AAAA: 28 } as const;
export type RecordType = keyof typeof TYPES;

export class DnsError extends Error {
  constructor(
    readonly code: "ENOTFOUND" | "ENODATA" | "ESERVFAIL" | "ETIMEOUT" | "EREFUSED" | "EBADRESP" | "EUNCONFIGURED",
    hostname: string,
  ) {
    super(`query ${code} ${hostname}`);
    this.name = "DnsError";
  }
}

interface DohResponse {
  Status: number;
  Answer?: Array<{ name: string; type: number; TTL: number; data: string }>;
}

async function askResolver(endpoint: string, hostname: string, type: RecordType, timeoutMs: number): Promise<DohResponse> {
  const url = `${endpoint}?name=${encodeURIComponent(hostname)}&type=${type}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new DnsError("ESERVFAIL", hostname);
    return (await res.json()) as DohResponse;
  } catch (error) {
    if (error instanceof DnsError) throw error;
    const name = (error as { name?: string }).name;
    throw new DnsError(name === "TimeoutError" || name === "AbortError" ? "ETIMEOUT" : "EBADRESP", hostname);
  }
}

/** Raw answer strings of one type ("10 mx.example.com.", "\"v=spf1 -all\"", …). Throws DnsError. */
export async function resolveRaw(hostname: string, type: RecordType, timeoutMs = 4000): Promise<string[]> {
  const resolvers = dnsResolvers();
  if (!resolvers.length) throw new DnsError("EUNCONFIGURED", hostname);

  let body: DohResponse | null = null;
  let lastError: DnsError | null = null;
  for (const endpoint of resolvers) {
    try {
      body = await askResolver(endpoint, hostname, type, timeoutMs);
      break;
    } catch (error) {
      lastError = error instanceof DnsError ? error : new DnsError("EBADRESP", hostname);
      // An authoritative answer from any resolver wins; transport failures fail over.
      if (lastError.code !== "ETIMEOUT" && lastError.code !== "EBADRESP" && lastError.code !== "ESERVFAIL") {
        // REFUSED by one resolver may be accepted by another — keep trying.
      }
    }
  }
  if (!body) throw lastError ?? new DnsError("ESERVFAIL", hostname);

  // RCODEs: 0 NOERROR, 2 SERVFAIL, 3 NXDOMAIN, 5 REFUSED.
  if (body.Status === 3) throw new DnsError("ENOTFOUND", hostname);
  if (body.Status === 5) throw new DnsError("EREFUSED", hostname);
  if (body.Status !== 0) throw new DnsError("ESERVFAIL", hostname);
  // Answers can include the CNAME chain that led to the records asked for.
  const answers = (body.Answer ?? []).filter((a) => a.type === TYPES[type]).map((a) => a.data);
  if (!answers.length) throw new DnsError("ENODATA", hostname);
  return answers;
}

const stripDot = (name: string) => name.replace(/\.$/, "");

/** Every A and AAAA address of a hostname (what node:dns lookup({ all: true }) returns). */
export async function lookupAll(hostname: string): Promise<string[]> {
  const [v4, v6] = await Promise.allSettled([resolveRaw(hostname, "A"), resolveRaw(hostname, "AAAA")]);
  const addresses = [...(v4.status === "fulfilled" ? v4.value : []), ...(v6.status === "fulfilled" ? v6.value : [])];
  if (addresses.length) return addresses;
  const failure = [v4, v6].find((r): r is PromiseRejectedResult => r.status === "rejected" && (r.reason as DnsError).code !== "ENODATA");
  throw failure ? failure.reason : new DnsError("ENODATA", hostname);
}

export async function resolveNs(hostname: string): Promise<string[]> {
  return (await resolveRaw(hostname, "NS")).map(stripDot);
}

export async function resolveCname(hostname: string): Promise<string[]> {
  return (await resolveRaw(hostname, "CNAME")).map(stripDot);
}

export async function resolveMx(hostname: string): Promise<Array<{ priority: number; exchange: string }>> {
  return (await resolveRaw(hostname, "MX")).map((data) => {
    const [priority, exchange = ""] = data.split(/\s+/);
    return { priority: Number(priority), exchange: stripDot(exchange) };
  });
}

/** Each TXT record as its character-strings, as node:dns resolveTxt returns them. */
export async function resolveTxt(hostname: string): Promise<string[][]> {
  return (await resolveRaw(hostname, "TXT")).map((data) => {
    const parts = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
    return parts.length ? parts : [data];
  });
}

export async function resolveSoa(hostname: string): Promise<{ nsname: string; hostmaster: string; serial: number; refresh: number }> {
  const [data] = await resolveRaw(hostname, "SOA");
  const [nsname = "", hostmaster = "", serial = "0", refresh = "0"] = data.split(/\s+/);
  return { nsname: stripDot(nsname), hostmaster: stripDot(hostmaster), serial: Number(serial), refresh: Number(refresh) };
}
