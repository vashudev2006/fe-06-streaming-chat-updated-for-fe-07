import Link from "next/link";

export default function RoadmapPage() {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_60px_rgba(19,32,38,0.06)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
        Build plan
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">
        How the chat demo was assembled
      </h1>
      <ol className="mt-4 max-w-3xl space-y-3 text-base leading-7 text-[var(--muted)]">
        <li>Wire a server route that can stream tokens without exposing secrets.</li>
        <li>Build a client transcript that updates live and supports stopping mid-stream.</li>
        <li>Preserve conversation history so multiple turns remain reviewable.</li>
        <li>Round out the experience with responsive layout and submission notes.</li>
      </ol>

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
