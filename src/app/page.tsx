import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-sm font-medium tracking-[0.2em] text-zinc-500 uppercase">
          Steady
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Surgical Motion Trainer
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Hardware-free AI coaching for precise procedural movements using a
          laptop webcam, expert ghost demos, and deterministic motion evaluation.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/library"
          className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Open skills library
        </Link>
        <a
          href="/api/health"
          className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 px-5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Health check
        </a>
      </div>

      <p className="text-sm text-zinc-500">
        Read{" "}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-900">
          docs/IMPLEMENTATION_PLAN.md
        </code>{" "}
        and{" "}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-900">
          docs/CONTEXT.md
        </code>{" "}
        before coding.
      </p>
    </main>
  );
}
