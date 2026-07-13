import Link from "next/link";

export default function DeployPage() {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_60px_rgba(19,32,38,0.06)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
        Deployment checklist
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">
        What to verify before sending the link
      </h1>
      <ul className="mt-4 max-w-3xl space-y-3 text-base leading-7 text-[var(--muted)]">
        <li>The preview URL loads the home page without client errors.</li>
        <li>The transcript streams token by token and the stop button works.</li>
        <li>The API key stays in the server environment and never appears in the browser.</li>
        <li>The layout compresses to a one-column view on mobile screens.</li>
      </ul>

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
