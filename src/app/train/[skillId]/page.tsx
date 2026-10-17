import Link from "next/link";
import { notFound } from "next/navigation";
import { ModeSelector } from "@/components/training/mode-selector";
import { getCatalogEntry, getSkillCatalog } from "@/lib/skills/catalog";

// Prerender a static page per known skill (data-driven). Unknown ids fall back
// to on-demand rendering and 404 via notFound().
export function generateStaticParams() {
  return getSkillCatalog().map((skill) => ({ skillId: skill.id }));
}

// B1 STUB (shared file — coordinate with Person A).
// Person A replaces the placeholder below with the 3D scene, webcam preview,
// calibration, coaching, and live progress. This stub only provides the
// data-driven shell + mode selector so navigation works end to end.
export default async function TrainPage({
  params,
}: {
  params: Promise<{ skillId: string }>;
}) {
  const { skillId } = await params;
  const skill = getCatalogEntry(skillId);

  if (!skill) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
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

      {skill.status === "coming-soon" ? (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">This skill is coming soon.</p>
          <p className="mt-1 text-sm">
            Its expert reference ({skill.sourceLabel}) is not available yet. Try
            Needle Passing to see the trainer in action.
          </p>
          <Link
            href="/library"
            className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
          >
            Back to library
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-medium tracking-wide text-zinc-500 uppercase">
              Choose a mode
            </h2>
            <ModeSelector modes={skill.availableModes} />
          </section>

          <section className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
            3D trainer, webcam preview, and live coaching land here (Person A).
          </section>
        </div>
      )}
    </main>
  );
}
