import { CHAT_MODEL, MAX_TURNS, SYSTEM_PROMPT } from "@/lib/chat-config";
import {
  scoreLead,
  toAnthropicToolDefinition,
  type ScoreLeadOutput,
} from "@/lib/tools/score-lead";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequestBody = {
  messages?: ChatMessage[];
};

// Anthropic message content blocks, typed just enough for what this route
// sends back on the follow-up "tool_result" turn.
type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

// Per-content-block bookkeeping while a single Anthropic stream is read.
type BlockState =
  | { kind: "text"; text: string }
  | {
      kind: "tool_use";
      id: string;
      name: string;
      jsonAccum: string;
      input?: unknown;
      output?: ScoreLeadOutput;
      error?: string;
    };

const encoder = new TextEncoder();
const MAX_TOOL_ROUNDTRIPS = 3;

function sse(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function parseAnthropicEventBlock(block: string) {
  const eventLine = block.split("\n").find((line) => line.startsWith("event:"));
  const dataText = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!eventLine || dataText.length === 0) {
    return null;
  }

  try {
    const data = JSON.parse(dataText) as Record<string, unknown>;
    return { event: eventLine.slice(6).trim(), data };
  } catch {
    return null;
  }
}

async function executeScoreLeadTool(
  toolCallId: string,
  input: unknown,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<{ output?: ScoreLeadOutput; error?: string }> {
  try {
    const output = await scoreLead(input);
    controller.enqueue(encoder.encode(sse("tool-output-available", { toolCallId, output })));
    return { output };
  } catch (thrown) {
    const message =
      thrown instanceof Error ? thrown.message : "The tool failed for an unknown reason.";
    controller.enqueue(encoder.encode(sse("tool-output-error", { toolCallId, error: message })));
    return { error: message };
  }
}

/**
 * Reads one Anthropic streaming response, forwarding text tokens and tool
 * lifecycle events to the client as they arrive, and executing any
 * `scoreLead` tool calls as soon as their input finishes streaming.
 *
 * Returns the model's stop reason plus the ordered content blocks, so the
 * caller can decide whether a tool-result follow-up turn is needed.
 */
async function readAnthropicStream(
  response: Response,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<{ stopReason: string | null; blocks: BlockState[] }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const blocksByIndex = new Map<number, BlockState>();
  const orderedIndices: number[] = [];
  let stopReason: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const rawBlocks = buffer.split("\n\n");
    buffer = rawBlocks.pop() ?? "";

    for (const rawBlock of rawBlocks) {
      const parsed = parseAnthropicEventBlock(rawBlock);
      if (!parsed) continue;
      const { event, data } = parsed;

      if (event === "content_block_start") {
        const index = data.index as number;
        const block = data.content_block as Record<string, unknown>;
        orderedIndices.push(index);

        if (block.type === "text") {
          blocksByIndex.set(index, { kind: "text", text: "" });
        } else if (block.type === "tool_use") {
          const id = block.id as string;
          const name = block.name as string;
          blocksByIndex.set(index, { kind: "tool_use", id, name, jsonAccum: "" });
          controller.enqueue(
            encoder.encode(sse("tool-start", { toolCallId: id, toolName: name })),
          );
        }
        continue;
      }

      if (event === "content_block_delta") {
        const index = data.index as number;
        const delta = data.delta as { type: string; text?: string; partial_json?: string };
        const state = blocksByIndex.get(index);
        if (!state) continue;

        if (delta.type === "text_delta" && typeof delta.text === "string" && state.kind === "text") {
          state.text += delta.text;
          controller.enqueue(encoder.encode(sse("token", { chunk: delta.text })));
        }

        if (
          delta.type === "input_json_delta" &&
          typeof delta.partial_json === "string" &&
          state.kind === "tool_use"
        ) {
          state.jsonAccum += delta.partial_json;
          controller.enqueue(
            encoder.encode(
              sse("tool-input-delta", { toolCallId: state.id, delta: delta.partial_json }),
            ),
          );
        }
        continue;
      }

      if (event === "content_block_stop") {
        const index = data.index as number;
        const state = blocksByIndex.get(index);
        if (state?.kind === "tool_use") {
          let parsedInput: unknown = {};
          try {
            parsedInput = state.jsonAccum.trim().length > 0 ? JSON.parse(state.jsonAccum) : {};
          } catch {
            state.error = "The model produced malformed tool input JSON.";
            controller.enqueue(
              encoder.encode(
                sse("tool-output-error", { toolCallId: state.id, error: state.error }),
              ),
            );
            continue;
          }

          state.input = parsedInput;
          controller.enqueue(
            encoder.encode(
              sse("tool-input-available", {
                toolCallId: state.id,
                toolName: state.name,
                input: parsedInput,
              }),
            ),
          );

          const result = await executeScoreLeadTool(state.id, parsedInput, controller);
          state.output = result.output;
          state.error = result.error;
        }
        continue;
      }

      if (event === "message_delta") {
        const delta = data.delta as { stop_reason?: string } | undefined;
        if (delta?.stop_reason) {
          stopReason = delta.stop_reason;
        }
        continue;
      }

      if (event === "error") {
        const err = data.error as { message?: string } | undefined;
        throw new Error(err?.message ?? "Anthropic returned a stream error.");
      }
    }

    if (done) break;
  }

  const blocks = orderedIndices
    .map((index) => blocksByIndex.get(index))
    .filter((b): b is BlockState => Boolean(b));

  return { stopReason, blocks };
}

function buildFollowUpMessages(
  priorMessages: AnthropicMessage[],
  blocks: BlockState[],
): AnthropicMessage[] {
  const assistantContent: AnthropicContentBlock[] = blocks.map((block) =>
    block.kind === "text"
      ? { type: "text", text: block.text }
      : { type: "tool_use", id: block.id, name: block.name, input: block.input ?? {} },
  );

  const toolResultBlocks: AnthropicContentBlock[] = blocks
    .filter((block): block is Extract<BlockState, { kind: "tool_use" }> => block.kind === "tool_use")
    .map((block) => ({
      type: "tool_result",
      tool_use_id: block.id,
      content: block.output ? JSON.stringify(block.output) : block.error ?? "Tool execution failed.",
      is_error: !block.output,
    }));

  return [
    ...priorMessages,
    { role: "assistant", content: assistantContent },
    { role: "user", content: toolResultBlocks },
  ];
}

async function runAnthropicConversation(
  apiKey: string,
  initialMessages: AnthropicMessage[],
  controller: ReadableStreamDefaultController<Uint8Array>,
) {
  let currentMessages = initialMessages;

  for (let round = 0; round < MAX_TOOL_ROUNDTRIPS; round += 1) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: currentMessages,
        tools: [toAnthropicToolDefinition()],
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Anthropic returned ${response.status}.`);
    }

    const { stopReason, blocks } = await readAnthropicStream(response, controller);

    if (stopReason !== "tool_use" || blocks.every((b) => b.kind !== "tool_use")) {
      return;
    }

    currentMessages = buildFollowUpMessages(currentMessages, blocks);
  }
}

// ---------------------------------------------------------------------------
// Fallback mode (no ANTHROPIC_API_KEY): still demonstrates the full tool
// lifecycle using the real `scoreLead` execute function, just without a
// live model in the loop.
// ---------------------------------------------------------------------------

const LEAD_INTENT_RE =
  /\b(score|qualify|prioriti[sz]e)\b[\s\S]*\blead\b|\blead\b[\s\S]*\b(score|qualify|prioriti[sz]e)\b/i;

function extractLeadFromText(text: string) {
  const budgetMatch = text.match(/\$?\s*(-?[\d][\d,]*(?:\.\d+)?)\s*(k|thousand|m|million)?/i);
  let budget = 42_000;
  if (budgetMatch) {
    let raw = parseFloat(budgetMatch[1].replace(/,/g, ""));
    const unit = budgetMatch[2]?.toLowerCase();
    if (unit === "k" || unit === "thousand") raw *= 1_000;
    if (unit === "m" || unit === "million") raw *= 1_000_000;
    if (!Number.isNaN(raw)) budget = raw;
  }

  const nameMatch = text.match(
    /(?:named|name is|name:)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/,
  );
  const name = nameMatch?.[1] ?? "Jordan Rivera";

  const companyMatch = text.match(
    /(?:at|company:?)\s+([A-Z][a-zA-Z0-9&]+(?:\s+[A-Z][a-zA-Z0-9&]+)*)/,
  );
  const company = companyMatch?.[1] ?? "Acme Robotics";

  return { name, company, budget };
}

async function streamFallbackToolDemo(
  prompt: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
) {
  const toolCallId = `fallback-${Math.random().toString(36).slice(2, 10)}`;
  const lead = extractLeadFromText(prompt);

  const preamble = "Let me score that lead for you.";
  for (const chunk of preamble.match(/.{1,8}/g) ?? []) {
    controller.enqueue(encoder.encode(sse("token", { chunk })));
    await new Promise((resolve) => setTimeout(resolve, 18));
  }

  controller.enqueue(
    encoder.encode(sse("tool-start", { toolCallId, toolName: "scoreLead" })),
  );

  const inputJson = JSON.stringify(lead, null, 2);
  for (const chunk of inputJson.match(/.{1,6}/g) ?? []) {
    controller.enqueue(encoder.encode(sse("tool-input-delta", { toolCallId, delta: chunk })));
    await new Promise((resolve) => setTimeout(resolve, 12));
  }

  controller.enqueue(
    encoder.encode(
      sse("tool-input-available", { toolCallId, toolName: "scoreLead", input: lead }),
    ),
  );

  await new Promise((resolve) => setTimeout(resolve, 350));

  try {
    const output = await scoreLead(lead);
    controller.enqueue(encoder.encode(sse("tool-output-available", { toolCallId, output })));

    const summary = ` ${lead.name} at ${lead.company} scored ${output.score}/100 — a ${output.tier} lead.`;
    for (const chunk of summary.match(/.{1,8}/g) ?? []) {
      controller.enqueue(encoder.encode(sse("token", { chunk })));
      await new Promise((resolve) => setTimeout(resolve, 18));
    }
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : "Scoring failed.";
    controller.enqueue(encoder.encode(sse("tool-output-error", { toolCallId, error: message })));

    const summary = ` I couldn't score that lead: ${message}`;
    for (const chunk of summary.match(/.{1,8}/g) ?? []) {
      controller.enqueue(encoder.encode(sse("token", { chunk })));
      await new Promise((resolve) => setTimeout(resolve, 18));
    }
  }

  controller.enqueue(encoder.encode(sse("done", { ok: true })));
}

async function streamFallbackTextResponse(
  prompt: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
) {
  const response = [
    `I can help with "${prompt}".`,
    "The preview is running in fallback mode, so the UI still streams token by token even if no Anthropic key is present.",
    'Try asking me to score a lead (e.g. "score a lead named Sam Rivera at Northwind with a $60k budget") to see the tool lifecycle.',
  ].join(" ");

  for (const chunk of response.match(/.{1,8}/g) ?? []) {
    controller.enqueue(encoder.encode(sse("token", { chunk })));
    await new Promise((resolve) => setTimeout(resolve, 22));
  }

  controller.enqueue(encoder.encode(sse("done", { ok: true })));
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_TURNS) : [];
  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content?.trim() ?? "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        controller.enqueue(encoder.encode(sse("meta", { mode: "fallback" })));
        if (LEAD_INTENT_RE.test(lastUserMessage)) {
          await streamFallbackToolDemo(lastUserMessage, controller);
        } else {
          await streamFallbackTextResponse(lastUserMessage || "your prompt", controller);
        }
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(sse("meta", { mode: "anthropic", model: CHAT_MODEL })));

      try {
        await runAnthropicConversation(apiKey, messages, controller);
        controller.enqueue(encoder.encode(sse("done", { ok: true })));
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to stream the response.";
        controller.enqueue(encoder.encode(sse("error", { message })));
        controller.enqueue(encoder.encode(sse("done", { ok: false })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
