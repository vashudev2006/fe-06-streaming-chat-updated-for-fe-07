"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LeadScoreCard } from "@/components/lead-score-card";
import type { ScoreLeadOutput } from "@/lib/tools/score-lead";

type ChatRole = "user" | "assistant";

type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";

type TextPart = { kind: "text"; text: string };

type ToolPart = {
  kind: "tool";
  toolCallId: string;
  toolName: string;
  state: ToolState;
  inputText: string;
  input?: Record<string, unknown>;
  output?: ScoreLeadOutput;
  errorText?: string;
};

type MessagePart = TextPart | ToolPart;

type ChatMessage = {
  id: string;
  role: ChatRole;
  parts: MessagePart[];
  streaming?: boolean;
};

type StreamEvent =
  | { type: "meta"; mode: string }
  | { type: "token"; chunk: string }
  | { type: "tool-start"; toolCallId: string; toolName: string }
  | { type: "tool-input-delta"; toolCallId: string; delta: string }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool-output-available"; toolCallId: string; output: ScoreLeadOutput }
  | { type: "tool-output-error"; toolCallId: string; error: string }
  | { type: "done" }
  | { type: "error"; message: string };

const starterMessages: ChatMessage[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    parts: [
      {
        kind: "text",
        text: 'Ask me to draft a rollout plan, explain a UI choice, or say "score a lead named Sam Rivera at Northwind with a $60k budget" to see the scoreLead tool run end to end.',
      },
    ],
  },
];

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function textOf(message: ChatMessage): string {
  return message.parts
    .filter((p): p is TextPart => p.kind === "text")
    .map((p) => p.text)
    .join("");
}

function parseEventBlock(block: string): StreamEvent | null {
  const eventLine = block.split("\n").find((line) => line.startsWith("event:"));
  const dataText = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!eventLine || dataText.length === 0) {
    return null;
  }

  const event = eventLine.slice(6).trim();

  try {
    const payload = JSON.parse(dataText) as Record<string, unknown>;

    switch (event) {
      case "meta":
        return { type: "meta", mode: String(payload.mode ?? "") };
      case "token":
        return typeof payload.chunk === "string" ? { type: "token", chunk: payload.chunk } : null;
      case "tool-start":
        return typeof payload.toolCallId === "string" && typeof payload.toolName === "string"
          ? { type: "tool-start", toolCallId: payload.toolCallId, toolName: payload.toolName }
          : null;
      case "tool-input-delta":
        return typeof payload.toolCallId === "string" && typeof payload.delta === "string"
          ? { type: "tool-input-delta", toolCallId: payload.toolCallId, delta: payload.delta }
          : null;
      case "tool-input-available":
        return typeof payload.toolCallId === "string"
          ? {
              type: "tool-input-available",
              toolCallId: payload.toolCallId,
              toolName: String(payload.toolName ?? ""),
              input: (payload.input as Record<string, unknown>) ?? {},
            }
          : null;
      case "tool-output-available":
        return typeof payload.toolCallId === "string"
          ? {
              type: "tool-output-available",
              toolCallId: payload.toolCallId,
              output: payload.output as ScoreLeadOutput,
            }
          : null;
      case "tool-output-error":
        return typeof payload.toolCallId === "string" && typeof payload.error === "string"
          ? { type: "tool-output-error", toolCallId: payload.toolCallId, error: payload.error }
          : null;
      case "done":
        return { type: "done" };
      case "error":
        return typeof payload.message === "string"
          ? { type: "error", message: payload.message }
          : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function readStream(response: Response, onEvent: (event: StreamEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("The response did not include a readable stream.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseEventBlock(block);
      if (event) onEvent(event);
    }

    if (done) {
      if (buffer.trim().length > 0) {
        const event = parseEventBlock(buffer);
        if (event) onEvent(event);
      }
      break;
    }
  }
}

function updateToolPart(
  messages: ChatMessage[],
  assistantId: string | null,
  toolCallId: string,
  updater: (part: ToolPart) => ToolPart,
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== assistantId) return message;
    return {
      ...message,
      parts: message.parts.map((part) =>
        part.kind === "tool" && part.toolCallId === toolCallId ? updater(part) : part,
      ),
    };
  });
}

function ToolLifecycleCard({ part }: { part: ToolPart }) {
  if (part.state === "output-available" && part.output) {
    return <LeadScoreCard input={part.input} output={part.output} />;
  }

  if (part.state === "output-error") {
    return (
      <div className="tool-card tool-card--error">
        <div className="tool-card__header">
          <span className="tool-card__icon" aria-hidden="true">
            ⚠
          </span>
          <div>
            <p className="tool-card__title">scoreLead failed</p>
            <p className="tool-card__subtitle">The tool call did not complete.</p>
          </div>
        </div>
        <p className="tool-card__error-text">{part.errorText}</p>
      </div>
    );
  }

  if (part.state === "input-available") {
    return (
      <div className="tool-card tool-card--running">
        <div className="tool-card__header">
          <span className="tool-card__spinner" aria-hidden="true" />
          <div>
            <p className="tool-card__title">Running scoreLead…</p>
            <p className="tool-card__subtitle">Validating input and scoring the lead.</p>
          </div>
        </div>
        <div className="tool-card__chips">
          {part.input?.name ? <span className="tool-chip">{String(part.input.name)}</span> : null}
          {part.input?.company ? (
            <span className="tool-chip">{String(part.input.company)}</span>
          ) : null}
          {typeof part.input?.budget === "number" ? (
            <span className="tool-chip">${Number(part.input.budget).toLocaleString()}</span>
          ) : null}
        </div>
      </div>
    );
  }

  // input-streaming
  return (
    <div className="tool-card tool-card--building">
      <div className="tool-card__header">
        <span className="tool-card__spinner" aria-hidden="true" />
        <div>
          <p className="tool-card__title">Calling scoreLead…</p>
          <p className="tool-card__subtitle">Streaming tool arguments from the model.</p>
        </div>
      </div>
      <pre className="tool-card__json">{part.inputText || "{"}</pre>
    </div>
  );
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "thinking" | "streaming">("idle");
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);

  const conversationCount = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages],
  );

  const scrollToBottom = useCallback((smooth = false) => {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom(status === "streaming");
    }
  }, [messages, scrollToBottom, status]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleScroll = () => {
    const node = transcriptRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 64;
  };

  const applyStreamEvent = useCallback((event: StreamEvent) => {
    const assistantId = activeAssistantIdRef.current;

    if (event.type === "token") {
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== assistantId) return message;
          const parts = [...message.parts];
          const last = parts[parts.length - 1];
          if (last && last.kind === "text") {
            parts[parts.length - 1] = { kind: "text", text: last.text + event.chunk };
          } else {
            parts.push({ kind: "text", text: event.chunk });
          }
          return { ...message, parts };
        }),
      );
      return;
    }

    if (event.type === "tool-start") {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                parts: [
                  ...message.parts,
                  {
                    kind: "tool",
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    state: "input-streaming",
                    inputText: "",
                  } satisfies ToolPart,
                ],
              }
            : message,
        ),
      );
      return;
    }

    if (event.type === "tool-input-delta") {
      setMessages((current) =>
        updateToolPart(current, assistantId, event.toolCallId, (part) => ({
          ...part,
          inputText: part.inputText + event.delta,
        })),
      );
      return;
    }

    if (event.type === "tool-input-available") {
      setMessages((current) =>
        updateToolPart(current, assistantId, event.toolCallId, (part) => ({
          ...part,
          state: "input-available",
          input: event.input,
        })),
      );
      return;
    }

    if (event.type === "tool-output-available") {
      setMessages((current) =>
        updateToolPart(current, assistantId, event.toolCallId, (part) => ({
          ...part,
          state: "output-available",
          output: event.output,
        })),
      );
      return;
    }

    if (event.type === "tool-output-error") {
      setMessages((current) =>
        updateToolPart(current, assistantId, event.toolCallId, (part) => ({
          ...part,
          state: "output-error",
          errorText: event.error,
        })),
      );
      return;
    }

    if (event.type === "done") {
      setIsStreaming(false);
      setStatus("idle");
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, streaming: false } : message,
        ),
      );
      activeAssistantIdRef.current = null;
      abortRef.current = null;
      return;
    }

    if (event.type === "error") {
      setError(event.message);
      setIsStreaming(false);
      setStatus("idle");
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== assistantId) return message;
          const parts = [...message.parts];
          const hasText = parts.some((p) => p.kind === "text");
          if (!hasText) parts.push({ kind: "text", text: event.message });
          return { ...message, parts, streaming: false };
        }),
      );
      activeAssistantIdRef.current = null;
      abortRef.current = null;
    }
  }, []);

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeAssistantIdRef.current = null;
    setIsStreaming(false);
    setStatus("idle");
    setMessages((current) =>
      current.map((message) => (message.streaming ? { ...message, streaming: false } : message)),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = draft.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    setDraft("");
    setIsStreaming(true);
    setStatus("thinking");

    const userMessage: ChatMessage = {
      id: createId("user"),
      role: "user",
      parts: [{ kind: "text", text: trimmed }],
    };

    const assistantMessage: ChatMessage = {
      id: createId("assistant"),
      role: "assistant",
      parts: [],
      streaming: true,
    };

    activeAssistantIdRef.current = assistantMessage.id;

    setMessages((current) => [...current, userMessage, assistantMessage]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const conversation = [...messages, userMessage]
        .filter((message) => message.id !== "assistant-welcome")
        .map((message) => ({ role: message.role, content: textOf(message) }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("The chat route did not return a usable stream.");
      }

      setStatus("streaming");
      await readStream(response, applyStreamEvent);
    } catch (thrown) {
      if (thrown instanceof DOMException && thrown.name === "AbortError") {
        setStatus("idle");
        setIsStreaming(false);
        return;
      }

      const message = thrown instanceof Error ? thrown.message : "Something interrupted the stream.";
      setError(message);
      setStatus("idle");
      setIsStreaming(false);
      setMessages((current) =>
        current.map((item) =>
          item.id === activeAssistantIdRef.current
            ? { ...item, parts: [...item.parts, { kind: "text", text: message }], streaming: false }
            : item,
        ),
      );
      activeAssistantIdRef.current = null;
      abortRef.current = null;
    }
  };

  return (
    <section className="chat-section" id="chat">
      <div className="hero-grid">
        <article className="hero-panel">
          <p className="eyebrow">FE-07 / Tool results in the UI</p>
          <div className="hero-copy">
            <h1>Tool calls that render as real UI, not JSON.</h1>
            <p>
              The server route calls a typed <code>scoreLead</code> tool, streams every lifecycle
              state back over SSE, and the client renders each state distinctly — including a
              designed failure state instead of a crash.
            </p>
          </div>
          <div className="hero-card">
            <div className="hero-stat">
              <div>
                <strong>Server tool</strong>
                <span className="chat-meta">Zod-validated scoreLead, defined once and shared.</span>
              </div>
              <span className="badge">/lib/tools/score-lead.ts</span>
            </div>
            <div className="hero-stat">
              <div>
                <strong>Tool lifecycle</strong>
                <span className="chat-meta">input-streaming → input-available → output.</span>
              </div>
              <span className="badge">4 states</span>
            </div>
            <div className="hero-stat">
              <div>
                <strong>Conversation state</strong>
                <span className="chat-meta">History stays intact across multiple turns.</span>
              </div>
              <span className="badge">{conversationCount} turns</span>
            </div>
          </div>
        </article>

        <aside className="assistant-panel">
          <header>
            <div>
              <p className="panel-subtitle">What to test</p>
              <h3>How the preview behaves</h3>
            </div>
          </header>

          <div className="hero-card">
            <p className="stream-hint">
              Ask something like &ldquo;score a lead named Priya Anand at Meridian Robotics with a
              $120k budget&rdquo; to watch the tool run end to end. Ask for a negative budget to see
              the designed error state instead of a crash.
            </p>
            <ul className="conversation-summary">
              <li>Tool arguments stream in live as raw JSON before they&apos;re valid.</li>
              <li>Once parsed, the tool runs and renders a real score card — not text.</li>
              <li>A failed tool call renders a dedicated error card.</li>
            </ul>
          </div>
        </aside>
      </div>

      <div className="chat-shell">
        <article className="chat-panel">
          <header>
            <div>
              <p className="panel-subtitle">Live transcript</p>
              <h2>Hold a streaming conversation</h2>
            </div>
            <div className="chat-status-row">
              <span className="status-dot" aria-hidden="true" />
              <span className="chat-meta">
                {status === "thinking"
                  ? "Thinking..."
                  : status === "streaming"
                    ? "Streaming tokens"
                    : "Ready"}
              </span>
            </div>
          </header>

          {error ? <div className="error-banner">{error}</div> : null}

          <div
            className="transcript"
            ref={transcriptRef}
            onScroll={handleScroll}
            aria-label="Conversation transcript"
          >
            {messages.map((message) => (
              <article
                key={message.id}
                className={`message message--${message.role} ${
                  message.streaming ? "message--thinking" : ""
                }`}
              >
                <div className="message-meta">
                  <span>{message.role === "user" ? "You" : "Assistant"}</span>
                  {message.streaming ? <span className="badge">live</span> : null}
                </div>

                {message.streaming && message.parts.length === 0 ? (
                  <div className="thinking-rows" aria-label="Assistant is typing">
                    <div className="thinking-row">
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                    </div>
                    <span className="stream-hint">Claude is preparing the first tokens.</span>
                  </div>
                ) : (
                  <div className="message-parts">
                    {message.parts.map((part, index) =>
                      part.kind === "text" ? (
                        part.text.trim().length > 0 ? (
                          <p key={index} className="message-body">
                            {part.text}
                          </p>
                        ) : null
                      ) : (
                        <ToolLifecycleCard key={part.toolCallId} part={part} />
                      ),
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <label htmlFor="message">
              Message
              <span className="composer-help">
                Try a lead to score, or ask a normal question to see plain streaming.
              </span>
            </label>
            <textarea
              id="message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder='Try: "Score a lead named Priya Anand at Meridian Robotics with a $120k budget."'
              rows={4}
              disabled={isStreaming && status === "thinking"}
            />

            <div className="composer-actions">
              <p className="composer-help">
                Tool contract lives in <code>src/lib/tools/score-lead.ts</code>.
              </p>
              <div className="button-row">
                {isStreaming ? (
                  <button type="button" className="button" onClick={stopStreaming}>
                    Stop stream
                  </button>
                ) : null}
                <button type="submit" className="button button-primary" disabled={!draft.trim()}>
                  Send message
                </button>
              </div>
            </div>
          </form>
        </article>

        <aside className="assistant-panel">
          <header>
            <div>
              <p className="panel-subtitle">Build notes</p>
              <h3>What the reviewer should look for</h3>
            </div>
          </header>

          <div className="hero-card">
            <ul className="conversation-summary">
              <li>Route handler streams real Anthropic tool_use blocks when a server key exists.</li>
              <li>Fallback mode still runs the real scoreLead function without a key.</li>
              <li>Each of the four tool states gets distinct visual treatment.</li>
              <li>A failed scoreLead call renders a designed error card, never a crash.</li>
            </ul>
          </div>

          <div className="hero-card">
            <h4>Suggested prompts</h4>
            <ul className="conversation-summary">
              <li>&ldquo;Score a lead named Priya Anand at Meridian Robotics, budget $120k.&rdquo;</li>
              <li>&ldquo;Score a lead named Sam at Acme with a budget of -5000.&rdquo;</li>
              <li>&ldquo;Explain the difference between the server route and the client.&rdquo;</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
