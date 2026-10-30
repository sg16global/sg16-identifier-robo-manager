import { admit, jsonResponse, preflight } from "@/lib/universal/gateway";
import { listModels } from "@/lib/universal/models";

/**
 * Model list in the canonical chat-completions shape, across every server the
 * operator configured. `?live=0` skips provider lookups. (With
 * x-gateway-base-url the request is forwarded to that server instead.)
 */
export async function GET(request: Request) {
  const admission = await admit(request);
  if (admission instanceof Response) return admission;
  const live = new URL(request.url).searchParams.get("live") !== "0";
  return jsonResponse(request, { object: "list", data: await listModels({ live }) });
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
