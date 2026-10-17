import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-sm font-medium tracking-[0.2em] text-zinc-500 uppercase">
          Steady
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Surgical Motion Trainer
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Practice needle passing and peg transfer with your laptop camera. Watch the guide, then try the motion yourself.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/library"
          className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Choose a skill
        </Link>
      </div>
    </main>
  );
}
