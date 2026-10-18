import Link from "next/link";
import { SkillGrid } from "@/components/library/skill-grid";
import { getSkillCatalog } from "@/lib/skills/catalog";

export const metadata = {
  title: "Surgical Skills Library — Steady",
};

export default function LibraryPage() {
  const skills = getSkillCatalog();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="mb-8 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← Home
          </Link>
          <Link
            href="/progress"
            className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-700 hover:underline dark:hover:text-zinc-300"
          >
            Your progress
          </Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Surgical Skills Library
        </h1>
        <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
          Needle Passing is ready. The other skills are listed, but you cannot train them yet.
        </p>
      </div>

      <SkillGrid skills={skills} />
    </main>
  );
}
