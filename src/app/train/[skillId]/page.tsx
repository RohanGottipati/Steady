import Link from "next/link";
import { notFound } from "next/navigation";
import { TrainingSession } from "@/components/training/training-session";
import { getCatalogEntry, getSkillCatalog, getSkillDefinition } from "@/lib/skills/catalog";

// Prerender a static page per known skill (data-driven). Unknown ids fall back
// to on-demand rendering and 404 via notFound().
export function generateStaticParams() {
  return getSkillCatalog().map((skill) => ({ skillId: skill.id }));
}

export default async function TrainPage({
  params,
}: {
  params: Promise<{ skillId: string }>;
}) {
  const { skillId } = await params;
  const skill = getCatalogEntry(skillId);

  if (!skill) notFound();

  const definition = skill.status === "available" ? getSkillDefinition(skillId) : undefined;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <Link
        href="/library"
        className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        ← Library
      </Link>

      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {skill.title}
      </h1>
      <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
        {skill.description}
      </p>

      {skill.status === "coming-soon" || !definition ? (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">This skill is coming soon.</p>
          <p className="mt-1 text-sm">
            Its trainer scene is not available yet ({skill.sourceLabel}). Try Needle
            Passing or Peg Transfer to use the trainer.
          </p>
          <Link
            href="/library"
            className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
          >
            Back to library
          </Link>
        </div>
      ) : (
        <TrainingSession skill={skill} definition={definition} />
      )}
    </main>
  );
}
