import { readSse } from "@/lib/universal/sse";
import { GatewayError, type ChatChunk, type ChatCompletion, type ChatRequest } from "@/lib/universal/types";
import type { ProviderSpec, Route } from "@/lib/universal/providers";
import { completionId, getJson, nowSeconds, postJson, providerUrl, type Adapter } from "@/lib/universal/adapters/common";

/**
 * The "chat-completions" wire format — the de-facto standard chat JSON API
 * (POST {baseUrl}/chat/completions with { model, messages, … }, replies in
 * choices[], SSE chunks with [DONE]). Hundreds of servers speak it: commercial
 * clouds in every region, national endpoints, and self-hosted runtimes such as
 * vLLM, Ollama, LM Studio and TGI. Which server it talks to is purely the
 * operator's configuration (MODEL_PROVIDERS / AI_BASE_URL) — nothing here is
 * tied to a vendor. The request passes through untouched apart from the model
 * name, so every server-specific field a client sends still reaches it.
 */

function payload(route: Route, request: ChatRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = { ...request, model: route.model };
  if (stream) {
    body.stream = true;
    if (route.provider.streamUsage && !request.stream_options) body.stream_options = { include_usage: true };
  } else {
    delete body.stream;
    delete body.stream_options;
  }
  return body;
}

/**
 * Some chat-completions servers reject response_format or stream_options.
 * When the provider names one of them in a 400, the call is retried once
 * without it — the prompt still asks for JSON, and usage falls back to an
 * estimate.
 */
async function send(route: Route, body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  const url = providerUrl(route.provider, "/chat/completions");
  try {
    return await postJson(route.provider, url, body, signal);
  } catch (error) {
    if (!(error instanceof GatewayError) || error.status !== 400) throw error;
    const retry = { ...body };
    let changed = false;
    for (const field of ["response_format", "stream_options"]) {
      if (field in retry && error.message.includes(field)) {
        delete retry[field];
        changed = true;
      }
    }
    if (!changed) throw error;
    return postJson(route.provider, url, retry, signal);
  }
}

export const chatCompletionsAdapter: Adapter = {
  async complete(route, request, signal) {
    const res = await send(route, payload(route, request, false), signal);
    const data = (await res.json()) as ChatCompletion;
    if (!Array.isArray(data?.choices)) {
      throw new GatewayError(`${route.provider.label} returned a response without choices.`, 502);
    }
    return {
      ...data,
      id: data.id ?? completionId(),
      object: "chat.completion",
      created: data.created ?? nowSeconds(),
      model: route.id,
    };
  },

  async *stream(route, request, signal) {
    const res = await send(route, payload(route, request, true), signal);
    if (!res.body) throw new GatewayError(`${route.provider.label} returned an empty stream.`, 502);
    for await (const event of readSse(res.body)) {
      if (event.data === "[DONE]") return;
      let parsed: ChatChunk & { error?: { message?: string } };
      try {
        parsed = JSON.parse(event.data);
      } catch {
        continue; // keep-alive or vendor noise
      }
      if (parsed.error) throw new GatewayError(`${route.provider.label} stream error: ${parsed.error.message ?? "unknown"}`, 502);
      if (!Array.isArray(parsed.choices)) continue;
      yield { ...parsed, object: "chat.completion.chunk", model: route.id };
    }
  },

  async listModels(provider: ProviderSpec, signal) {
    const data = await getJson<{ data?: Array<{ id?: string }> }>(provider, providerUrl(provider, "/models"), signal);
    return (data.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
  },
};
