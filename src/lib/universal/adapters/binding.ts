import { env } from "cloudflare:workers";
import { readSse } from "@/lib/universal/sse";
import { GatewayError, type ChatChunk, type ChatCompletion, type ChatRequest, type ToolCall, type Usage } from "@/lib/universal/types";
import type { Route } from "@/lib/universal/providers";
import { chunk, completionId, maxTokens, nowSeconds, textOf, toolCallId, usageChunk, usageOf, type Adapter } from "@/lib/universal/adapters/common";

/**
 * The "binding" protocol: the hosting platform's own inference binding
 * (e.g. `"ai": { "binding": "AI" }` in wrangler.jsonc). No key and no URL —
 * calls go through the bound object, billed to the operator's platform
 * account. The binding name comes from the provider entry (`binding`, default
 * "AI"), so any platform inference binding works. Text models take canonical
 * chat messages; results come back either in the classic
 * `{ response, tool_calls, usage }` shape or already in chat-completions
 * shape — both are handled. Images in content are dropped: vision models on
 * the binding use a different input. A platform's REST inference endpoint can
 * be used instead by configuring it as an ordinary chat-completions provider.
 */

function inputs(request: ChatRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messages: request.messages.map((m) => ({
      role: m.role === "developer" ? "system" : m.role,
      content: textOf(m.content),
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.name ? { name: m.name } : {}),
    })),
  };
  const max = maxTokens(request);
  if (max) body.max_tokens = max;
  if (typeof request.temperature === "number") body.temperature = request.temperature;
  if (typeof request.top_p === "number") body.top_p = request.top_p;
  if (request.tools?.length) body.tools = request.tools;
  if (stream) body.stream = true;
  return body;
}

/** The platform inference binding named by the provider entry; models are addressed by name at runtime. */
type AiBinding = { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };

async function run(route: Route, request: ChatRequest, stream: boolean): Promise<unknown> {
  const bindingName = route.provider.binding ?? "AI";
  const ai = (env as unknown as Record<string, AiBinding | undefined>)[bindingName];
  if (!ai) throw new GatewayError(`The platform inference binding "${bindingName}" is not configured.`, 503, "provider_not_configured");
  try {
    return await ai.run(route.model, inputs(request, stream));
  } catch (error) {
    const message = `${route.provider.label}: ${(error as Error).message ?? String(error)}`;
    if (/no such model|not found|5007/i.test(message)) throw new GatewayError(message, 404, "model_not_found");
    if (/input|validation|5006|5021/i.test(message)) throw new GatewayError(message, 400, "invalid_request_error");
    throw new GatewayError(message, 502, "upstream_error", true);
  }
}

type ClassicResult = {
  response?: unknown;
  tool_calls?: Array<{ name?: string; arguments?: unknown; id?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function classicToolCalls(calls: ClassicResult["tool_calls"]): ToolCall[] {
  return (calls ?? [])
    .filter((c) => c?.name)
    .map((c) => ({
      id: c.id ?? toolCallId(),
      type: "function",
      function: { name: c.name!, arguments: typeof c.arguments === "string" ? c.arguments : JSON.stringify(c.arguments ?? {}) },
    }));
}

function classicUsage(usage: ClassicResult["usage"]): Usage | undefined {
  return usage ? usageOf(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0) : undefined;
}

export const bindingAdapter: Adapter = {
  async complete(route, request) {
    const result = (await run(route, request, false)) as ClassicResult & Partial<ChatCompletion>;
    if (Array.isArray(result?.choices)) {
      return { ...(result as ChatCompletion), id: result.id ?? completionId(), object: "chat.completion", created: result.created ?? nowSeconds(), model: route.id };
    }
    const text = typeof result?.response === "string" ? result.response : result?.response === undefined ? "" : JSON.stringify(result.response);
    const calls = classicToolCalls(result?.tool_calls);
    return {
      id: completionId(),
      object: "chat.completion",
      created: nowSeconds(),
      model: route.id,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text || (calls.length ? null : ""), ...(calls.length ? { tool_calls: calls } : {}) },
          finish_reason: calls.length ? "tool_calls" : "stop",
        },
      ],
      usage: classicUsage(result?.usage),
    };
  },

  async *stream(route, request) {
    const result = await run(route, request, true);
    if (!(result instanceof ReadableStream)) throw new GatewayError(`${route.provider.label} did not return a stream.`, 502);
    const id = completionId();
    let usage: Usage | undefined;
    let toolCount = 0;
    let native = false;
    yield chunk(id, route, { role: "assistant", content: "" });
    for await (const event of readSse(result as ReadableStream<Uint8Array>)) {
      if (event.data === "[DONE]") break;
      let data: ClassicResult & Partial<ChatChunk>;
      try {
        data = JSON.parse(event.data);
      } catch {
        continue;
      }
      if (Array.isArray(data.choices)) {
        // Newer models stream chat-completions chunks already.
        native = true;
        if (data.usage) usage = data.usage;
        if (data.choices.length) yield { ...(data as ChatChunk), id, object: "chat.completion.chunk", model: route.id };
        continue;
      }
      if (data.usage) usage = classicUsage(data.usage);
      if (typeof data.response === "string" && data.response) yield chunk(id, route, { content: data.response });
      const calls = classicToolCalls(data.tool_calls);
      if (calls.length) {
        yield chunk(id, route, { tool_calls: calls.map((c) => ({ index: toolCount++, id: c.id, type: "function" as const, function: c.function })) });
      }
    }
    if (!native) yield chunk(id, route, {}, toolCount ? "tool_calls" : "stop");
    if (usage) yield usageChunk(id, route, usage);
  },

  async listModels() {
    // The binding cannot enumerate the catalogue; declared models are listed instead.
    return [];
  },
};
