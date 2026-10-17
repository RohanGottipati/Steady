const pulse = "motion-safe:animate-pulse motion-reduce:animate-none";

export default function LibraryLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12" aria-busy="true">
      <p role="status" className="text-sm text-zinc-500">
        Loading skills…
      </p>
      <div className={`mt-3 h-9 w-72 max-w-full rounded bg-zinc-200 dark:bg-zinc-800 ${pulse}`} />
      <div className={`mt-3 h-12 max-w-2xl rounded bg-zinc-100 dark:bg-zinc-900 ${pulse}`} />
      <div className={`mt-8 h-10 w-full max-w-sm rounded-md bg-zinc-100 dark:bg-zinc-900 ${pulse}`} />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className={`h-44 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 ${pulse}`}
          />
        ))}
      </div>
    </main>
  );
}
