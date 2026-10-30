import { admit, corsHeaders, errorResponse, gatewayKeyHeader } from "@/lib/universal/gateway";
import { checkCallerUrl } from "@/lib/universal/targets";
import { passThroughHeaders, relay } from "@/lib/universal/upstreams";

const GATEWAY_PREFIX = "/api/v1";
const HEADERS_TIMEOUT_MS = 60_000;

/**
 * Transparent edge forwarding: any /v1 request carrying x-gateway-base-url
 * goes to that server untouched — any server, any protocol shape, any region.
 * Nothing is parsed or mapped — the path after /v1 and the raw query string
 * are appended to the base URL, and the method, headers and body are sent as
 * they arrived. The response (status, headers, body, SSE and chunked streams)
 * is streamed back as the server sent it.
 *
 *   x-gateway-base-url   the server to call, e.g. https://api.example.com/v1
 *   x-gateway-key        this gateway's key (keeps Authorization free for the server)
 *   x-gateway-api-key    optional: set as "Authorization: Bearer <key>", or in the
 *                        header/scheme named by x-gateway-auth-header / x-gateway-auth-scheme
 *
 * Removed in transit, and nothing else: the header carrying the gateway key,
 * x-gateway-* headers, this site's cookies, client IP and hop-by-hop headers,
 * and the server's Set-Cookie (it would land on this domain).
 */
export async function passthrough(request: Request, path: string): Promise<Response> {
  const admission = await admit(request);
  if (admission instanceof Response) return admission;

  const base = await checkCallerUrl(request.headers.get("x-gateway-base-url") ?? "");
  if (!base.ok) return errorResponse(request, base.status, `x-gateway-base-url refused: ${base.reason}.`, "target_refused");

  // /v1/<rest>?<query>  →  <base path>/<rest>?<base query>&<query>, encodings preserved.
  const target = new URL(base.url);
  target.pathname = `${target.pathname.replace(/\/+$/, "")}${path.slice(GATEWAY_PREFIX.length)}` || "/";
  target.search = [target.search.slice(1), new URL(request.url).search.slice(1)].filter(Boolean).join("&");

  const keyHeader = gatewayKeyHeader(request);
  const headers = passThroughHeaders(request, new Set(keyHeader ? [keyHeader] : []));
  const ownKey = request.headers.get("x-gateway-api-key")?.trim();
  if (ownKey) {
    const header = request.headers.get("x-gateway-auth-header")?.trim().toLowerCase() || "authorization";
    const scheme = (request.headers.get("x-gateway-auth-scheme") ?? (header === "authorization" ? "Bearer" : "")).trim();
    headers.set(header, scheme ? `${scheme} ${ownKey}` : ownKey);
  }

  const res = await relay(request, target, {
    label: target.host,
    meterAs: `passthrough:${target.host}`.slice(0, 48),
    headers,
    timeoutMs: HEADERS_TIMEOUT_MS,
    costUsd: 0,
    tag: ["x-gateway-target", target.origin],
  });
  for (const [name, value] of Object.entries(corsHeaders(request))) res.headers.set(name, value);
  return res;
}
