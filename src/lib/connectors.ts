import { pick } from "@/lib/universal/adapters/custom";
import { setting } from "@/lib/settings";

/**
 * Universal connector framework — every external evidence source is described
 * by configuration, never by code.
 *
 * The verification engine needs four kinds of outside input, and which
 * services supply them is an operational decision that differs per deployment
 * and per country. Each is a *capability slot* filled by zero or more
 * connectors, declared as JSON in one environment variable:
 *
 *   SEARCH_CONNECTORS       web search → corroborating sources        ({{query}})
 *   FACTCHECK_CONNECTORS    published claim reviews                   ({{query}}, {{language}}, {{page_size}})
 *   REPUTATION_CONNECTORS   URL threat/reputation lookups             ({{url}}, {{hostname}})
 *   CT_CONNECTORS           certificate-transparency log lookups      ({{identity}}, {{hostname}}, {{wildcard}})
 *
 * A connector is a plain declarative HTTP call — any JSON API, public or
 * private, on any continent:
 *
 *   {
 *     "id": "search-one",                  // referenced in reports & console
 *     "label": "Primary search",
 *     "method": "POST",                    // default GET
 *     "url": "https://search.example.net/api",   // {{placeholders}} + ${ENV_VARS}
 *     "headers": { "x-key": "${SEARCH_KEY}" },   // secrets by env-var name only
 *     "body": { "q": "{{query}}", "n": "{{max_results}}" },
 *     "responseMap": { "results": "data.hits", "title": "heading", "url": "link",
 *                      "snippet": "body", "publishedAt": "date", "answer": "summary" },
 *     "timeoutMs": 10000, "costPerCallUsd": 0.004
 *   }
 *
 * `responseMap` values are dot paths into the reply JSON; array items address
 * their own fields relative to the item ("publisher.name"). Secrets never
 * appear in the config itself — `${NAME}` resolves from the environment, and
 * a missing variable disables that connector with a visible reason instead of
 * failing silently. When a slot has no connector (or all of them fail), the
 * engine records an honest "not configured / unavailable" provider call and
 * abstains — the same graceful degradation the engine has always had.
 */

export type Capability = "search" | "factcheck" | "reputation" | "ct";

const CAPABILITY_ENV: Record<Capability, string> = {
  search: "SEARCH_CONNECTORS",
  factcheck: "FACTCHECK_CONNECTORS",
  reputation: "REPUTATION_CONNECTORS",
  ct: "CT_CONNECTORS",
};

export interface ConnectorSpec {
  id: string;
  label: string;
  capability: Capability;
  method: "GET" | "POST";
  /** URL template; `{{placeholder}}` is filled per call, `${ENV}` from the environment. */
  url: string;
  headers: Record<string, string>;
  /** JSON body template (POST); same placeholder rules as the URL. */
  body?: unknown;
  /** Dot paths into the reply; meaning depends on the capability (see the readers). */
  responseMap: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
  costPerCallUsd: number;
}

export interface ConnectorStatus {
  id: string;
  label: string;
  capability: Capability;
  enabled: boolean;
  reason: string | null;
}

interface RawEntry {
  id?: unknown;
  label?: unknown;
  method?: unknown;
  url?: unknown;
  headers?: unknown;
  body?: unknown;
  responseMap?: unknown;
  timeoutMs?: unknown;
  maxBytes?: unknown;
  costPerCallUsd?: unknown;
  enabled?: unknown;
}

function envValue(name: string): string | undefined {
  const value = setting(name)?.trim();
  return value ? value : undefined;
}

/** `${NAME}` placeholders resolve from the environment; a missing one is recorded. */
function interpolate(value: string, missing: Set<string>): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => {
    const resolved = envValue(name);
    if (resolved === undefined) missing.add(name);
    return resolved ?? "";
  });
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

function stringRecord(value: unknown, missing: Set<string>): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k.toLowerCase()] = interpolate(v, missing);
    else if (typeof v === "number") out[k.toLowerCase()] = String(v);
  }
  return out;
}

function parseSpec(entry: RawEntry, capability: Capability, index: number): { spec: ConnectorSpec | null; status: ConnectorStatus } {
  const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim().toLowerCase() : `${capability}-${index + 1}`;
  const label = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : id;
  const base = { id, label, capability };
  const missing = new Set<string>();

  const rawUrl = typeof entry.url === "string" ? entry.url.trim() : "";
  const method = String(entry.method ?? "GET").toUpperCase() === "POST" ? "POST" : "GET";
  const responseMap: Record<string, string> = {};
  if (entry.responseMap && typeof entry.responseMap === "object" && !Array.isArray(entry.responseMap)) {
    for (const [k, v] of Object.entries(entry.responseMap)) if (typeof v === "string" && v.trim()) responseMap[k] = v.trim();
  }

  let reason: string | null = null;
  let url = "";
  if (entry.enabled === false) reason = "Disabled in configuration";
  else if (!ID_RE.test(id)) reason = "id must be lowercase letters, digits and dashes";
  else if (!rawUrl) reason = "url is required";
  else {
    url = interpolate(rawUrl, missing);
    // Validate the shape with placeholders neutralised (they are filled per call).
    const probe = url.replace(/\{\{\s*\w+\s*\}\}/g, "x");
    try {
      const parsed = new URL(probe);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") reason = `${parsed.protocol} URLs are not supported`;
      else if (parsed.username || parsed.password) reason = "credentials belong in headers as ${ENV_VARS}, not in the URL";
    } catch {
      reason = `"${rawUrl.slice(0, 120)}" is not an absolute URL template`;
    }
  }
  if (!reason && missing.size) reason = `Missing environment variables: ${[...missing].join(", ")}`;

  const spec: ConnectorSpec | null = reason
    ? null
    : {
        id,
        label,
        capability,
        method,
        url,
        headers: stringRecord(entry.headers, missing),
        body: entry.body,
        responseMap,
        timeoutMs: typeof entry.timeoutMs === "number" && entry.timeoutMs > 0 ? Math.min(entry.timeoutMs, 60_000) : 10_000,
        maxBytes: typeof entry.maxBytes === "number" && entry.maxBytes > 0 ? Math.min(entry.maxBytes, 8 * 1024 * 1024) : 4 * 1024 * 1024,
        costPerCallUsd: typeof entry.costPerCallUsd === "number" && entry.costPerCallUsd >= 0 ? entry.costPerCallUsd : 0,
      };
  if (spec && missing.size) {
    // A secret referenced only from headers/body may still be missing.
    return { spec: null, status: { ...base, enabled: false, reason: `Missing environment variables: ${[...missing].join(", ")}` } };
  }
  return { spec, status: { ...base, enabled: reason === null, reason } };
}

interface ConnectorSet {
  specs: ConnectorSpec[];
  statuses: ConnectorStatus[];
  configError: string | null;
}

const cache = new Map<Capability, ConnectorSet>();

function readCapability(capability: Capability): ConnectorSet {
  const cached = cache.get(capability);
  if (cached) return cached;

  const specs: ConnectorSpec[] = [];
  const statuses: ConnectorStatus[] = [];
  let configError: string | null = null;
  const envName = CAPABILITY_ENV[capability];
  const raw = envValue(envName);

  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      configError = `${envName} is not valid JSON (${(error as Error).message})`;
      parsed = null;
    }
    const entries: RawEntry[] = Array.isArray(parsed)
      ? (parsed.filter((e) => e && typeof e === "object") as RawEntry[])
      : parsed && typeof parsed === "object"
        ? Object.entries(parsed as Record<string, unknown>).map(([id, e]) => ({ ...(e as RawEntry), id }))
        : [];
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      const { spec, status } = parseSpec(entry, capability, index);
      if (seen.has(status.id)) {
        statuses.push({ ...status, enabled: false, reason: `Duplicate connector id "${status.id}"` });
        return;
      }
      seen.add(status.id);
      statuses.push(status);
      if (spec) specs.push(spec);
    });
  }

  const set = { specs, statuses, configError };
  cache.set(capability, set);
  return set;
}

/** Enabled connectors of one capability, in configured order (first success wins). */
export function connectors(capability: Capability): ConnectorSpec[] {
  return readCapability(capability).specs;
}

export function connectorStatuses(capability?: Capability): ConnectorStatus[] {
  const capabilities = capability ? [capability] : (Object.keys(CAPABILITY_ENV) as Capability[]);
  return capabilities.flatMap((c) => readCapability(c).statuses);
}

export function connectorConfigErrors(): string[] {
  return (Object.keys(CAPABILITY_ENV) as Capability[])
    .map((c) => readCapability(c).configError)
    .filter((e): e is string => Boolean(e));
}

/* -------------------------------- execution -------------------------------- */

/** Values a call fills into `{{placeholders}}` in the URL and body template. */
export type ConnectorVars = Record<string, string | number | undefined>;

function fillText(template: string, vars: ConnectorVars): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** Fills a JSON body template; a value that is exactly one placeholder keeps its JSON type. */
function fillBody(template: unknown, vars: ConnectorVars): unknown {
  if (typeof template === "string") {
    const whole = /^\{\{\s*(\w+)\s*\}\}$/.exec(template);
    if (whole) {
      const value = vars[whole[1]];
      return value === undefined ? undefined : value;
    }
    return fillText(template, vars);
  }
  if (Array.isArray(template)) return template.map((item) => fillBody(item, vars)).filter((v) => v !== undefined);
  if (template && typeof template === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template)) {
      const filled = fillBody(value, vars);
      if (filled !== undefined) out[key] = filled;
    }
    return out;
  }
  return template;
}

export class ConnectorError extends Error {
  constructor(message: string, readonly fatal = false) {
    super(message);
    this.name = "ConnectorError";
  }
}

/**
 * Runs one connector call and returns the parsed JSON. Timeouts, HTTP errors,
 * size limits and malformed JSON all surface as ConnectorError so callers can
 * try the next connector or record an honest failure.
 */
export async function runConnector(
  spec: ConnectorSpec,
  vars: ConnectorVars,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  let url: URL;
  try {
    url = new URL(fillText(spec.url, vars));
  } catch {
    throw new ConnectorError(`${spec.label}: the URL template did not produce a valid URL`, true);
  }
  const init: RequestInit = {
    method: spec.method,
    signal: AbortSignal.timeout(spec.timeoutMs),
    headers: { accept: "application/json", ...spec.headers, ...extraHeaders },
  };
  if (spec.method === "POST") {
    const body = fillBody(spec.body ?? {}, vars);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
    init.body = JSON.stringify(body ?? {});
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (error) {
    const name = (error as { name?: string })?.name;
    throw new ConnectorError(
      name === "TimeoutError" || name === "AbortError"
        ? `${spec.label} did not answer within ${Math.round(spec.timeoutMs / 1000)}s`
        : `${spec.label} is unreachable: ${(error as Error).message}`,
    );
  }
  if (!res.ok) throw new ConnectorError(`${spec.label} responded ${res.status}`);
  const text = await res.text();
  if (text.length > spec.maxBytes) throw new ConnectorError(`${spec.label} returned more than can be inspected`);
  try {
    return JSON.parse(text || "null");
  } catch {
    throw new ConnectorError(`${spec.label} did not return JSON`);
  }
}

/** Dot-path read into a connector reply ("data.hits", "publisher.name", "0.id"). */
export function field(data: unknown, path: string | undefined): unknown {
  return path ? pick(data, path) : undefined;
}

export function fieldString(data: unknown, path: string | undefined): string | undefined {
  const value = field(data, path);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function fieldArray(data: unknown, path: string | undefined): unknown[] {
  const value = field(data, path);
  return Array.isArray(value) ? value : [];
}
