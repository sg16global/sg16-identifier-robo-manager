import { env } from "cloudflare:workers";
import { GatewayError } from "@/lib/universal/types";
import { setting } from "@/lib/settings";

/**
 * Universal model registry — any server in the world, addressed one way.
 *
 * No provider list is built in. A model is named `<provider>/<model>` (e.g.
 * `acme/risk-large`, `campus/llama-8b`, `default/gpt-mini`), and every
 * provider comes from the operator's own configuration:
 *
 *  1. MODEL_PROVIDERS (JSON): any number of servers, anywhere — public clouds,
 *     national or regional endpoints, self-hosted inference (vLLM, Ollama,
 *     LM Studio, TGI…), internal platforms, or any JSON API at all. Each entry
 *     names a wire protocol:
 *       "chat-completions"  the de-facto standard chat JSON API
 *                           (POST {baseUrl}/chat/completions, choices[]…)
 *       "messages"          the content-block chat JSON API
 *                           (POST {baseUrl}/messages, system + content[]…)
 *       "generate-content"  the resource-style chat JSON API
 *                           (POST {baseUrl}/models/{model}:generateContent…)
 *       "custom"            ANY other JSON API: a request template plus
 *                           dot-path response mapping describe the server
 *       "binding"           the hosting platform's inference binding
 *                           (e.g. "ai" in wrangler.jsonc) — no key, no URL
 *     Secrets are referenced by env-var name (`apiKeyEnv`, `${NAME}` inside
 *     header, query and URL values), so no credential ever appears in config.
 *  2. The AI_* quick settings define one server without JSON at all:
 *     AI_BASE_URL + AI_API_KEY + AI_MODEL (any chat-completions endpoint, or
 *     another protocol with AI_PROTOCOL). It becomes the provider "default".
 *
 * A caller that names its own server (x-gateway-base-url) bypasses this
 * registry entirely: the request is forwarded untouched
 * (src/worker/passthrough.ts). Nothing here is tied to a company, a region or
 * a vendor: whatever URL the operator configures is what gets called.
 */

export type Protocol = "chat-completions" | "messages" | "generate-content" | "binding" | "custom";

/** How to talk to a JSON API that follows none of the standard protocols. */
export interface CustomProtocol {
  /** Appended to baseUrl; the request is a POST with a JSON body. */
  path: string;
  /** The JSON body, with {{model}}, {{messages}}, {{prompt}}, {{system}}, {{last_user}}, {{max_tokens}}, {{temperature}}, {{top_p}}, {{stop}}. */
  requestTemplate: unknown;
  /** Dot paths into the JSON reply (e.g. "result.text", "choices.0.text"). */
  responseMap: { content?: string; promptTokens?: string; completionTokens?: string };
}

export interface ModelSpec {
  id: string;
  inputPerM?: number;
  outputPerM?: number;
}

export interface ProviderSpec {
  id: string;
  label: string;
  protocol: Protocol;
  baseUrl: string;
  apiKey?: string;
  authHeader: string;
  authScheme: string;
  /** Query parameter that carries the API key (servers that authenticate in the URL). */
  authQuery?: string;
  /** Platform binding name when protocol is "binding". */
  binding?: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  models: ModelSpec[];
  defaultModel?: string;
  /** Metering rates in USD per million tokens. */
  inputPerM: number;
  outputPerM: number;
  /** Chat protocols: send response_format json_object for structured internal calls. */
  jsonMode: boolean;
  /** chat-completions: ask for stream_options.include_usage so streams can be metered exactly. */
  streamUsage: boolean;
  /** messages protocol: forward temperature/top_p (some servers reject them). */
  sampling: boolean;
  /** Ask the provider for its live model list in /v1/models. */
  listModels: boolean;
  timeoutMs: number;
  docsUrl?: string;
  /** Set when protocol is "custom". */
  custom?: CustomProtocol;
  source: "config" | "env";
}

export interface ProviderStatus {
  id: string;
  label: string;
  protocol: Protocol;
  enabled: boolean;
  reason: string | null;
  source: ProviderSpec["source"];
  defaultModel: string | null;
  docsUrl: string | null;
}

export interface Route {
  provider: ProviderSpec;
  /** The provider's own model id. */
  model: string;
  /** `<provider>/<model>`, as clients address it. */
  id: string;
  inputPerM: number;
  outputPerM: number;
}

const PROTOCOLS = new Set<Protocol>(["chat-completions", "messages", "generate-content", "binding", "custom"]);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DEFAULT_TIMEOUT_MS = 60_000;

/** Wire-format defaults, so a minimal config entry still authenticates sanely. */
const PROTOCOL_DEFAULTS: Record<Exclude<Protocol, "binding">, { authHeader: string; authScheme: string }> = {
  "chat-completions": { authHeader: "authorization", authScheme: "Bearer" },
  messages: { authHeader: "x-api-key", authScheme: "" },
  "generate-content": { authHeader: "x-api-key", authScheme: "" },
  custom: { authHeader: "authorization", authScheme: "Bearer" },
};

function envValue(name: string): string | undefined {
  const value = setting(name)?.trim();
  return value ? value : undefined;
}

function firstEnv(names: string[]): { name: string; value: string } | undefined {
  for (const name of names) {
    const value = envValue(name);
    if (value) return { name, value };
  }
  return undefined;
}

function rate(name: string, fallback: number): number {
  const raw = envValue(name);
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** `${NAME}` placeholders resolve from the environment; a missing one is an error, not an empty string. */
function interpolate(value: string, missing: Set<string>): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => {
    const resolved = envValue(name);
    if (resolved === undefined) missing.add(name);
    return resolved ?? "";
  });
}

function trimBase(url: string) {
  return url.replace(/\/+$/, "");
}

/**
 * Operator-configured URLs are trusted as given — public, internal or local,
 * on any continent (localhost model servers in development, private hosts
 * reached through a tunnel, regional clouds). They only need to be absolute
 * http(s) URLs without embedded credentials.
 */
export function checkProviderUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `"${raw}" is not an absolute URL`;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return `${url.protocol} URLs are not supported`;
  if (url.username || url.password) return "credentials belong in apiKeyEnv, not in the URL";
  return null;
}

type CustomEntry = {
  id?: unknown;
  label?: unknown;
  protocol?: unknown;
  baseUrl?: unknown;
  apiKeyEnv?: unknown;
  authHeader?: unknown;
  authScheme?: unknown;
  authQuery?: unknown;
  binding?: unknown;
  headers?: unknown;
  query?: unknown;
  models?: unknown;
  defaultModel?: unknown;
  inputPerM?: unknown;
  outputPerM?: unknown;
  jsonMode?: unknown;
  streamUsage?: unknown;
  sampling?: unknown;
  listModels?: unknown;
  timeoutMs?: unknown;
  enabled?: unknown;
  docsUrl?: unknown;
  path?: unknown;
  requestTemplate?: unknown;
  responseMap?: unknown;
};

function customProtocol(entry: CustomEntry): CustomProtocol {
  const map = entry.responseMap && typeof entry.responseMap === "object" ? (entry.responseMap as Record<string, unknown>) : {};
  const path = (key: string) => (typeof map[key] === "string" ? (map[key] as string) : undefined);
  return {
    path: typeof entry.path === "string" ? entry.path : "",
    requestTemplate: entry.requestTemplate,
    responseMap: { content: path("content"), promptTokens: path("promptTokens"), completionTokens: path("completionTokens") },
  };
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === "string" || typeof v === "number") out[k] = String(v);
  return out;
}

function modelList(value: unknown): ModelSpec[] {
  if (!Array.isArray(value)) return [];
  const out: ModelSpec[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) out.push({ id: item.trim() });
    else if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
      const spec = item as { id: string; inputPerM?: unknown; outputPerM?: unknown };
      out.push({
        id: spec.id.trim(),
        inputPerM: typeof spec.inputPerM === "number" ? spec.inputPerM : undefined,
        outputPerM: typeof spec.outputPerM === "number" ? spec.outputPerM : undefined,
      });
    }
  }
  return out;
}

function configuredEntries(): { entries: CustomEntry[]; error?: string } {
  const raw = envValue("MODEL_PROVIDERS");
  if (!raw) return { entries: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return { entries: parsed.filter((e) => e && typeof e === "object") as CustomEntry[] };
    if (parsed && typeof parsed === "object") {
      return { entries: Object.entries(parsed).map(([id, e]) => ({ ...(e as CustomEntry), id })) };
    }
    return { entries: [], error: "MODEL_PROVIDERS must be a JSON array or object" };
  } catch (error) {
    return { entries: [], error: `MODEL_PROVIDERS is not valid JSON (${(error as Error).message})` };
  }
}

/** The AI_* quick settings, as one provider entry named "default". */
function quickEntry(): CustomEntry | null {
  const baseUrl = envValue("AI_BASE_URL");
  const binding = envValue("AI_BINDING");
  if (!baseUrl && !binding) return null;
  const protocol = envValue("AI_PROTOCOL");
  return {
    id: envValue("AI_PROVIDER_ID") ?? "default",
    label: envValue("AI_LABEL") ?? "Default model server",
    protocol: binding && !protocol ? "binding" : protocol ?? "chat-completions",
    baseUrl,
    binding,
    apiKeyEnv: envValue("AI_API_KEY_ENV") ?? "AI_API_KEY",
    authHeader: envValue("AI_AUTH_HEADER"),
    authScheme: envValue("AI_AUTH_SCHEME"),
    authQuery: envValue("AI_AUTH_QUERY"),
    models: envValue("AI_MODEL") ? [envValue("AI_MODEL") as string] : [],
    defaultModel: envValue("AI_MODEL"),
    inputPerM: Number.isFinite(Number(envValue("AI_INPUT_PRICE_PER_M"))) ? Number(envValue("AI_INPUT_PRICE_PER_M")) : undefined,
    outputPerM: Number.isFinite(Number(envValue("AI_OUTPUT_PRICE_PER_M"))) ? Number(envValue("AI_OUTPUT_PRICE_PER_M")) : undefined,
    jsonMode: true,
    streamUsage: true,
    sampling: true,
    listModels: true,
    source: "env",
  } as CustomEntry & { source: "env" };
}

interface Registry {
  enabled: ProviderSpec[];
  statuses: ProviderStatus[];
  defaultProvider: ProviderSpec | null;
  defaultModel: string | null;
  configError: string | null;
}

let registry: Registry | null = null;

function buildSpec(entry: CustomEntry, id: string, fallbackPrices: { input: number; output: number }): { spec: ProviderSpec; reason: string | null } {
  const missing = new Set<string>();
  const protocol: Protocol =
    typeof entry.protocol === "string" && PROTOCOLS.has(entry.protocol as Protocol) ? (entry.protocol as Protocol) : "chat-completions";
  const baseUrl = protocol === "binding" ? "" : typeof entry.baseUrl === "string" ? trimBase(interpolate(entry.baseUrl, missing)) : "";
  const key = typeof entry.apiKeyEnv === "string" && entry.apiKeyEnv ? firstEnv([entry.apiKeyEnv]) : undefined;
  const wireDefaults = protocol === "binding" ? { authHeader: "", authScheme: "" } : PROTOCOL_DEFAULTS[protocol];
  const spec: ProviderSpec = {
    id,
    label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : id,
    protocol,
    baseUrl,
    apiKey: key?.value,
    authHeader: typeof entry.authHeader === "string" ? entry.authHeader.toLowerCase() : wireDefaults.authHeader,
    authScheme: typeof entry.authScheme === "string" ? entry.authScheme : wireDefaults.authScheme,
    authQuery: typeof entry.authQuery === "string" && entry.authQuery ? entry.authQuery : undefined,
    binding: typeof entry.binding === "string" && entry.binding ? entry.binding : protocol === "binding" ? "AI" : undefined,
    headers: mapValues(stringRecord(entry.headers), (v) => interpolate(v, missing)),
    query: mapValues(stringRecord(entry.query), (v) => interpolate(v, missing)),
    models: modelList(entry.models),
    defaultModel: typeof entry.defaultModel === "string" ? entry.defaultModel : modelList(entry.models)[0]?.id,
    inputPerM: typeof entry.inputPerM === "number" && entry.inputPerM >= 0 ? entry.inputPerM : fallbackPrices.input,
    outputPerM: typeof entry.outputPerM === "number" && entry.outputPerM >= 0 ? entry.outputPerM : fallbackPrices.output,
    jsonMode: typeof entry.jsonMode === "boolean" ? entry.jsonMode : protocol !== "custom",
    streamUsage: typeof entry.streamUsage === "boolean" ? entry.streamUsage : protocol === "chat-completions",
    sampling: typeof entry.sampling === "boolean" ? entry.sampling : protocol !== "messages",
    listModels: typeof entry.listModels === "boolean" ? entry.listModels : protocol !== "binding" && protocol !== "custom",
    timeoutMs: typeof entry.timeoutMs === "number" && entry.timeoutMs > 0 ? entry.timeoutMs : DEFAULT_TIMEOUT_MS,
    docsUrl: typeof entry.docsUrl === "string" && entry.docsUrl ? entry.docsUrl : undefined,
    custom: protocol === "custom" ? customProtocol(entry) : undefined,
    source: (entry as { source?: unknown }).source === "env" ? "env" : "config",
  };

  let reason: string | null = null;
  if (!ID_RE.test(id)) reason = "id must be lowercase letters, digits and dashes";
  else if (entry.enabled === false) reason = "Disabled in configuration";
  else if (protocol === "custom" && (!entry.requestTemplate || typeof entry.requestTemplate !== "object")) {
    reason = 'The "custom" protocol needs a requestTemplate object';
  } else if (protocol === "binding") {
    const bindingName = spec.binding ?? "AI";
    if (!(env as unknown as Record<string, unknown>)[bindingName]) {
      reason = `The platform binding "${bindingName}" is not configured (see wrangler.jsonc)`;
    }
  } else if (missing.size) reason = `Missing environment variables: ${[...missing].join(", ")}`;
  else if (typeof entry.apiKeyEnv === "string" && entry.apiKeyEnv && !key) reason = `${entry.apiKeyEnv} not configured`;
  else if (!baseUrl) reason = "baseUrl is required";
  else reason = checkProviderUrl(baseUrl);
  return { spec, reason };
}

function buildRegistry(): Registry {
  const statuses: ProviderStatus[] = [];
  const enabled: ProviderSpec[] = [];
  const fallbackPrices = {
    input: rate("AI_INPUT_PRICE_PER_M", 0.05),
    output: rate("AI_OUTPUT_PRICE_PER_M", 0.25),
  };
  const { entries, error: configError } = configuredEntries();

  const accept = (spec: ProviderSpec, reason: string | null) => {
    statuses.push({
      id: spec.id,
      label: spec.label,
      protocol: spec.protocol,
      enabled: reason === null,
      reason,
      source: spec.source,
      defaultModel: spec.defaultModel ?? null,
      docsUrl: spec.docsUrl ?? null,
    });
    if (reason === null) enabled.push(spec);
  };

  const seen = new Set<string>();
  const push = (entry: CustomEntry, id: string) => {
    if (seen.has(id)) {
      statuses.push({ id, label: id, protocol: "chat-completions", enabled: false, reason: `Duplicate provider id "${id}"`, source: "config", defaultModel: null, docsUrl: null });
      return;
    }
    seen.add(id);
    const { spec, reason } = buildSpec(entry, id, fallbackPrices);
    accept(spec, reason);
  };

  // MODEL_PROVIDERS entries first: explicit configuration wins the id.
  for (const entry of entries) push(entry, String(entry.id ?? ""));
  // The AI_* quick settings, unless an entry above already claimed the id.
  const quick = quickEntry();
  if (quick) push(quick, String(quick.id ?? "default"));

  const preferred = envValue("DEFAULT_PROVIDER");
  const defaultProvider = (preferred ? enabled.find((p) => p.id === preferred) : undefined) ?? enabled.find((p) => p.defaultModel) ?? enabled[0] ?? null;
  const explicitDefault = envValue("DEFAULT_MODEL");
  const defaultModel = explicitDefault ?? (defaultProvider?.defaultModel ? `${defaultProvider.id}/${defaultProvider.defaultModel}` : null);

  return { enabled, statuses, defaultProvider, defaultModel, configError: configError ?? null };
}

function mapValues(record: Record<string, string>, fn: (value: string) => string): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fn(v)]));
}

function current(): Registry {
  // Secrets and bindings are fixed for the life of an isolate.
  return (registry ??= buildRegistry());
}

export function enabledProviders(): ProviderSpec[] {
  return current().enabled;
}

export function providerStatuses(): ProviderStatus[] {
  return current().statuses;
}

export function providersConfigError(): string | null {
  return current().configError;
}

function route(provider: ProviderSpec, model: string): Route {
  const spec = provider.models.find((m) => m.id === model);
  return {
    provider,
    model,
    id: `${provider.id}/${model}`,
    inputPerM: spec?.inputPerM ?? provider.inputPerM,
    outputPerM: spec?.outputPerM ?? provider.outputPerM,
  };
}

/** The model internal features use when no model is named, or null when no provider is configured. */
export function defaultRoute(): Route | null {
  const { defaultModel } = current();
  if (!defaultModel) return null;
  try {
    return resolveModel(defaultModel);
  } catch {
    return null;
  }
}

/**
 * Maps a client's model name to a provider. `<provider>/<model>` is exact;
 * a bare name goes to the provider that declares it, then to the default
 * provider. Model ids may themselves contain slashes.
 */
export function resolveModel(requested?: string): Route {
  const { enabled, statuses, defaultProvider, defaultModel } = current();
  const name = requested?.trim() || defaultModel;
  if (!name) {
    throw new GatewayError(
      "No model provider is configured. Send the request to your own server with the x-gateway-base-url header, or have the operator describe a server in MODEL_PROVIDERS (or the AI_* quick settings) — any http(s) endpoint, anywhere.",
      503,
      "provider_not_configured",
    );
  }

  const slash = name.indexOf("/");
  if (slash > 0) {
    const prefix = name.slice(0, slash);
    const rest = name.slice(slash + 1);
    const provider = enabled.find((p) => p.id === prefix);
    if (provider && rest) return route(provider, rest);
    const known = statuses.find((s) => s.id === prefix);
    if (known && !known.enabled) {
      throw new GatewayError(`Provider "${prefix}" is not available: ${known.reason}.`, 503, "provider_not_configured");
    }
  }

  const declaring = enabled.find((p) => p.models.some((m) => m.id === name));
  if (declaring) return route(declaring, name);
  if (!defaultProvider) {
    throw new GatewayError("No model provider is configured.", 503, "provider_not_configured");
  }
  return route(defaultProvider, name);
}
