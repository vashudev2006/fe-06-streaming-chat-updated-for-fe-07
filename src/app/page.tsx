import Link from "next/link";
import { Chat } from "@/components/chat";

const highlights = [
  {
    title: "Server route",
    body: "The route handler keeps the Anthropic key on the server and streams the result back as Server-Sent Events.",
  },
  {
    title: "Client stream",
    body: "The chat component reads the response incrementally, updates the assistant bubble, and exposes a stop button.",
  },
  {
    title: "Mobile-ready transcript",
    body: "The layout compresses to a one-column view on narrow screens so the conversation stays readable on a phone.",
  },
];

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_60px_rgba(19,32,38,0.06)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Assignment FE-06
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-[var(--text)] sm:text-5xl">
            Streaming chat that feels live, not bolted on.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
            This preview keeps the secret model config on the server, streams
            assistant tokens as they arrive, and preserves the full conversation
            across turns so reviewers can test the state flow end to end.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="#chat"
              className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
            >
              Open the chat
            </Link>
            <Link
              href="/about"
              className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-5 py-3 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Read the architecture notes
            </Link>
          </div>
        </div>

        <aside className="rounded-[32px] border border-[var(--border)] bg-[var(--surface-strong)] p-6 shadow-[0_24px_60px_rgba(19,32,38,0.06)] sm:p-8">
          <p className="text-sm font-semibold text-[var(--text)]">Review map</p>
          <div className="mt-5 space-y-3">
            {highlights.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <h2 className="text-sm font-semibold tracking-[-0.02em]">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.body}</p>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <Chat />
    </div>
  );
}
