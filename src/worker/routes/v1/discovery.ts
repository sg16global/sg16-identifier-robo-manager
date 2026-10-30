import { identity } from "@/lib/identity";
import { corsHeaders, gatewayEnabled, preflight } from "@/lib/universal/gateway";
import { defaultRoute, providerStatuses, providersConfigError } from "@/lib/universal/providers";
import { privateTargetsAllowed } from "@/lib/universal/targets";
import { upstreamStatuses } from "@/lib/universal/upstreams";

/**
 * Universal gateway API — discovery. Public and secret-free: which endpoints
 * exist, which servers this deployment can reach and why others cannot.
 * Upstream names are listed, never their URLs or credentials. Nothing here
 * names a vendor: every provider and upstream is operator configuration.
 */
export async function GET(request: Request) {
  const providers = providerStatuses();
  const id = identity();
  return Response.json(
    {
      object: "gateway.api",
      service: id.serviceName,
      version: "1.0.0",
      open: gatewayEnabled(),
      auth: "x-gateway-key: <key> (or Authorization: Bearer / x-api-key / api-key / x-goog-api-key)",
      compatibility: "Canonical chat-completions JSON — point any compatible SDK at <origin>/v1",
      transparentPassthrough: {
        trigger: "any /v1/<path> request with x-gateway-base-url — forwarded untouched to <base-url>/<path>; response streamed back as sent",
        "x-gateway-base-url": "your server's API root (any server, any API, any region)",
        "x-gateway-key": "this gateway's key, so Authorization stays yours for the server",
        "x-gateway-api-key": "optional: sent as Authorization: Bearer <key>",
        "x-gateway-auth-header": "optional: header for x-gateway-api-key instead",
        "x-gateway-auth-scheme": "optional: prefix for x-gateway-api-key (empty for none)",
      },
      privateTargetsAllowed: privateTargetsAllowed(),
      defaultModel: defaultRoute()?.id ?? null,
      endpoints: [
        { method: "ANY", path: "/v1/<path> + x-gateway-base-url", purpose: "Transparent pass-through to your own server: method, headers, body and streams untouched." },
        { method: "GET", path: "/v1", purpose: "This document." },
        { method: "GET", path: "/v1/models", purpose: "Every model reachable through this deployment's configured servers, as <provider>/<model>." },
        { method: "POST", path: "/v1/chat/completions", purpose: "Chat completions on the deployment's configured servers; streaming, tools, images, JSON mode, fallbacks." },
        { method: "ANY", path: "/v1/forward", purpose: "Call any HTTP API by URL: target in x-gateway-target or ?url=; your own credentials pass through." },
        { method: "POST", path: "/v1/verify", purpose: "Run a verification (claim, website, product, media) and return the evidence report." },
        { method: "GET", path: "/v1/reports/{public_id}", purpose: `A stored report by its ${id.reportIdPrefix}-XXXX-XXXX reference.` },
        { method: "GET", path: "/v1/catalog/{brand}/{model}", purpose: "The normalised catalogue record products are matched against." },
        { method: "ANY", path: "/v1/proxy/{upstream}/{path}", purpose: "Forward a call to an operator-configured API with its credential attached server-side." },
      ],
      providers: providers.map((p) => ({
        id: p.id,
        label: p.label,
        protocol: p.protocol,
        enabled: p.enabled,
        defaultModel: p.enabled ? p.defaultModel : null,
        reason: p.reason,
      })),
      upstreams: upstreamStatuses().map((u) => ({ id: u.id, label: u.label, methods: u.methods, enabled: u.enabled, reason: u.reason })),
      configError: providersConfigError(),
    },
    { headers: { "cache-control": "no-store", ...corsHeaders(request) } },
  );
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
