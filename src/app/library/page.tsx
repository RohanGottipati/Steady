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
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← Home
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Surgical Skills Library
        </h1>
        <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
          Choose a skill to train. Each skill compares your webcam hand motion
          against an expert reference. Skills without a cleared reference are
          marked coming soon.
        </p>
      </div>

      <SkillGrid skills={skills} />
    </main>
  );
}
