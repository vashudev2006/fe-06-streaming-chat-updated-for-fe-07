import Link from "next/link";

export default function AboutPage() {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_60px_rgba(19,32,38,0.06)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
        Architecture notes
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">
        How the streaming chat is wired
      </h1>
      <div className="mt-4 grid gap-4 max-w-3xl text-base leading-7 text-[var(--muted)]">
        <p>
          The client owns the visible transcript and the stop button, while the
          server route owns the model selection and prompt. That split keeps the
          API key off the browser and mirrors the pattern the assignment asks for.
        </p>
        <p>
          If <code>ANTHROPIC_API_KEY</code> is available, the route proxies Claude
          and forwards each token as it arrives. If the key is missing, the same
          route falls back to a local stream so the preview still behaves like a
          live chat during review.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
        >
          Back to chat
        </Link>
      </div>
    </section>
  );
}
