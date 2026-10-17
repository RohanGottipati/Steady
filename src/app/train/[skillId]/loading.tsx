const pulse = "motion-safe:animate-pulse motion-reduce:animate-none";

export default function TrainSkillLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10" aria-busy="true">
      <p className="text-sm text-zinc-500">← Library</p>
      <p role="status" className="mt-2 text-sm text-zinc-500">
        Loading skill…
      </p>
      <div className={`mt-2 h-9 w-56 max-w-full rounded bg-zinc-200 dark:bg-zinc-800 ${pulse}`} />
      <div className={`mt-3 h-12 max-w-2xl rounded bg-zinc-100 dark:bg-zinc-900 ${pulse}`} />
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className={`h-20 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 ${pulse}`}
          />
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="h-10 w-32 rounded-md bg-zinc-900 dark:bg-zinc-100" />
      </div>
    </main>
  );
}
